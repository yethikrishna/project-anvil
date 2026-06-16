/**
 * POST /api/upload — streaming multipart upload with processing pipeline.
 *
 * Flow:
 * 1. Parse multipart (file buffer)
 * 2. processPhoto → thumbnail + preview + pHash
 * 3. Upload all variants to S3/MinIO
 * 4. Insert metadata to PostgreSQL
 * 5. Check for duplicates (pHash)
 * 6. Return photo record
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { photos } from '@/lib/schema';
import { uploadPhoto, photoKeys } from '@/lib/storage';
import { processPhoto, generateAiTags } from '@/lib/processor';
import { pHashDistance, DUPLICATE_THRESHOLD } from '@/lib/exif';
import { eq, sql } from 'drizzle-orm';

const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/heic',
  'image/heif', 'image/tiff', 'image/avif', 'image/gif',
]);

const MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

export async function POST(req: NextRequest) {
  try {
    // Parse multipart form data
    const form = await req.formData();
    const file = form.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!ALLOWED_MIME.has(file.type)) {
      return NextResponse.json({ error: `Unsupported file type: ${file.type}` }, { status: 400 });
    }

    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: 'File too large (max 50 MB)' }, { status: 413 });
    }

    const userId = 'demo-user'; // TODO: from auth session
    const photoId = crypto.randomUUID();
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    const keys = photoKeys(userId, photoId, ext);

    // Read buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Process: resize, thumbnail, preview, pHash, EXIF
    const processed = await processPhoto(buffer, file.type);

    // AI tags
    const { tags, scene, description } = await generateAiTags({
      mimeType: file.type,
      exif: processed.exif,
    });

    // Upload all variants to S3/MinIO in parallel
    await Promise.all([
      uploadPhoto(keys.original, processed.originalBuffer, file.type),
      uploadPhoto(keys.thumbnail, processed.thumbnailBuffer, 'image/webp'),
      uploadPhoto(keys.preview, processed.previewBuffer, 'image/webp'),
    ]);

    // Duplicate detection: find photos with close pHash
    let duplicateFound = false;
    if (processed.pHash) {
      // Get all pHashes for this user (within last 30 days for performance)
      const existing = await db
        .select({ id: photos.id, pHash: photos.pHash })
        .from(photos)
        .where(eq(photos.userId, userId))
        .limit(1000);

      for (const p of existing) {
        if (p.pHash && pHashDistance(processed.pHash, p.pHash) <= DUPLICATE_THRESHOLD) {
          duplicateFound = true;
          // Record duplicate pair (best-effort)
          await db.execute(sql`
            INSERT INTO photo_duplicates (photo_a_id, photo_b_id, distance)
            VALUES (${photoId}, ${p.id}, ${pHashDistance(processed.pHash, p.pHash)})
            ON CONFLICT DO NOTHING
          `).catch(() => null);
          break;
        }
      }
    }

    // Insert photo record
    await db.insert(photos).values({
      id: photoId,
      userId,
      filename: `${photoId}.${ext}`,
      originalName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      width: processed.width || processed.exif.width,
      height: processed.height || processed.exif.height,
      storageKey: keys.original,
      thumbnailKey: keys.thumbnail,
      previewKey: keys.preview,
      takenAt: processed.exif.takenAt,
      camera: processed.exif.camera,
      focalLength: processed.exif.focalLength,
      aperture: processed.exif.aperture,
      iso: processed.exif.iso,
      shutterSpeed: processed.exif.shutterSpeed,
      lat: processed.exif.lat,
      lng: processed.exif.lng,
      aiTags: tags,
      description,
      sceneType: scene,
      pHash: processed.pHash,
    });

    return NextResponse.json({
      id: photoId,
      filename: `${photoId}.${ext}`,
      mimeType: file.type,
      width: processed.width,
      height: processed.height,
      aiTags: tags,
      description,
      sceneType: scene,
      isFavourite: false,
      isArchived: false,
      isDuplicate: duplicateFound,
      takenAt: processed.exif.takenAt?.toISOString(),
      camera: processed.exif.camera,
      lat: processed.exif.lat,
      lng: processed.exif.lng,
      createdAt: new Date().toISOString(),
    }, { status: 201 });

  } catch (err) {
    console.error('[upload/POST]', err);
    const msg = err instanceof Error ? err.message : 'Upload failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

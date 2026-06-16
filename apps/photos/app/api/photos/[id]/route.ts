/**
 * GET    /api/photos/[id]  — single photo with full metadata + signed URLs
 * PATCH  /api/photos/[id]  — update photo (favourite, description, tags)
 * DELETE /api/photos/[id]  — soft-delete (move to trash)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { photos } from '@/lib/schema';
import { getPhotoUrl } from '@/lib/storage';
import { eq, and } from 'drizzle-orm';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const userId = 'demo-user';

  const [photo] = await db
    .select()
    .from(photos)
    .where(and(eq(photos.id, id), eq(photos.userId, userId), eq(photos.isDeleted, false)));

  if (!photo) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [thumbnailUrl, previewUrl, originalUrl] = await Promise.all([
    photo.thumbnailKey ? getPhotoUrl(photo.thumbnailKey, 3600) : Promise.resolve(undefined),
    photo.previewKey ? getPhotoUrl(photo.previewKey, 3600) : Promise.resolve(undefined),
    getPhotoUrl(photo.storageKey, 3600),
  ]);

  return NextResponse.json({
    id: photo.id,
    filename: photo.filename,
    originalName: photo.originalName,
    mimeType: photo.mimeType,
    sizeBytes: photo.sizeBytes,
    width: photo.width,
    height: photo.height,
    thumbnailUrl,
    previewUrl,
    originalUrl,
    takenAt: photo.takenAt?.toISOString(),
    camera: photo.camera,
    focalLength: photo.focalLength,
    aperture: photo.aperture,
    iso: photo.iso,
    shutterSpeed: photo.shutterSpeed,
    lat: photo.lat,
    lng: photo.lng,
    locationName: photo.locationName,
    aiTags: photo.aiTags ?? [],
    description: photo.description,
    sceneType: photo.sceneType,
    isFavourite: photo.isFavourite,
    isArchived: photo.isArchived,
    createdAt: photo.createdAt.toISOString(),
    updatedAt: photo.updatedAt.toISOString(),
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const userId = 'demo-user';
  const body = await req.json();

  const allowed: (keyof typeof photos.$inferInsert)[] = [
    'isFavourite', 'isArchived', 'description', 'aiTags', 'locationName',
  ];
  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) update[key] = body[key];
  }
  update.updatedAt = new Date();

  await db
    .update(photos)
    .set(update)
    .where(and(eq(photos.id, id), eq(photos.userId, userId)));

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const userId = 'demo-user';

  await db
    .update(photos)
    .set({ isDeleted: true, deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(photos.id, id), eq(photos.userId, userId)));

  return NextResponse.json({ ok: true });
}

/**
 * Photo processing pipeline (server-side).
 *
 * On upload:
 * 1. Extract EXIF + dimensions
 * 2. Generate thumbnail (400×400 WebP, crop centre)
 * 3. Generate preview (1080px long edge WebP)
 * 4. Compute pHash for duplicate detection
 * 5. Store all variants to S3/MinIO
 *
 * Uses sharp (if available) or falls back to ImageMagick via exec.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { writeFile, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { extractExif, computePHashFromPixels } from './exif';

const execFileAsync = promisify(execFile);

export interface ProcessedPhoto {
  originalBuffer: Buffer;
  thumbnailBuffer: Buffer;
  previewBuffer: Buffer;
  width: number;
  height: number;
  pHash: string;
  exif: Awaited<ReturnType<typeof extractExif>>;
}

/**
 * Process a photo upload.
 * Returns original + resized variants as Buffers.
 */
export async function processPhoto(inputBuffer: Buffer, mimeType: string): Promise<ProcessedPhoto> {
  // Try sharp first (faster, native)
  try {
    return await processWithSharp(inputBuffer, mimeType);
  } catch {
    // Fall back to ImageMagick/ffmpeg
    return processWithImageMagick(inputBuffer, mimeType);
  }
}

async function processWithSharp(inputBuffer: Buffer, _mimeType: string): Promise<ProcessedPhoto> {
  // Dynamic import — sharp is optional dep
  const sharp = (await import('sharp')).default;

  const image = sharp(inputBuffer, { failOn: 'none' });
  const meta = await image.metadata();

  const width = meta.width ?? 0;
  const height = meta.height ?? 0;

  // Thumbnail: 400×400 WebP, cover crop
  const thumbnailBuffer = await image
    .clone()
    .resize(400, 400, { fit: 'cover', position: 'attention' })
    .webp({ quality: 80 })
    .toBuffer();

  // Preview: 1080px long edge, WebP
  const previewBuffer = await image
    .clone()
    .resize(1080, 1080, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer();

  // pHash: 8×8 greyscale
  const pixelData = await image
    .clone()
    .greyscale()
    .resize(8, 8, { fit: 'fill' })
    .raw()
    .toBuffer();
  const pixels8x8 = Array.from(pixelData);
  const pHash = computePHashFromPixels(pixels8x8);

  const exif = await extractExif(inputBuffer.buffer as ArrayBuffer);
  if (!exif.width) exif.width = width;
  if (!exif.height) exif.height = height;

  return { originalBuffer: inputBuffer, thumbnailBuffer, previewBuffer, width, height, pHash, exif };
}

async function processWithImageMagick(inputBuffer: Buffer, _mimeType: string): Promise<ProcessedPhoto> {
  const id = crypto.randomUUID();
  const inputPath = path.join(tmpdir(), `${id}-input.jpg`);
  const thumbPath = path.join(tmpdir(), `${id}-thumb.webp`);
  const previewPath = path.join(tmpdir(), `${id}-preview.webp`);
  const hashPath = path.join(tmpdir(), `${id}-hash.png`);

  try {
    await writeFile(inputPath, inputBuffer);

    // Thumbnail 400×400
    await execFileAsync('convert', [
      inputPath,
      '-auto-orient',
      '-thumbnail', '400x400^',
      '-gravity', 'center',
      '-extent', '400x400',
      '-quality', '80',
      thumbPath,
    ]);

    // Preview 1080px
    await execFileAsync('convert', [
      inputPath,
      '-auto-orient',
      '-resize', '1080x1080>',
      '-quality', '85',
      previewPath,
    ]);

    // 8×8 for pHash
    await execFileAsync('convert', [
      inputPath,
      '-auto-orient',
      '-colorspace', 'gray',
      '-resize', '8x8!',
      '-depth', '8',
      hashPath,
    ]);

    const [thumbBuf, previewBuf, hashBuf] = await Promise.all([
      readFile(thumbPath),
      readFile(previewPath),
      readFile(hashPath),
    ]);

    // Read PNG pixel values
    const pixels8x8 = Array.from(hashBuf).slice(0, 64);
    const pHash = computePHashFromPixels(pixels8x8.length === 64 ? pixels8x8 : Array(64).fill(128));

    const exif = await extractExif(inputBuffer.buffer as ArrayBuffer);

    // Get dimensions from convert identify
    const { stdout } = await execFileAsync('identify', ['-format', '%wx%h', inputPath]);
    const [w, h] = stdout.trim().split('x').map(Number);
    exif.width = w || 0;
    exif.height = h || 0;

    return {
      originalBuffer: inputBuffer,
      thumbnailBuffer: thumbBuf,
      previewBuffer: previewBuf,
      width: exif.width,
      height: exif.height,
      pHash,
      exif,
    };
  } finally {
    await Promise.allSettled([
      unlink(inputPath),
      unlink(thumbPath),
      unlink(previewPath),
      unlink(hashPath),
    ]);
  }
}

/** Generate AI tags via simple heuristics (or integrate OpenAI Vision) */
export async function generateAiTags(photo: {
  mimeType: string;
  exif: Awaited<ReturnType<typeof extractExif>>;
}): Promise<{ tags: string[]; scene: string; description: string }> {
  const tags: string[] = [];
  const { exif } = photo;

  // Camera-based tags
  if (exif.camera) {
    if (/iphone/i.test(exif.camera)) tags.push('iPhone');
    else if (/samsung/i.test(exif.camera)) tags.push('Samsung');
    else if (/canon/i.test(exif.camera)) tags.push('Canon');
    else if (/nikon/i.test(exif.camera)) tags.push('Nikon');
    else if (/sony/i.test(exif.camera)) tags.push('Sony');
    tags.push('Camera photo');
  }

  // Time of day tags
  if (exif.takenAt) {
    const hour = new Date(exif.takenAt).getHours();
    if (hour >= 5 && hour < 9) tags.push('Morning', 'Golden hour');
    else if (hour >= 9 && hour < 12) tags.push('Morning');
    else if (hour >= 12 && hour < 14) tags.push('Noon');
    else if (hour >= 17 && hour < 20) tags.push('Golden hour', 'Evening');
    else if (hour >= 20 || hour < 5) tags.push('Night');
  }

  // Geo-based scene inference
  let scene = 'general';
  if (exif.lat != null && exif.lng != null) {
    tags.push('Geotagged');
    // Very rough: detect coastal areas
    if (Math.abs(exif.lat) < 40 && (exif.lng < -70 || exif.lng > 120)) {
      scene = 'outdoor';
      tags.push('Outdoor');
    }
  }

  // Exposure-based
  if (exif.iso && exif.iso > 1600) tags.push('Low light');
  if (exif.focalLength && exif.focalLength < 24) tags.push('Wide angle');
  if (exif.focalLength && exif.focalLength > 200) tags.push('Telephoto');

  return {
    tags: [...new Set(tags)],
    scene,
    description: tags.length > 0
      ? `Photo taken ${exif.takenAt ? `on ${new Date(exif.takenAt).toLocaleDateString()}` : 'recently'}`
      : 'Uploaded photo',
  };
}

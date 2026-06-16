/**
 * Storage helpers — S3/MinIO operations for photo blobs.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({
  region: process.env.S3_REGION ?? 'us-east-1',
  endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY ?? 'anvil',
    secretAccessKey: process.env.S3_SECRET_KEY ?? 'anvil_secret',
  },
});

const BUCKET = process.env.PHOTOS_BUCKET ?? 'anvil-photos';

export async function uploadPhoto(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
): Promise<void> {
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
    ServerSideEncryption: 'AES256',
  }));
}

export async function getPhotoUrl(key: string, expiresIn = 3600): Promise<string> {
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    { expiresIn },
  );
}

export async function deletePhoto(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

export async function photoExists(key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

/** Build storage keys for a photo */
export function photoKeys(userId: string, photoId: string, ext: string) {
  return {
    original: `${userId}/originals/${photoId}.${ext}`,
    thumbnail: `${userId}/thumbnails/${photoId}.webp`,
    preview: `${userId}/previews/${photoId}.webp`,
  };
}

/**
 * Drive API — S3 / MinIO storage layer
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const BUCKET = process.env.MINIO_BUCKET ?? 'anvil-drive';
const ENDPOINT = process.env.MINIO_ENDPOINT ?? 'http://localhost:9000';
const ACCESS_KEY = process.env.MINIO_ACCESS_KEY ?? 'anvil_minio';
const SECRET_KEY = process.env.MINIO_SECRET_KEY ?? 'anvil_minio_secret';

export const s3 = new S3Client({
  endpoint: ENDPOINT,
  region: 'us-east-1',
  credentials: {
    accessKeyId: ACCESS_KEY,
    secretAccessKey: SECRET_KEY,
  },
  forcePathStyle: true,
});

/**
 * Ensure the drive bucket exists; create it if missing.
 */
export async function ensureBucket(): Promise<void> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: '__probe__' }));
  } catch {
    // Bucket likely doesn't exist — try creating it
    try {
      await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
      console.log(`📦 Created S3 bucket: ${BUCKET}`);
    } catch {
      // May already exist (race), ignore
    }
  }
}

/**
 * Upload a file buffer to S3.
 * Returns the S3 key used for storage.
 */
export async function uploadFile(
  key: string,
  body: Buffer | Uint8Array,
  contentType?: string
): Promise<string> {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
  return key;
}

/**
 * Get a presigned download URL (default 1 hour expiry).
 */
export async function getDownloadUrl(key: string, expiresIn = 3600): Promise<string> {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(s3, command, { expiresIn });
}

/**
 * Delete a file from S3.
 */
export async function deleteFile(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

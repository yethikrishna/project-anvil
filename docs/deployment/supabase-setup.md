# Supabase Storage Setup — Project Anvil

## Overview

[Supabase](https://supabase.com) provides an S3-compatible object storage service (built on top of their Postgres platform). This guide replaces MinIO for production file storage in Drive.

## Why Supabase Storage?

| Feature | MinIO (self-hosted) | Supabase Storage |
|---------|-------------------|------------------|
| Setup | Docker container + config | Zero config, instant |
| S3 API | Full | Compatible subset |
| CDN | Manual (CloudFront) | Built-in global CDN |
| Auth | Manual IAM policies | Row-Level Security (RLS) |
| Free tier | N/A | 1 GB storage, 5 GB bandwidth |
| Image transforms | No | Built-in (resize, crop, format) |
| Presigned URLs | Manual | Built-in |

## Setup

### 1. Create a Supabase Project

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Create project (or use dashboard at https://app.supabase.com)
# Note: Project creation is done via the web dashboard
```

### 2. Create Storage Bucket

```sql
-- Run in Supabase SQL Editor (Dashboard → SQL Editor)

-- Create the anvil-drive bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'anvil-drive',
  'anvil-drive',
  false,  -- Private: access via signed URLs only
  52428800,  -- 50 MB limit
  ARRAY[
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'text/csv', 'text/markdown',
    'application/zip',
    'video/mp4', 'audio/mpeg'
  ]
);
```

### 3. Configure Row-Level Security

```sql
-- Enable RLS on storage objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Users can only see their own files
CREATE POLICY "Users can view own files"
  ON storage.objects FOR SELECT
  USING (auth.uid()::text = (storage.foldername(name))[1]);

-- Users can upload to their own folder
CREATE POLICY "Users can upload to own folder"
  ON storage.objects FOR INSERT
  WITH CHECK (auth.uid()::text = (storage.foldername(name))[1]);

-- Users can update their own files
CREATE POLICY "Users can update own files"
  ON storage.objects FOR UPDATE
  USING (auth.uid()::text = (storage.foldername(name))[1]);

-- Users can delete their own files
CREATE POLICY "Users can delete own files"
  ON storage.objects FOR DELETE
  USING (auth.uid()::text = (storage.foldername(name))[1]);
```

### 4. Configure Environment Variables

```env
# .env.production
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_KEY=eyJhbGci...   # Server-side only
S3_ENDPOINT=https://your-project.supabase.co/storage/v1
S3_ACCESS_KEY=<from-supabase-dashboard>
S3_SECRET_KEY=<from-supabase-dashboard>
S3_BUCKET=anvil-drive
S3_REGION=us-east-1
```

### 5. Update Drive API

The Drive API already uses S3-compatible storage. Update the client:

```typescript
// apps/drive/api/src/storage.ts
import { S3Client } from '@aws-sdk/client-s3';

export const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,  // Supabase Storage URL
  region: process.env.S3_REGION ?? 'us-east-1',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY!,
    secretAccessKey: process.env.S3_SECRET_KEY!,
  },
  forcePathStyle: true,  // Required for Supabase
});
```

### 6. Generate Presigned URLs

```typescript
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

// Upload URL (client-side direct upload)
async function getUploadUrl(key: string, contentType: string) {
  return getSignedUrl(s3, new PutObjectCommand({
    Bucket: 'anvil-drive',
    Key: key,
    ContentType: contentType,
  }), { expiresIn: 3600 });
}

// Download URL
async function getDownloadUrl(key: string) {
  return getSignedUrl(s3, new GetObjectCommand({
    Bucket: 'anvil-drive',
    Key: key,
  }), { expiresIn: 3600 });
}
```

### 7. Image Transformations (Bonus)

Supabase provides built-in image transforms via URL parameters:

```typescript
// Thumbnail URL with transformation
const thumbnailUrl = `${SUPABASE_URL}/storage/v1/render/image/public/anvil-drive/${key}?width=200&height=200&resize=cover`;
```

## Folder Structure

```
anvil-drive/
  ├── {user-id}/
  │   ├── documents/
  │   │   ├── report.pdf
  │   │   └── notes.md
  │   ├── images/
  │   │   ├── photo.jpg
  │   │   └── screenshot.png
  │   └── uploads/
  │       └── data.csv
  └── shared/
      └── {share-id}/
          └── public-file.pdf
```

## Migration from MinIO

```bash
# 1. Install aws-cli
pip install awscli

# 2. Configure for MinIO
aws configure --profile minio
# endpoint: http://localhost:9000
# access_key: minioadmin
# secret_key: minioadmin

# 3. Sync to Supabase
aws s3 sync s3://anvil-drive/ s3://anvil-drive/ \
  --endpoint-url https://your-project.supabase.co/storage/v1 \
  --profile supabase
```

## Cost Estimate

| Tier | Storage | Bandwidth | Price |
|------|---------|-----------|-------|
| Free | 1 GB | 5 GB/month | $0 |
| Pro | 100 GB | 250 GB/month | $25/month |
| Pay-as-you-go | $0.021/GB | $0.09/GB | Variable |

**Estimated Anvil cost:** $0-25/month depending on usage.

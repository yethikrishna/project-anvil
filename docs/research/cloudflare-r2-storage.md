# Cloudflare R2 as Managed Storage

**Date:** 2026-05-21
**Status:** Evaluated + Configuration Ready

---

## Why R2?

- 10 GB free storage per month
- **Free egress** (no bandwidth charges — unique among cloud providers)
- S3-compatible API (drop-in replacement for MinIO)
- Global CDN included
- No infrastructure management

---

## Configuration

```typescript
// Replace MinIO with R2 for demo deployment
// .env.production
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=<r2-access-key>
S3_SECRET_ACCESS_KEY=<r2-secret-key>
S3_BUCKET=anvil-drive
S3_REGION=auto
```

### S3 Client (Works with both MinIO and R2)

```typescript
// packages/storage/src/index.ts
import { S3Client } from '@aws-sdk/client-s3';

export const storage = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION || 'auto',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
});
```

---

## Cost Comparison

| Provider | 10GB Storage | 100GB Egress | Total/month |
|----------|-------------|--------------|-------------|
| AWS S3 | $0.23 | $8.50 | $8.73 |
| MinIO (VPS) | $0 | $0 | $5-10 (VPS) |
| **Cloudflare R2** | **$0** | **$0** | **$0** |

---

## Recommendation

**For demo:** Use R2. Free, fast, no ops.

**For self-hosted:** Keep MinIO in Docker Compose.

---

## Files
| File | Purpose |
|------|---------|
| `docs/research/cloudflare-r2-storage.md` | This document |

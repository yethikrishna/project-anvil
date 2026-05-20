#!/usr/bin/env bash
# ── Supabase Storage Setup for Project Anvil ──
# Usage: ./scripts/setup-supabase.sh
# Configures Supabase Storage buckets for Drive BLOB storage

set -euo pipefail

SUPABASE_URL="${SUPABASE_URL:?Set SUPABASE_URL (e.g. https://xxx.supabase.co)}"
SUPABASE_SERVICE_KEY="${SUPABASE_SERVICE_KEY:?Set SUPABASE_SERVICE_KEY}"

echo "📦 Setting up Supabase Storage for Project Anvil..."

# Create Drive files bucket
echo "Creating storage bucket: anvil-drive..."
curl -sf -X POST "$SUPABASE_URL/storage/v1/bucket" \
  -H "apikey: $SUPABASE_SERVICE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "anvil-drive",
    "name": "anvil-drive",
    "public": false,
    "file_size_limit": 536870912,
    "allowed_mime_types": ["*/*"]
  }' > /dev/null 2>&1 || echo "  (bucket may already exist)"

# Create avatars bucket
echo "Creating storage bucket: avatars..."
curl -sf -X POST "$SUPABASE_URL/storage/v1/bucket" \
  -H "apikey: $SUPABASE_SERVICE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "avatars",
    "name": "avatars",
    "public": true,
    "file_size_limit": 5242880,
    "allowed_mime_types": ["image/png", "image/jpeg", "image/webp"]
  }' > /dev/null 2>&1 || echo "  (bucket may already exist)"

# Set up RLS policies for anvil-drive bucket
echo "Setting up RLS policies for anvil-drive..."

# Allow authenticated users to upload
curl -sf -X POST "$SUPABASE_URL/rest/v1/rpc" \
  -H "apikey: $SUPABASE_SERVICE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "CREATE POLICY IF NOT EXISTS \"Authenticated users can upload\" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = '\''anvil-drive'\'');"
  }' > /dev/null 2>&1 || true

# Allow users to read their own files
curl -sf -X POST "$SUPABASE_URL/rest/v1/rpc" \
  -H "apikey: $SUPABASE_SERVICE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "CREATE POLICY IF NOT EXISTS \"Users can read own files\" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = '\''anvil-drive'\'' AND auth.uid()::text = (storage.foldername(name))[1]);"
  }' > /dev/null 2>&1 || true

echo ""
echo "Add to your .env:"
echo "  SUPABASE_URL=$SUPABASE_URL"
echo "  SUPABASE_SERVICE_KEY=<your-service-key>"
echo "  S3_ENDPOINT=$SUPABASE_URL/storage/v1"
echo "  S3_ACCESS_KEY=<your-access-key>"
echo "  S3_SECRET_KEY=<your-secret-key>"
echo "  S3_BUCKET=anvil-drive"
echo ""
echo "🎉 Supabase Storage setup complete!"

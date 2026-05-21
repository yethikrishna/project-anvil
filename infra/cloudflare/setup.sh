#!/usr/bin/env bash
# ── Cloudflare Infrastructure Setup ──
# Creates all required KV namespaces, R2 buckets, and D1 databases.
# Run once per environment.

set -euo pipefail

ENV="${1:-production}"
echo "Setting up Cloudflare infrastructure for: $ENV"

# ── KV Namespaces ──

echo "Creating KV namespace: anvil-kv-sessions"
wrangler kv namespace create "anvil-kv-sessions" --env "$ENV" 2>/dev/null || echo "  Already exists or error (non-fatal)"

echo "Creating KV namespace: anvil-kv-cache"
wrangler kv namespace create "anvil-kv-cache" --env "$ENV" 2>/dev/null || echo "  Already exists or error (non-fatal)"

# ── R2 Buckets ──

echo "Creating R2 bucket: anvil-r2-drive"
wrangler r2 bucket create "anvil-r2-drive" 2>/dev/null || echo "  Already exists or error (non-fatal)"

if [ "$ENV" = "staging" ]; then
  echo "Creating R2 bucket: anvil-r2-drive-staging"
  wrangler r2 bucket create "anvil-r2-drive-staging" 2>/dev/null || echo "  Already exists or error (non-fatal)"
fi

# ── D1 Database ──

echo "Creating D1 database: anvil-d1-metadata"
wrangler d1 create "anvil-d1-metadata" 2>/dev/null || echo "  Already exists or error (non-fatal)"

# ── Secrets ──

echo ""
echo "⚠️  Set the following secrets via 'wrangler secret put':"
echo "  - MEILISEARCH_URL"
echo "  - MEILISEARCH_API_KEY"
echo "  - NEON_DATABASE_URL"
echo "  - BACKEND_URL"
echo "  - OPENAI_API_KEY"
echo ""
echo "✅ Infrastructure setup complete for: $ENV"
echo ""
echo "Next: Update wrangler.infra.toml with the IDs output above."

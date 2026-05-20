#!/usr/bin/env bash
# ── Neon PostgreSQL Setup for Project Anvil ──
# Usage: ./scripts/setup-neon.sh
# Requires: neon CLI (npm i -g neonctl) or curl

set -euo pipefail

NEON_API_KEY="${NEON_API_KEY:?Set NEON_API_KEY to your Neon API key}"
NEON_PROJECT_NAME="${NEON_PROJECT_NAME:-anvil-db}"
REGION="${NEON_REGION:-aws-us-east-2}"

echo "🐘 Setting up Neon PostgreSQL for Project Anvil..."

# Create project
echo "Creating Neon project: $NEON_PROJECT_NAME..."
PROJECT_RESPONSE=$(curl -sf -X POST "https://console.neon.tech/api/v2/projects" \
  -H "Authorization: Bearer $NEON_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"project\": {
      \"name\": \"$NEON_PROJECT_NAME\",
      \"regionId\": \"$REGION\",
      \"pgVersion\": 16
    }
  }")

PROJECT_ID=$(echo "$PROJECT_RESPONSE" | jq -r '.project.id')
CONNECTION_STRING=$(echo "$PROJECT_RESPONSE" | jq -r '.connectionUris[0].connectionUri')

echo "✅ Project created: $PROJECT_ID"
echo "📌 Connection string: $CONNECTION_STRING"

# Create databases for each app
for APP in drive docs gmail; do
  echo "Creating database: $APP..."
  curl -sf -X POST "https://console.neon.tech/api/v2/projects/$PROJECT_ID/databases" \
    -H "Authorization: Bearer $NEON_API_KEY" \
    -H "Content-Type: application/json" \
    -d "{
      \"database\": {
        \"name\": \"${APP}\",
        \"ownerId\": \"$PROJECT_ID\"
      }
    }" > /dev/null 2>&1 || echo "  (database may already exist)"
done

# Run migrations (if drizzle-kit is available)
echo ""
echo "To run migrations for each app:"
echo "  cd apps/drive/api && npx drizzle-kit push"
echo "  cd apps/docs/api && npx drizzle-kit push"
echo ""
echo "Add to your .env:"
echo "  DATABASE_URL=$CONNECTION_STRING"
echo ""
echo "🎉 Neon setup complete!"

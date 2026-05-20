#!/usr/bin/env bash
# ── Pre-build API Client Generation ──
# Generates TypeScript API client from OpenAPI 3.1 spec using @hey-api/openapi-ts
# Run: ./scripts/generate-api-client.sh

set -euo pipefail

SPEC_FILE="${1:-packages/api-client/openapi.yaml}"
OUTPUT_DIR="${2:-packages/api-client/src/generated}"

echo "🔧 Generating API client from OpenAPI spec..."
echo "   Spec: $SPEC_FILE"
echo "   Output: $OUTPUT_DIR"

if [ ! -f "$SPEC_FILE" ]; then
  echo "❌ Spec file not found: $SPEC_FILE"
  echo "   Create one first, e.g.:"
  echo "   npx @hey-api/openapi-ts --init"
  exit 1
fi

# Install @hey-api/openapi-ts if not present
if ! npx @hey-api/openapi-ts --version > /dev/null 2>&1; then
  echo "📦 Installing @hey-api/openapi-ts..."
  pnpm add -Dw @hey-api/openapi-ts
fi

# Generate the client
npx @hey-api/openapi-ts \
  --input "$SPEC_FILE" \
  --output "$OUTPUT_DIR" \
  --client axios \
  --format prettier \
  --lint

echo "✅ API client generated at $OUTPUT_DIR"
echo ""
echo "Import in your app:"
echo "  import { client } from '@anvil/api-client/generated'"

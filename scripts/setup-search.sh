#!/usr/bin/env bash
# Meilisearch + Hybrid Search Setup Script
# Run: bash scripts/setup-search.sh

set -euo pipefail

echo "🔧 Setting up Meilisearch for Anvil Search..."

# ─── Meilisearch ───
echo ""
echo "1. Starting Meilisearch (Docker)..."
echo "   docker run -d --name meilisearch -p 7700:7700 -v meili_data:/meili_data getmeili/meilisearch:latest"
echo ""
echo "   Or add to docker-compose.yml:"
cat <<'EOF'
  meilisearch:
    image: getmeili/meilisearch:latest
    ports:
      - "7700:7700"
    volumes:
      - meili_data:/meili_data
    environment:
      - MEILI_MASTER_KEY=anvil_master_key_dev
      - MEILI_ENV=development
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:7700/health"]
      interval: 10s
      timeout: 5s
      retries: 5
EOF

# ─── MiniLM Embedding Service ───
echo ""
echo "2. Setting up MiniLM semantic embedding service..."
echo ""
echo "   Option A: Python microservice (recommended for production)"
cat <<'PYEOF'

# semantic_search.py — MiniLM embedding server
# pip install fastapi uvicorn sentence-transformers

from fastapi import Fastify
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
import uvicorn

app = FastAPI(title="Anvil Semantic Search")
model = SentenceTransformer("all-MiniLM-L6-v2")

class EmbedRequest(BaseModel):
    texts: list[str]

class EmbedResponse(BaseModel):
    embeddings: list[list[float]]

@app.post("/embed", response_model=EmbedResponse)
async def embed(req: EmbedRequest):
    vectors = model.encode(req.texts, normalize_embeddings=True)
    return EmbedResponse(embeddings=vectors.tolist())

@app.get("/health")
async def health():
    return {"status": "ok"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=4016)
PYEOF

echo ""
echo "   Option B: Use meilisearch built-in vector search (experimental)"
echo "   Add to meilisearch index settings:"
cat <<'EOF'
    "embedders": {
      "default": {
        "source": "huggingFace",
        "model": "sentence-transformers/all-MiniLM-L6-v2"
      }
    }
EOF

echo ""
echo "3. Hybrid search setup (BM25 + vector):"
cat <<'JSEOF'
// hybrid_search.js — Example hybrid search query
const { MeiliSearch } = require('meilisearch');

const client = new MeiliSearch({ host: 'http://localhost:7700', apiKey: 'anvil_master_key_dev' });

async function hybridSearch(query) {
  const index = client.index('anvil_pages');

  // BM25 text search
  const bm25Results = await index.search(query, { limit: 20 });

  // Vector search (requires embedder configured)
  const vectorResults = await index.search(query, {
    hybrid: { embedder: 'default', semanticRatio: 0.5 },
    limit: 20,
  });

  return { bm25: bm25Results, hybrid: vectorResults };
}
JSEOF

echo ""
echo "✅ Setup guide complete. Follow the steps above to configure search."

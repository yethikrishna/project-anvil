# Cloudflare Deployment Infrastructure

This directory contains Cloudflare deployment configs for Project Anvil.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Cloudflare Edge                     │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │  KV       │  │  R2      │  │  D1      │          │
│  │ Sessions  │  │ Drive    │  │ Metadata │          │
│  │ Cache     │  │ BLOBs    │  │ (edge)   │          │
│  └──────────┘  └──────────┘  └──────────┘          │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │          Edge Router (Workers)                │   │
│  │  search, geocode, route, auth validation     │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐     │
│  │Search│ │Docs  │ │Drive │ │Gmail │ │Maps  │ ... │
│  │Pages │ │Pages │ │Pages │ │Pages │ │Pages │     │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘     │
└─────────────────────────────────────────────────────┘
         │                    │
    Self-hosted mode:    Neon PostgreSQL
    Express/Fastify      (Docker / Cloud)
    backends
```

## Decision: D1 vs Neon

**Neon** for production metadata storage:
- Full PostgreSQL compatibility (existing Prisma/Drizzle schemas work unchanged)
- Neon's serverless driver works at edge (`@neondatabase/serverless`)
- D1 is SQLite-based — would require schema rewriting for all 11 apps
- Neon free tier: 0.5GB storage, 100 hours compute/month
- D1 kept as optional for lightweight edge-only use cases (session cache, feature flags)

## Resources Created

| Resource | Type | Purpose |
|----------|------|---------|
| `anvil-kv-sessions` | KV Namespace | Session caching at edge |
| `anvil-kv-cache` | KV Namespace | API response caching |
| `anvil-r2-drive` | R2 Bucket | Drive BLOB storage |
| `anvil-d1-metadata` | D1 Database | Edge metadata (optional) |
| `anvil-edge-router` | Worker | Unified API gateway |

## Deployment Commands

```bash
# Deploy everything
pnpm deploy:cf

# Deploy individual components
pnpm deploy:cf:router     # Edge router worker
pnpm deploy:cf:search     # Search app (Pages)
pnpm deploy:cf:drive      # Drive app (Pages)

# Setup infrastructure
pnpm cf:setup              # Create all KV/R2/D1 resources
```

## Secrets

Set via `wrangler secret put`:
- `MEILISEARCH_URL` — Meilisearch backend URL
- `MEILISEARCH_API_KEY` — Meilisearch API key
- `NEON_DATABASE_URL` — Neon PostgreSQL connection string
- `BACKEND_URL` — Self-hosted backend URL (fallback)
- `OPENAI_API_KEY` — For chat Q&A feature

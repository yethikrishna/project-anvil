# Cloudflare Free Stack — $0/mo Deployment Guide

**Date:** 2026-05-21
**Stack:** Pages + Workers + R2 + D1 + KV

---

## Architecture

```
User → Cloudflare CDN (global, <50ms)
       ├─ Pages: Static frontend (Next.js SSG)
       ├─ Workers: API edge functions (Hono)
       │   ├─ Auth (JWT verification)
       │   ├─ Search proxy → Meilisearch (or D1)
       │   └─ File proxy → R2
       ├─ R2: File storage (10GB free, free egress)
       ├─ D1: SQLite database (5GB free)
       └─ KV: Session/cache (100K reads/day free)
```

---

## Free Tier Limits

| Service | Free Tier | Anvil Needs |
|---------|-----------|-------------|
| Pages | Unlimited sites | ✅ All frontend apps |
| Workers | 100K req/day | ✅ API gateway |
| R2 | 10GB + free egress | ✅ File storage |
| D1 | 5GB + 5M rows read/day | ✅ Database |
| KV | 100K reads + 1K writes/day | ✅ Sessions |

**Total cost: $0/month** for a demo/portfolio deployment.

---

## Setup Steps

### 1. Install Wrangler CLI

```bash
npm install -g wrangler
wrangler login
```

### 2. Create D1 Database

```bash
wrangler d1 create anvil-db
# Note the database_id for wrangler.toml
```

### 3. Create R2 Bucket

```bash
wrangler r2 bucket create anvil-drive
```

### 4. Create KV Namespace

```bash
wrangler kv namespace create SESSIONS
```

### 5. Deploy API Worker

```bash
cd edge/
npm install
wrangler deploy --env production
```

### 6. Deploy Frontend

```bash
# Build all apps
pnpm build

# Deploy to Pages
wrangler pages deploy out/ --project-name=anvil
```

---

## wrangler.toml (Unified Config)

```toml
name = "anvil-api"
main = "search-router.ts"
compatibility_date = "2026-04-21"
compatibility_flags = ["nodejs_compat"]

# ── D1 Database ──
[[d1_databases]]
binding = "DB"
database_name = "anvil-db"
database_id = "<your-database-id>"

# ── R2 Storage ──
[[r2_buckets]]
binding = "STORAGE"
bucket_name = "anvil-drive"

# ── KV Sessions ──
[[kv_namespaces]]
binding = "SESSIONS"
id = "<your-kv-namespace-id>"

# ── Environment Variables ──
[vars]
ENVIRONMENT = "production"

# ── Secrets (set via `wrangler secret put`) ──
# AUTH_JWT_SECRET
# MEILISEARCH_URL
# MEILISEARCH_API_KEY
```

---

## Worker API (Hono)

```typescript
// edge/search-router.ts (already implemented)
// Add D1, R2, KV bindings:

app.get('/api/files/:id', async (c) => {
  const id = c.req.param('id');
  const object = await c.env.STORAGE.get(id);
  if (!object) return c.json({ error: 'Not found' }, 404);
  return new Response(object.body, {
    headers: { 'Content-Type': object.httpMetadata?.contentType ?? 'application/octet-stream' },
  });
});

app.post('/api/files', async (c) => {
  const formData = await c.req.formData();
  const file = formData.get('file') as File;
  const key = `${Date.now()}-${file.name}`;
  await c.env.STORAGE.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });
  return c.json({ key, size: file.size });
});

app.get('/api/session', async (c) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return c.json({ error: 'Unauthorized' }, 401);
  const session = await c.env.SESSIONS.get(`session:${token}`);
  if (!session) return c.json({ error: 'Invalid session' }, 401);
  return c.json(JSON.parse(session));
});
```

---

## Custom Domain (Optional)

```bash
# Add custom domain to Pages
wrangler pages project edit anvil --production-branch=main

# DNS: CNAME anvil.yourdomain.com → anvil.pages.dev
```

---

## Files

| File | Purpose |
|------|---------|
| `docs/deployment/cloudflare-free-stack.md` | This guide |
| `edge/search-router.ts` | Worker API (already implemented) |
| `edge/wrangler.toml` | Worker config (already implemented) |

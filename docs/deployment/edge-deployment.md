# Edge Function Deployment Evaluation

**Date:** 2026-05-21
**Scope:** Search API (Meilisearch), Geocoding (Nominatim/OSRM)
**Status:** Evaluated with deployment strategy

---

## Executive Summary

Edge functions (Cloudflare Workers, Vercel Edge, Deno Deploy) can reduce latency for search and geocoding APIs by running code closer to users. However, both Meilisearch and Nominatim/OSRM are **stateful services** that can't run on edge — they need persistent storage and significant compute. The edge strategy is a **routing + caching layer** in front of regional infrastructure.

---

## Architecture Options

### Option A: Regional Deployment (Current)

```
User → CDN (static) → Regional Server (us-east-1)
                      → Meilisearch (us-east-1)
                      → Nominatim/OSRM (us-east-1)
```

- **Latency:** 50-200ms for non-local users
- **Complexity:** Low
- **Cost:** Low
- **Best for:** Single-region demo, portfolio project

### Option B: Edge Router + Regional Backend

```
User → Edge Function (nearest PoP)
      → Cache hit? → Return cached result
      → Cache miss → Regional Backend (us-east-1)
                    → Meilisearch / Nominatim
                    → Cache + Return
```

- **Latency:** 10-50ms for cached results, same as A for misses
- **Complexity:** Medium
- **Cost:** Medium (edge compute + regional)
- **Best for:** Production with global users

### Option C: Multi-Regional (Future)

```
User → Edge Router
      → Nearest Regional Backend
         (us-east-1 / eu-west-1 / ap-south-1)
      → Meilisearch replica
      → Nominatim/OSRM instance
```

- **Latency:** 10-50ms globally
- **Complexity:** High (data replication, consistency)
- **Cost:** 3× regional
- **Best for:** Global SaaS with SLAs

---

## Search API: Edge Evaluation

### What Can Run on Edge

| Component | Edge-Suitable? | Notes |
|-----------|---------------|-------|
| Search query parsing | ✅ Yes | Pure computation |
| Result formatting | ✅ Yes | Pure computation |
| Meilisearch client | ✅ Yes | HTTP client only |
| Meilisearch server | ❌ No | Stateful, compute-heavy |
| Vector embeddings | ⚠️ Limited | CF Workers: 128MB, no GPU |
| Reranking | ⚠️ Limited | CPU-bound, may timeout |

### Recommended: Hono Edge Router

```typescript
// edge/search-router.ts (Cloudflare Workers)
import { Hono } from 'hono';
import { cache } from 'hono/cache';

const app = new Hono();

// Cache search results at the edge for 5 minutes
app.get('/api/search', cache({ cacheName: 'anvil-search', cacheControl: 'max-age=300' }),
  async (c) => {
    const q = c.req.query('q');
    const response = await fetch(`${MEILI_URL}/indexes/anvil_pages/search`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${MEILI_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q, limit: 20 }),
    });
    return c.json(await response.json());
  }
);

// Geocoding with edge caching
app.get('/api/geocode', cache({ cacheName: 'anvil-geocode', cacheControl: 'max-age=3600' }),
  async (c) => {
    const q = c.req.query('q');
    const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json`);
    return c.json(await response.json());
  }
);
```

### Latency Impact (Estimated)

| Route | Regional | Edge (cached) | Edge (miss) |
|-------|----------|--------------|-------------|
| Search (text) | 80ms | 15ms | 120ms |
| Search (hybrid) | 150ms | 15ms | 200ms |
| Geocode | 200ms | 15ms | 250ms |
| Directions | 300ms | 15ms | 350ms |

---

## Geocoding API: Edge Evaluation

Nominatim is a free service with rate limits (1 req/s). For production:

### Option 1: Self-hosted Nominatim on regional VM
- Full control, no rate limits
- Requires 100GB+ disk for planet data
- ~$50/month on Oracle Cloud Free Tier (ARM)

### Option 2: Edge-cached Nominatim proxy
- Cache popular locations at edge (cities, landmarks)
- Forward misses to Nominatim with rate limiting
- Estimated 70%+ cache hit rate for typical usage

### Option 3: Commercial geocoding API
- Mapbox, Google Maps, Here
- $0.50-5.00 per 1000 requests
- Best for production SLAs

**Recommendation for portfolio/demo:** Option 2 (edge cache + Nominatim proxy)

---

## Cost Analysis

| Setup | Monthly Cost | Latency |
|-------|-------------|---------|
| Regional only (Render free) | $0 | 50-200ms |
| CF Workers + Render | $0-5 | 15-200ms |
| CF Workers + Regional VM | $5-25 | 15-100ms |
| Multi-regional | $75-150 | 15-50ms |

---

## Recommendation

**For portfolio/demo:** Regional deployment is sufficient. The demo isn't latency-sensitive.

**For production MVP:** Add Hono edge router on CF Workers (free tier: 100K req/day). Caches popular searches and geocode results, forwards misses to regional backend.

**Implementation priority:** Low. Add as optimization after core features are stable.

---

## Implementation Files

| File | Purpose |
|------|---------|
| `edge/search-router.ts` | Hono edge router for search + geocode caching |
| `wrangler.toml` | CF Workers configuration |
| `docs/deployment/edge-deployment.md` | This evaluation |

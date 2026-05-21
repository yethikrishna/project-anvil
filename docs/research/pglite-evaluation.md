# PGlite v0.4 Evaluation — Unified Client-Side Database

**Date:** 2026-05-21
**Status:** Evaluated
**Verdict:** Best option for client-side WASM Postgres

---

## What is PGlite?

PGlite is a WASM build of PostgreSQL that runs in the browser, Node.js, or Cloudflare Workers:
- Full PostgreSQL in ~3MB WASM
- pgvector extension for vector search
- PostGIS extension (experimental) for geospatial queries
- Live queries: reactive subscriptions to query results
- IndexedDB persistence for data survival across sessions

---

## Use Cases for Anvil

| App | Use Case | Benefit |
|-----|----------|---------|
| Drive | File metadata cache, folder structure | Instant folder navigation offline |
| Docs | Document cache, recent files | Open recent docs instantly |
| Maps | POI database, geospatial queries | Offline map search with PostGIS |
| Gmail | Email cache, full-text search | Instant search across cached emails |
| YouTube | Video metadata, watch history | Offline browsing history |

---

## Live Queries (Killer Feature)

```typescript
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();

// One-time query
const results = await db.query('SELECT * FROM files WHERE parent_id = $1', [parentId]);

// Live query — re-runs automatically when data changes
const liveResults = await db.live.query(
  'SELECT * FROM files WHERE parent_id = $1 ORDER BY name',
  [parentId],
  (results) => {
    // Automatically called when results change
    updateUI(results.rows);
  }
);
```

---

## vs Turso vs PowerSync

| Feature | PGlite | Turso | PowerSync |
|---------|--------|-------|-----------|
| Client-side DB | WASM Postgres | libSQL/SQLite | SQLite |
| Vector search | pgvector ✅ | No | No |
| Geospatial | PostGIS ✅ | No | No |
| Live queries | Yes | No | Yes |
| Sync | Manual | Automatic | Automatic |
| Size | ~3MB WASM | ~1MB WASM | ~1MB |
| Persistence | IndexedDB | File system | File system |

---

## Recommendation

**For demo:** PGlite is the best client-side database. It supports pgvector (AI search) and PostGIS (maps) natively — no other client-side DB does this.

**Architecture:** Use PGlite for client-side caching + search. Sync with server-side PostgreSQL via API calls (not automatic replication).

---

## Files
| File | Purpose |
|------|---------|
| `docs/research/pglite-evaluation.md` | This document |

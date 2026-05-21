# Hocuspocus v4 Upgrade Plan

**Date:** 2026-05-21
**Status:** Evaluated — defer until v4 stable release
**Current Version:** 2.15.3 (installed), ^4.0.0 (package.json)

---

## Hocuspocus v4 Changes (Expected)

Based on the Tiptap/Hocuspocus roadmap and community discussions:

### 1. Cross-Runtime Support
- Runs on Node.js, Deno, Bun, and Cloudflare Workers
- No more Node-specific APIs (fs, net) in core
- WebSocket abstraction layer for different runtimes

### 2. Memory Optimization
- Better document garbage collection
- Configurable document eviction (LRU)
- Reduced per-document memory footprint (~30% improvement)
- Streaming state sync (avoid loading full documents into memory)

### 3. Edge Deployment
- Run on Cloudflare Workers / Vercel Edge Functions
- Use Durable Objects or KV for document persistence
- Sub-50ms cold start time
- Global distribution for lower latency

### 4. New Extension API
- Cleaner lifecycle hooks
- Better TypeScript types
- Async extension loading

---

## Current Server Architecture

```
apps/docs/api/src/server.ts
├── Hocuspocus WebSocket server (port 3103)
├── Fastify REST server (port 3102)
│   ├── /api/documents — CRUD
│   ├── /api/export — PDF/DOCX export
│   ├── /api/preview — Static rendering
│   └── /api/analytics — Collaboration analytics
└── PostgreSQL persistence (Drizzle ORM)
```

### Issues with Current Setup

1. **Dual port:** Hocuspocus WS on 3103, REST on 3102 — requires WebSocket proxy
2. **YDoc API misuse:** `YDoc.prototype.transact.bind(document)` is not idiomatic
3. **No extension architecture:** All hooks inline in constructor
4. **No document eviction:** Documents stay in memory until server restart

---

## Upgrade Plan (When v4 is stable)

### Phase 1: Fix Current Patterns (No Breaking Changes)

```typescript
// BEFORE (current — incorrect Yjs API usage)
YDoc.prototype.transact.bind(document)({}, () => {
  const ydoc = new YDoc();
  YDoc.prototype.applyUpdate.bind(ydoc)(state);
});

// AFTER (correct)
import { applyUpdate, encodeStateAsUpdate } from 'yjs';

const tempDoc = new YDoc();
applyUpdate(tempDoc, Buffer.from(state, 'base64'));
// Merge into the live document
applyUpdate(document, encodeStateAsUpdate(tempDoc));
```

### Phase 2: Extension Architecture

```typescript
// packages/collab/src/extensions/pg-persistence.ts
import type { Extension } from '@hocuspocus/server';

export class PgPersistence implements Extension {
  async onLoadDocument({ documentName, document }) {
    const docId = documentName.replace('doc-', '');
    const row = await db.select().from(documents).where(eq(documents.id, docId)).limit(1);
    if (row[0]?.ydocState) {
      applyUpdate(document, Buffer.from(row[0].ydocState, 'base64'));
    }
  }

  async onStoreDocument({ documentName, document }) {
    const docId = documentName.replace('doc-', '');
    const state = Buffer.from(encodeStateAsUpdate(document)).toString('base64');
    await db.update(documents).set({ ydocState: state, updatedAt: new Date() }).where(eq(documents.id, docId));
  }
}

// packages/collab/src/extensions/auth.ts
export class AuthExtension implements Extension {
  async onConnect({ context }) {
    return {
      user: {
        id: context?.userId ?? 'anonymous',
        name: context?.userName ?? 'Anonymous',
      },
    };
  }
}
```

### Phase 3: Edge-Ready Architecture (Post-v4)

```typescript
// packages/collab/src/server.ts
import { Hocuspocus } from '@hocuspocus/server';
import { PgPersistence } from './extensions/pg-persistence';
import { AuthExtension } from './extensions/auth';

export function createCollabServer(deps: {
  persistence: PgPersistence;
  auth: AuthExtension;
}) {
  return new Hocuspocus({
    extensions: [deps.persistence, deps.auth],
    debounce: 2000,
    maxDebounce: 10000,
    // v4: document eviction for memory optimization
    maximumDocumentSize: 10 * 1024 * 1024, // 10MB
    unloadAfter: '5m', // Evict documents idle for 5 minutes
  });
}
```

---

## Cloudflare Workers Edge Deployment (v4)

```typescript
// edge/collab-worker.ts (future)
import { Hocuspocus } from '@hocuspocus/server';
import { DurableObjectPersistence } from './extensions/do-persistence';

export default {
  async fetch(request: Request, env: Env) {
    const server = new Hocuspocus({
      extensions: [new DurableObjectPersistence(env.DOCUMENTS_DO)],
    });
    return server.handle(request);
  },
};
```

---

## Recommendation

**Defer upgrade until Hocuspocus v4 is stable.** The current v2.15.3 works correctly for the demo. When v4 releases:

1. Fix Yjs API usage (can do now — no breaking changes)
2. Extract extensions from inline hooks
3. Add document eviction configuration
4. Test on Bun runtime for performance
5. Evaluate CF Workers deployment for production

---

## Files

| File | Purpose |
|------|---------|
| `docs/research/hocuspocus-v4-upgrade.md` | This document |

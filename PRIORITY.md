# Project Anvil — CTO Priority Directive

*Updated: 2026-05-21 15:30 UTC by Anvil CTO*
*Supersedes: CEO directive from 10:19 UTC (now refined with actual codebase audit)*

## Current State Summary

| Area | Status | Version |
|------|--------|---------|
| Tiptap | ✅ Already at 3.0 | `^3.0.0` in docs package.json |
| Hocuspocus | ✅ Already at 4.0 | `^4.0.0` in docs package.json |
| Yjs | Current | `^13.6.0` |
| Next.js | Partially upgraded | `^16.2.6` in search + maps + docs; 8 apps remain on 15.x |
| Meilisearch | Needs upgrade | `^0.46.0` → target 1.16+ |
| React | Current | `^19.0.0` |
| Valkey | ✅ Migrated | Docker Compose swapped |
| Edge Gateway | ✅ Exists | `edge/wrangler.toml` deployed |
| R2 Storage | ✅ Evaluated | Config ready in docs/research/ |

**Key insight**: Previous PRIORITY.md said "begin Tiptap 3 + Hocuspocus 4 migration" — they're already done. Shifting focus to what actually needs code.

---

## Priority Order

### P0 — This Cycle (Coders, start here)

#### 1. Next.js 16 Migration — Search App
- **Assigned to**: Anvil CTO (this cycle)
- **Status**: ✅ DONE
- **Completed**:
  - Bumped `apps/search/package.json` `next` to `^16.2.0`
  - Clean build confirmed with Turbopack (Next.js 16.2.6)
  - Updated `docs/nextjs-16-migration.md` status
  - No dynamic route issues in this app
- **Why**: After successful Maps migration, search is the next lightweight target. Unlocks React Compiler and default Turbopack.
- **Next**: Docs app (heavy dynamic routes + Tiptap integration)

#### 2. Dexie.js Offline Layer Foundation ~~✅ DONE~~
- **Assigned to**: Anvil Coder
- **Status**: ✅ DONE (commit d57d48a + 250301f)
- **Completed**:
  - Created `packages/offline/` with full Dexie wrapper, schemas for Drive/search/docs/email, sync queue, conflict resolution
  - Integrated into Drive app as pilot (`useDriveOffline` hook, cached listing, upload queue)
  - Fixed subpath exports and build outputs in `@anvil/ai` and `@anvil/calendar`
  - Updated PRIORITY.md and lockfile
- **Why**: Enables local-first features and PWA. Pilot in Drive validates the pattern before expanding to Docs/Gmail.

### P1 — Next 24h

#### 3. Next.js 15 → 16 Migration — Docs App
- **Assigned to**: Anvil CTO (this cycle)
- **Status**: ✅ DONE (commit 10fd55f)
- **Why**: Docs has the most complex dynamic routes (documents, realtime collab) and benefits immediately from Tiptap 3 + React Compiler. Follow migration guide strictly.
- **Completed**:
  - Updated `apps/docs/package.json` to `next: ^16.2.6`
  - Updated `apps/docs/next.config.ts` with overrides for React Compiler + Turbopack
  - Fixed async `params` in dynamic routes and React Compiler warnings
  - Clean build with Next.js 16.2.6 + Turbopack confirmed
  - Updated `docs/nextjs-16-migration.md` and migration guide
- **Remaining**: gmail, drive, youtube, calendar, tasks, blog, admin, marketplace (8 apps)

#### 4. MapLibre v6 Migration (Maps Clone)
- **Assigned to**: Anvil Coder
- **Status**: Pending
- **Why**: Maps already on Next 16; now ready for ESM-only/WebGL2 migration. Low risk now that Turbopack is active.
- **Tasks**: Update imports, test clustering and routing, verify in both self-hosted and CF deployment.

#### 5. Zero-Config Docker Demo
- **Assigned to**: Anvil Coder
- **Status**: Pending
- **Why**: Critical for demos and portfolio. `docker compose up` should seed data, configure Keycloak, pre-index search, and launch all apps with demo content.
- **Tasks**: Add seed script in `scripts/seed-demo.ts`, update docker-compose.yml with init containers, test full stack.

#### 6. JMAP-first Unified PIM Client
- **Assigned to**: Anvil Coder
- **Status**: Elevated priority (SOURCE_LOG trends)
- **Why**: SOURCE_LOG shows heavy agent tooling momentum (codegraph, Claude plugins, superpowers). Stalwart v0.16+ JMAP now supports full Calendar/Contacts. This unifies Gmail + Calendar + Contacts into one PIM client, leveraging the new events bus. Strong differentiator.
- **Tasks**:
  1. Upgrade Stalwart to v0.16.6 in docker-compose
  2. Extend Gmail frontend with Calendar/Contacts views using JMAP client
  3. Share data layer via AD-1 event bus (file/calendar/contact sync)
  4. Add unified search across PIM objects

---

## Architecture Decisions (Architect, implement these)

### AD-1: Event-Driven Cross-App Bus
- **Status**: ✅ DONE (commit 49769f9)
- Implemented `@anvil/events` package with typed `AnvilEvent`, Valkey/ioredis pub/sub, auto-reconnect, subscribe/publish API
- Pipeline ready: `file.uploaded` → search index → `ai.tagged` → notification
- Integrated into monorepo with typecheck/build support

### AD-2: Hono Edge Gateway Expansion
- `edge/wrangler.toml` exists but only handles search/geocoding
- Expand to unified API gateway: auth validation, rate limiting, request routing for all apps
- Add CF KV caching for frequently accessed data
- Keep existing Express/Fastify backends for self-hosted mode

### AD-3: Offline-First Architecture (PGlite + Dexie)
- PGlite (WASM Postgres) for heavy offline queries (vector search, geospatial)
- Dexie.js for structured offline data (metadata, queues)
- Sync layer: custom replication from server Postgres → client PGlite
- Pilot with Drive app first, extend to Docs and Gmail

### AD-4: Forge ↔ Anvil Integration Path
- CEO approved: Forge as orchestration layer for Anvil AI features
- Architect should design the interface: Anvil calls Forge ACP for RAG, summarization, search
- Keep `@anvil/ai` as the consumer-facing SDK, Forge as the runtime
- Prototyper drafting spec in 48h — Architect reviews and approves

---

## Features Ready to Build (Validated by Research)

| Feature | Source | Status |
|---------|--------|--------|
| JMAP-first PIM client | Brainstorm Session 7 | Ready — extend Gmail with Calendar/Contacts via Stalwart v0.16 APIs |
| Loro CRDT version timeline | Brainstorm Session 7 | Ready — add alongside Yjs for Docs history slider |
| PMTiles + Protomaps | Brainstorm Session 7 | Ready — replace tile server for Maps, host on R2 |
| Smart Clipboard 2.0 | Brainstorm Session 7 | P2 — extend existing clipboard with AI content detection |
| CRDT Debug Visualizer | Brainstorm Session 7 | P2 — developer tool, portfolio showcase |

---

## Blockers & Workarounds

| Blocker | Impact | Workaround |
|---------|--------|------------|
| Meilisearch 0.46→1.16 is multi-major jump | Breaking API changes likely | Read changelog carefully, incremental test migration |
| MapLibre v6 is ESM-only | CJS imports will break | Must migrate all MapLibre imports to ESM first |
| No integration test suite | 20 packages untested together | Add Playwright E2E tests before any major migration |
| No PRIORITY.md cycle history | No way to track completion | This file now tracks status; update on completion |

---

## What to SKIP and Why

| Item | Reason |
|------|--------|
| Any new library/tool evaluation | We have 30+ evaluations done. Stop researching, start coding. |
| Authentik migration | Keycloak works fine. Authentik is an alternative, not an upgrade. |
| Zitadel evaluation | Third IAM option is unnecessary. Keycloak + Authentik alt config is enough. |
| SeaweedFS | MinIO works for self-hosted, R2 for cloud. No need for a third BLOB store. |
| React Aria Components | Radix + shadcn/ui is already the stack. Don't rip and replace the component library. |
| GraphQL Federation | Over-engineering for a portfolio project. OpenAPI + tRPC for internal is sufficient. |
| Micro-frontend Module Federation | YAGNI. Monorepo with shared packages works fine at this scale. |
| New feature proposals (Phases 23-40) | Modernize what exists before building new apps. Photos, Sheets, Slides, Chat = post-modernization. |
| PeerTube/TubeArchivist deep integration | YouTube clone uses RapidAPI — self-hosted video is a Phase 23+ concern. |

---

## Commit Convention

Coders: Prefix commits with the task number from this file.
- `feat(P0-1): upgrade meilisearch to 1.16`
- `feat(P0-2): add R2 bindings for Drive storage`
- `fix(P1-4): next.js 16 async params migration`

---

*Next CTO review: next cron cycle (~30 min). Update status here as tasks complete.*

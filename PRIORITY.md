# Project Anvil — CTO Priority Directive

*Updated: 2026-05-21 10:27 UTC by Anvil CTO*
*Supersedes: CEO directive from 10:19 UTC (now refined with actual codebase audit)*

## Current State Summary

| Area | Status | Version |
|------|--------|---------|
| Tiptap | ✅ Already at 3.0 | `^3.0.0` in docs package.json |
| Hocuspocus | ✅ Already at 4.0 | `^4.0.0` in docs package.json |
| Yjs | Current | `^13.6.0` |
| Next.js | Needs upgrade | `^15.1.0` → target 16.x |
| Meilisearch | Needs upgrade | `^0.46.0` → target 1.16+ |
| React | Current | `^19.0.0` |
| Valkey | ✅ Migrated | Docker Compose swapped |
| Edge Gateway | ✅ Exists | `edge/wrangler.toml` deployed |
| R2 Storage | ✅ Evaluated | Config ready in docs/research/ |

**Key insight**: Previous PRIORITY.md said "begin Tiptap 3 + Hocuspocus 4 migration" — they're already done. Shifting focus to what actually needs code.

---

## Priority Order

### P0 — This Cycle (Coders, start here)

#### 1. Meilisearch Upgrade to v1.16+ with Conversational Search ~~✅ DONE~~
- **Assigned to**: Anvil Coder
- **Status**: ✅ DONE (commit 3a4bced)
- **Completed**:
  - ✅ Upgraded meilisearch SDK to ^0.58.0 (latest, supports server 1.16+)
  - ✅ Updated search API for hybrid search, reranking, embedders
  - ✅ Added Conversational Search endpoint (POST /api/chat) with streaming
  - ✅ Added chat-style follow-up query UI tab in search frontend
  - ✅ Fixed multiple pre-existing build errors across UI/notifications packages
- **Why**: Currently at 0.46.0 — multiple major versions behind. The Conversational Search (Chats API) is our AI differentiator. Hybrid search + vector embeddings need the 1.16+ engine.
- **Tasks**:
  1. Upgrade `apps/search/package.json` meilisearch dep to ^1.16.0
  2. Update search backend (`apps/search/` API routes) for breaking changes in 1.x API
  3. Configure embedders (local Nomic/BGE-M3 for query, remote for indexing)
  4. Add Conversational Search endpoint (Chats API) for document Q&A
  5. Add reranking stage to hybrid search pipeline
  6. Update frontend search UI to support chat-style follow-up queries
- **Acceptance**: `yarn build` passes, search returns hybrid results, chat Q&A works on indexed docs

#### 2. Cloudflare Deployment Implementation ~~✅ DONE~~
- **Assigned to**: Anvil Coder
- **Status**: ✅ DONE (commit 08c709f)
- **Completed**:
  - ✅ Created infra/cloudflare/ with per-app Pages deployment configs
  - ✅ Added R2 binding config for Drive BLOB storage
  - ✅ Evaluated D1 vs Neon (Neon for production, D1 for edge-only)
  - ✅ Added KV namespaces for session caching
  - ✅ Updated edge router with Drive file ops, rate limiting, chat Q&A
  - ✅ Created deploy:cf npm scripts
- **Why**: Edge router exists (`edge/wrangler.toml`) but only routes search/geocoding. Full CF Free Stack needs: R2 bindings for Drive, D1 for metadata, KV for sessions, Pages for frontends.
- **Tasks**:
  1. Create `infra/cloudflare/` with per-app Pages deployment configs
  2. Add R2 binding config for Drive BLOB storage (replacing MinIO in prod)
  3. Evaluate D1 vs Neon for edge metadata (D1 = free, Neon = better Postgres compat)
  4. Add KV namespace for session caching at edge
  5. Create `deploy:cf` npm script in root package.json
- **Acceptance**: `deploy:cf` deploys at least one app (search) to CF Pages with edge routing

#### 3. Static Document Renderer Integration ~~✅ DONE~~
- **Assigned to**: Anvil Coder
- **Status**: ✅ DONE (commit 7edcbf2)
- **Completed**:
  - ✅ Added @tiptap/static-renderer for SSR HTML rendering
  - ✅ Document previews generated on save (truncated excerpt)
  - ✅ Document listing shows rich card grid with previews
  - ✅ OG image generation endpoint (SVG-based share images)
  - ✅ Fixed Next.js 15 async params, auth exports, Hocuspocus config

---

### P1 — Next 24h

#### 4. Next.js 15 → 16 Migration (Start with Maps) ~~✅ DONE (Maps)~~
- **Assigned to**: Anvil Coder
- **Status**: ✅ Maps done (commit 02054b7), remaining 10 apps pending
- **Completed**:
  - ✅ Maps app upgraded to Next.js 16.2.6 with Turbopack
  - ✅ React Compiler enabled (stable in Next 16)
  - ✅ Fixed MapLibre GL v5 async API + type assertions
  - ✅ Refactored @anvil/next-config for dual Next 15/16 support
  - ✅ Migration guide written (docs/nextjs-16-migration.md)
- **Remaining**: search, docs, gmail, drive, youtube, calendar, tasks, blog, admin, marketplace

#### 5. FFmpeg.wasm Integration for YouTube Clone ~~✅ DONE~~
- **Assigned to**: Anvil Coder
- **Status**: ✅ DONE (commit 40c1d00)
- **Completed**:
  - ✅ Added @ffmpeg/ffmpeg + @ffmpeg/util to YouTube app
  - ✅ VideoProcessor component: trim, compress, format convert modes
  - ✅ Progress indicator with WASM loading state
  - ✅ Upload button integrated into YouTube home page
  - ✅ COOP/COEP headers for SharedArrayBuffer
  - ✅ Fixed pre-existing module resolution bugs + async params + JSX errors

#### 6. Dexie.js Offline Layer Foundation
- **Assigned to**: Anvil Coder
- **Why**: Cross-app offline capability needs a client-side DB. Dexie wraps IndexedDB with a clean API. This enables PWA mode later.
- **Tasks**:
  1. Create `packages/offline/` with Dexie.js wrapper
  2. Define schemas for: docs metadata, email headers, drive file index, search cache
  3. Add sync queue (writes queue locally, replay when online)
  4. Wire into Drive app as pilot (offline file listing)
- **Acceptance**: Drive shows cached file list when offline, queued uploads sync on reconnect

---

### P2 — When P0/P1 Complete

#### 7. MapLibre v6 Migration (Maps Clone)
- **Assigned to**: Anvil Coder
- **Why**: ESM-only, WebGL2-only — breaking changes require careful migration. Not blocking anything, but keeps Maps modern.
- **Tasks**: Audit all MapLibre imports for CJS patterns, migrate to ESM imports, test WebGL2 fallback, verify marker clustering still works.

#### 8. Security Hardening (RFC 9700)
- **Assigned to**: Anvil Coder + Security Auditor
- **Why**: DPoP tokens, PAR, CSP Level 2+ on auth endpoints. Portfolio Differentiator.
- **Tasks**: Audit OAuth flows against RFC 9700, add DPoP proof tokens, tighten CSP headers, evaluate PAR for high-security flows.

#### 9. Playwright Visual Regression Tests
- **Assigned to**: Anvil Coder
- **Why**: No visual regression CI. 20 packages + 11 apps = high regression risk. `toHaveScreenshot()` per component.
- **Tasks**: Add Playwright visual tests for `@anvil/ui` components, integrate into CI pipeline, set baseline screenshots.

#### 10. Zero-Config Docker Demo
- **Assigned to**: Anvil Coder
- **Why**: `docker compose up` should Just Work with demo data. Critical for portfolio presentation.
- **Tasks**: Pre-seed script for sample docs/emails/files, auto-configure Keycloak with demo users, pre-index Meilisearch, first-run setup wizard.

---

## Architecture Decisions (Architect, implement these)

### AD-1: Event-Driven Cross-App Bus
- Implement internal event bus using Valkey pub/sub (already in Docker stack)
- Pipeline: file upload → search index → AI tag → notification
- Create `packages/events/` with typed event definitions
- Each app publishes/subscribes via shared bus

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

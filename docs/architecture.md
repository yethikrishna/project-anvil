# Project Anvil — Architecture

> A federated Google-Workspace-style product ecosystem: 6 production-grade apps with shared auth, real-time sync, and monorepo tooling.

## High-Level Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        Project Anvil                         │
│                                                              │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌───────┐│
│  │  Drive   │ │  Docs   │ │ YouTube │ │  Maps   │ │Gmail  ││  Search
│  │ :3001   │ │ :3002   │ │ :3003   │ │ :3004   │ │ :3006 ││  :3005
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └───┬───┘│
│       │           │           │           │          │     │
│  ┌────┴────┐ ┌────┴────┐ ┌───┴───┐                        │
│  │Drive API│ │Hocusp.  │ │Search │   (Browser-based  │     │
│  │ :3100   │ │  :3200  │ │ :4015 │    clients)       │     │
│  └────┬────┘ └────┬────┘ └───┬───┘                     │     │
│       │           │           │                          │     │
│  ─────┴───────────┴───────────┴──────────────────────────┴── │
│                                                              │
│  ┌─────────────────── Shared Layer ───────────────────────┐  │
│  │ @anvil/auth (OIDC/PKCE)  @anvil/ui (components)       │  │
│  │ @anvil/api-client        @anvil/notifications (WS)     │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ───────────────────── Infrastructure ───────────────────── │
│                                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────────┐ │
│  │ Keycloak │ │PostgreSQL│ │  MinIO   │ │  Meilisearch   │ │
│  │  SSO/OIDC│ │  (data)  │ │  (S3)   │ │  (search)      │ │
│  │  :8080   │ │  :5432   │ │  :9000   │ │  :7700         │ │
│  └──────────┘ └──────────┘ └──────────┘ └────────────────┘ │
│                                                              │
│  ┌──────────┐ ┌──────────┐                                  │
│  │  Redis   │ │ Stalwart │  Notification WS :4020           │
│  │  :6379   │ │  :25/587 │                                  │
│  └──────────┘ └──────────┘                                  │
└──────────────────────────────────────────────────────────────┘
```

## Monorepo Structure

```
project-anvil/
├── apps/
│   ├── drive/          # Next.js 15 + S3 file storage
│   ├── docs/           # Next.js 15 + Tiptap + Yjs CRDT
│   ├── youtube/        # Next.js 15 + RapidAPI + Redux
│   ├── maps/           # Next.js 15 + MapLibre GL + OSRM
│   ├── search/         # Next.js 15 + Meilisearch hybrid
│   └── gmail/          # Next.js 15 + JMAP + Stalwart
├── packages/
│   ├── auth/           # OIDC/PKCE auth (Keycloak)
│   ├── ui/             # Shared component library
│   ├── api-client/     # OpenAPI 3.1 generated client
│   └── notifications/  # WebSocket notification server
├── scripts/            # Setup & deployment scripts
├── docs/               # Architecture & system design
├── infra/              # Docker Compose, IaC configs
├── turbo.json          # Turborepo pipeline config
└── render.yaml         # Render deployment blueprint
```

## Tech Stack

| Layer          | Technology                      | Purpose                          |
|----------------|--------------------------------|----------------------------------|
| Frontend       | Next.js 15, React 19, Tailwind 4 | SSR + client apps              |
| State          | Redux Toolkit, Zustand          | Client-side caching             |
| Editor         | Tiptap + Yjs + Hocuspocus       | Collaborative rich text         |
| Maps           | MapLibre GL + OpenMapTiles      | Vector tile rendering           |
| Search         | Meilisearch + MiniLM            | Hybrid BM25 + semantic search   |
| Mail           | Stalwart + JMAP (RFC 8620)     | Full email server               |
| Auth           | Keycloak OIDC + PKCE            | SSO across all apps             |
| Backend        | Fastify                         | High-performance REST APIs      |
| Storage        | MinIO / Supabase Storage        | S3-compatible BLOB storage      |
| Database       | PostgreSQL (Neon)               | Relational data                 |
| Caching        | Redis                           | Session + rate limiting         |
| Notifications  | Fastify WebSocket               | Real-time push alerts           |
| Monorepo       | Turborepo + pnpm                | Build orchestration             |
| CI/CD          | GitHub Actions + Vercel + Render| Automated deployment           |

## Data Flow

### Authentication Flow
1. User visits any app → middleware checks `anvil-session` cookie
2. No valid session → redirect to `/api/auth/login` → Keycloak OIDC authorize
3. PKCE flow: code_verifier stored in cookie, code_challenge sent to IdP
4. Callback → code exchange → tokens stored in HTTP-only cookie
5. Session propagated across all apps via shared Keycloak realm
6. Auto-refresh: JWT decoded client-side, refresh 5 min before expiry

### File Upload Flow (Drive)
1. Client selects file → `multipart/form-data` POST to Drive API
2. API streams to MinIO/S3 with unique key (`{userId}/{path}/{uuid}`)
3. PostgreSQL row created with metadata (name, size, MIME, path)
4. Materialized path schema for hierarchical directory structure
5. Share links generate pre-signed S3 URLs with TTL

### Real-time Collaboration (Docs)
1. User opens doc → Hocuspocus WebSocket connection established
2. Yjs CRDT document synced via `y-protocols`
3. Local changes → Yjs update → broadcast to all connected clients
4. Cursor positions shared via `@tiptap/extension-collaboration-cursor`
5. Document persisted to PostgreSQL on change (debounced)

### Hybrid Search Flow
1. User types query → debounced (200ms) → sent to Search API
2. Search API queries Meilisearch with both BM25 + vector indexes
3. MiniLM-L6 transformer embeds query for semantic matching
4. Results merged, ranked by combined score
5. "Did you mean" suggestions from Meilisearch typo tolerance

### Notification Flow
1. Event occurs (new mail, file share, doc mention)
2. Backend POST to Notification API with `{ userId, type, title, message }`
3. Notification server stores in memory → broadcasts via WebSocket
4. Client `useNotifications` hook receives via WS → renders toast
5. Fallback: REST polling if WS connection fails

## Deployment Architecture

```
┌─ Vercel ──────────────────────┐
│  drive.anvil.dev  (Next.js)   │
│  docs.anvil.dev   (Next.js)   │
│  video.anvil.dev  (Next.js)   │
│  maps.anvil.dev   (Next.js)   │
│  search.anvil.dev (Next.js)   │
│  mail.anvil.dev   (Next.js)   │
└───────────────────────────────┘

┌─ Render ──────────────────────┐
│  anvil-drive-api   (:3100)    │
│  anvil-docs-ws     (:3200)    │
│  anvil-search-api  (:4015)    │
│  anvil-notifications (:4020)  │
│  + Keep-warm crons (*/14 min) │
└───────────────────────────────┘

┌─ Neon ───────┐  ┌─ Supabase ──┐  ┌─ Keycloak ─┐
│  PostgreSQL   │  │  Storage    │  │  Managed    │
│  Serverless   │  │  (S3)       │  │  SSO        │
└──────────────┘  └─────────────┘  └─────────────┘
```

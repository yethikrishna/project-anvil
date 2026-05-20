# Project Anvil

> A federated Google Workspace ecosystem — 6 production-grade apps with shared SSO, real-time sync, and monorepo tooling.

[![CI](https://github.com/yethikrishna/project-anvil/actions/workflows/ci.yml/badge.svg)](https://github.com/yethikrishna/project-anvil/actions/workflows/ci.yml)

## Live Demos

| App | URL | Description |
|-----|-----|-------------|
| Drive | [drive.anvil.dev](https://drive.anvil.dev) | File storage & sharing |
| Docs | [docs.anvil.dev](https://docs.anvil.dev) | Collaborative rich text editor |
| Video | [video.anvil.dev](https://video.anvil.dev) | Video discovery & playback |
| Maps | [maps.anvil.dev](https://maps.anvil.dev) | Vector maps & navigation |
| Search | [search.anvil.dev](https://search.anvil.dev) | Hybrid search engine |
| Mail | [mail.anvil.dev](https://mail.anvil.dev) | JMAP email client |

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                         Project Anvil                          │
│                                                                │
│  ┌─────────┐ ┌─────────┐ ┌──────────┐ ┌─────────┐ ┌────────┐│
│  │  Drive   │ │  Docs   │ │ YouTube  │ │  Maps   │ │ Gmail  ││
│  │  :3001   │ │  :3002   │ │  :3003   │ │  :3004   │ │ :3006  ││
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └───┬────┘│
│       │             │             │             │          │     │
│  Drive API    Hocuspocus WS   Search API                      │
│   :3100         :3200          :4015        MapLibre     JMAP  │
│       │             │             │          GL JS      :25/587│
│  ─────┴─────────────┴─────────────┴─────────────────────────── │
│                                                                │
│  ┌──────────────── Shared Packages ─────────────────────────┐  │
│  │  @anvil/auth (OIDC/PKCE)    @anvil/ui (components)       │  │
│  │  @anvil/api-client (OpenAPI) @anvil/notifications (WS)   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌───────┐ ┌──────────┐ ┌───────┐ ┌────────────┐ ┌────────┐  │
│  │Keycloak│ │PostgreSQL│ │ MinIO │ │Meilisearch │ │Stalwart│  │
│  │ :8080  │ │  :5432   │ │ :9000 │ │   :7700    │ │ :25    │  │
│  └───────┘ └──────────┘ └───────┘ └────────────┘ └────────┘  │
└────────────────────────────────────────────────────────────────┘
```

## Tech Stack

| Service | Stack | Protocol | Data Layer |
|---------|-------|----------|------------|
| **Drive** | Next.js 15 + Fastify | REST API | PostgreSQL + MinIO S3 |
| **Docs** | Next.js 15 + Tiptap + Yjs | WebSocket CRDT | Hocuspocus + PostgreSQL |
| **YouTube** | Next.js 15 + Redux | REST API | Redux Cache + RapidAPI |
| **Maps** | Next.js 15 + MapLibre GL | WebGL + OSRM | Nominatim + GeoJSON |
| **Search** | Next.js 15 + Meilisearch | REST API | BM25 + Vector Embeddings |
| **Gmail** | Next.js 15 + Stiptap | JMAP (RFC 8620) | RocksDB + PostgreSQL |

## Quick Start

```bash
# Clone
git clone https://github.com/yethikrishna/project-anvil.git
cd project-anvil

# Start infrastructure
docker compose up -d

# Install dependencies
pnpm install

# Start all apps in development
pnpm dev
```

Apps will be available at:
- Drive: http://localhost:3001
- Docs: http://localhost:3002
- YouTube: http://localhost:3003
- Maps: http://localhost:3004
- Search: http://localhost:3005
- Gmail: http://localhost:3006

## Project Structure

```
project-anvil/
├── apps/
│   ├── drive/          # File storage & sharing
│   ├── docs/           # Collaborative document editor
│   ├── youtube/        # Video discovery & playback
│   ├── maps/           # Vector map rendering & navigation
│   ├── search/         # Hybrid search engine
│   └── gmail/          # JMAP email client
├── packages/
│   ├── auth/           # OIDC/PKCE authentication (Keycloak)
│   ├── ui/             # Shared component library + theme
│   ├── api-client/     # OpenAPI 3.1 generated TypeScript client
│   └── notifications/  # WebSocket notification server
├── scripts/            # Setup & deployment scripts
├── docs/               # Architecture & design documentation
├── infra/              # Docker Compose & Keycloak config
├── .github/workflows/  # CI/CD pipeline
├── turbo.json          # Turborepo build config
└── render.yaml         # Render deployment blueprint
```

## Documentation

- [Architecture Diagrams](docs/architecture.md) — System architecture, data flows, deployment topology
- [System Design](docs/system-design.md) — Per-app data models, API endpoints, sync protocols
- [Engineering Tradeoffs](docs/tradeoffs.md) — Keycloak vs Authentik, Fastify vs Express, Yjs vs Liveblocks, etc.
- [Portfolio Descriptions](docs/portfolio.md) — Resume-ready descriptions with ATS keywords

## Deployment

```bash
# Frontend: Vercel (each app has vercel.json)
# Backend: Render (render.yaml blueprint)
# Database: Neon PostgreSQL (scripts/setup-neon.sh)
# Storage: Supabase Storage (scripts/setup-supabase.sh)
# API Client: Generate from OpenAPI spec (scripts/generate-api-client.sh)
```

## Features

- 🔐 **SSO Authentication** — Keycloak OIDC with PKCE flow, session propagation across all apps
- 📁 **Drive** — S3 file storage, streaming upload, share links, materialized path directories
- 📝 **Docs** — Real-time collaborative editor with Yjs CRDT, cursor presence, rich text
- ▶️ **Video** — YouTube API search, Redux caching, playlist management, debounced autocomplete
- 🗺️ **Maps** — MapLibre GL WebGL rendering, Nominatim geocoding, OSRM routing, GPS tracking
- 🔍 **Search** — Hybrid BM25 + MiniLM semantic search, typo tolerance, "Did you mean"
- ✉️ **Mail** — JMAP email client, collapsible threads, rich text compose, labels & stars
- 🔔 **Notifications** — WebSocket push alerts, toast UI, notification bell with unread count
- 🌗 **Dark/Light Theme** — CSS variables, ThemeProvider context, system preference detection
- 📱 **Mobile Responsive** — Bottom nav, hamburger menu, slide-over sidebar
- 🧩 **Shared UI Library** — DataTable, Modal, Dropdown, Tabs, Toast, Tooltip, Skeleton loaders
- 🚀 **CI/CD** — GitHub Actions, Vercel + Render deployment, keep-warm crons

## License

MIT

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

### ☁️ One-Line Self-Hosted Install

```bash
# Standard install
curl -fsSL https://get.anvil.dev | bash -s -- --domain your.domain.com --email admin@your.domain.com

# HIPAA-compliant
curl -fsSL https://get.anvil.dev | bash -s -- --domain your.domain.com --mode hipaa

# GDPR (EU data residency)
curl -fsSL https://get.anvil.dev | bash -s -- --domain your.domain.com --mode gdpr

# Upgrade existing install
curl -fsSL https://get.anvil.dev | bash -s -- --upgrade
```

### 🐳 Docker Compose

```bash
cp .env.example .env && nano .env
docker compose up -d                      # Start full stack
docker compose --profile monitoring up -d  # + Prometheus/Grafana
docker compose --profile demo up -d        # + Demo data
```

### ☸️ Kubernetes (Helm)

```bash
helm repo add anvil https://anvil-org.github.io/project-anvil
helm install anvil anvil/anvil \
  --namespace anvil --create-namespace \
  --set global.domain=your.domain.com \
  --set postgresql.auth.password=changeme
```

### Legacy Cloud Targets

```bash
# Frontend: Vercel (each app has vercel.json)
# Database: Neon PostgreSQL (scripts/setup-neon.sh)
# Storage: Supabase Storage (scripts/setup-supabase.sh)
```

## Enterprise Features

| Feature | Starter | Business | Enterprise |
|---------|---------|----------|------------|
| Users | 25 | 100 | Unlimited |
| Storage | 50 GB | 500 GB | Custom |
| **SAML 2.0 SSO** | — | — | ✅ |
| **SCIM Provisioning** | — | — | ✅ (Okta, Azure AD, OneLogin) |
| **LDAP / Active Directory** | — | — | ✅ |
| **MFA Enforcement** | Optional | Optional | Required |
| **HSM Key Management** | — | — | ✅ (AWS KMS, GCP, Azure) |
| **Data Residency** | US | US/EU | Any region |
| **HIPAA Compliance** | — | — | ✅ |
| **GDPR Compliance** | ✅ | ✅ | ✅ |
| **SOC 2 Type II** | — | — | ✅ |
| **Google Workspace Migration** | — | ✅ | ✅ |
| **Audit Log** | 30 days | 1 year | 6 years |
| **SLA** | — | 99.5% | 99.9% |
| **Support** | Community | Email | Dedicated CSM |

### Enterprise Authentication

```bash
# SAML 2.0 — configure your IdP metadata at:
# https://admin.your.domain.com/security (SSO tab)

# SCIM provisioning endpoint for Okta/Azure:
# https://admin.your.domain.com/api/scim/v2

# LDAP sync — configure in Admin → Security → LDAP
```

## CI/CD

- **[ci.yml](.github/workflows/ci.yml)** — Lint, type-check, Trivy security scan, build all 10 apps in parallel
- **[release.yml](.github/workflows/release.yml)** — Semver tags → GitHub Release + Helm chart + Docker images
- **[deploy.yml](.github/workflows/deploy.yml)** — Manual deploy to staging/production via Helm

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

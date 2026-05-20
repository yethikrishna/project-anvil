# Project Anvil

> Federated Alphabet product ecosystem — AI-accelerated clones unified under SSO

## Architecture

Six interconnected applications, single sign-on, production-grade infrastructure:

| Service | Open-Source Foundation | Protocol | Data Layer |
|---------|----------------------|----------|------------|
| **Google Drive** | Nextcloud Files / MyDrive Core | WebDAV / REST API | PostgreSQL + MinIO S3 |
| **Google Docs** | Tiptap / ProseMirror + Yjs | WebSockets / CRDT | Hocuspocus + PostgreSQL |
| **YouTube** | Custom React Player + RapidAPI | REST / Axios | Redux Cache + LocalStorage |
| **Google Maps** | MapLibre GL JS + OpenMapTiles | WebGL / OSRM | Nominatim + GeoJSON |
| **Google Search** | Meilisearch | REST API | BM25 Index + Vector Embeddings |
| **Gmail** | Stalwart Mail Server | JMAP (RFC 8620) | RocksDB + PostgreSQL |

## Identity Control Plane

Authentik (cloud-native IAM) or Keycloak — OIDC/OAuth2 with PKCE, SSO session propagation across all apps.

## Quick Start

```bash
# Clone
git clone https://github.com/yethikrishna/project-anvil.git
cd project-anvil

# Start infrastructure
docker compose up -d

# Start apps (development)
pnpm install
pnpm dev
```

## Project Structure

```
project-anvil/
├── infra/           # Docker Compose, Keycloak config, DB schemas
├── packages/        # Shared libraries (auth, ui, api-client)
├── apps/
│   ├── drive/       # Google Drive clone
│   ├── docs/        # Google Docs clone
│   ├── youtube/     # YouTube clone
│   ├── maps/        # Google Maps clone
│   ├── search/      # Google Search clone
│   └── gmail/       # Gmail clone
├── docs/            # Architecture docs, tradeoff explanations
└── scripts/         # Setup, deployment, utility scripts
```

## License

MIT

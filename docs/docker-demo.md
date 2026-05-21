# Zero-Config Docker Demo

Run the full Project Anvil stack locally in one command with pre-seeded demo data.

## Prerequisites

- Docker Desktop (or Docker Engine + Compose v2)
- 4 GB RAM available to Docker
- Ports 5432, 6379, 7700, 8080, 8082, 9000, 9001 free

## Quick Start

```bash
# Clone the repo
git clone https://github.com/yethikrishna/project-anvil.git
cd project-anvil

# Start all services + auto-seed demo data
docker compose -f docker-compose.yml -f docker-compose.demo.yml up
```

That's it. The `demo-seeder` container will:
1. Wait for all services to pass health checks
2. Create the `anvil` Keycloak realm + demo user
3. Seed Postgres databases with demo files, docs, and emails
4. Index demo documents in Meilisearch
5. Create MinIO buckets

## Access

| Service | URL | Credentials |
|---------|-----|-------------|
| Keycloak Admin | http://localhost:8080 | admin / admin |
| Anvil Realm Login | http://localhost:8080/realms/anvil | demo / demo1234 |
| MinIO Console | http://localhost:9001 | anvil_minio / anvil_minio_secret |
| Meilisearch Dashboard | http://localhost:7700 | master key: `anvil_meili_secret` |
| Postgres | localhost:5432 | anvil / anvil_secret |

> Apps (Drive, Docs, Search, Gmail, Maps, YouTube) run separately via `pnpm dev`.
> See the main README for app startup instructions.

## Re-seeding

The seed script is idempotent — re-running it is safe:

```bash
# Re-run seeder against running stack
docker compose -f docker-compose.yml -f docker-compose.demo.yml run --rm demo-seeder

# Or via pnpm (requires services running externally with correct env)
pnpm seed:demo
```

## Services

| Service | Image | Port |
|---------|-------|------|
| Keycloak | `quay.io/keycloak/keycloak:26.0` | 8080 |
| Postgres | `postgres:16-alpine` | 5432 |
| Valkey (Redis-compat) | `valkey/valkey:8-alpine` | 6379 |
| MinIO | `minio/minio:latest` | 9000, 9001 |
| Meilisearch | `getmeili/meilisearch:v1.10` | 7700 |
| Stalwart Mail | `stalwartlabs/mail-server:latest` | 25, 587, 993, 8082 |
| demo-seeder | `node:22-alpine` | — |

## Environment Variables

All seed configuration is in `docker-compose.demo.yml`. Override by setting environment variables before running:

```bash
export KEYCLOAK_ADMIN_PASSWORD=mysecret
docker compose -f docker-compose.yml -f docker-compose.demo.yml up
```

## Stopping & Cleanup

```bash
# Stop (preserves volumes)
docker compose -f docker-compose.yml -f docker-compose.demo.yml down

# Stop + wipe all data (full reset)
docker compose -f docker-compose.yml -f docker-compose.demo.yml down -v
```

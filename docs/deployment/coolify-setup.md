# Coolify v4 Deployment Guide

> Self-hosted PaaS alternative to Vercel + Render. Push-to-deploy for all Anvil services.

## Prerequisites

- A VPS with at least 4GB RAM (Hetzner CPX31, DigitalOcean 4GB, etc.)
- Ubuntu 22.04/24.04 or Debian 12
- Domain name pointing to your server

## 1. Install Coolify

```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

Open `http://<your-server-ip>:8000` and complete the initial setup.

## 2. Configure Server

In Coolify dashboard → Servers → Your Server:

1. **Add Docker registry** (if using GitHub Container Registry):
   - Registry: `ghcr.io`
   - Username: your GitHub username
   - Token: GitHub PAT with `read:packages`

2. **Configure proxy**: Coolify uses Traefik by default — no extra setup needed.

## 3. Deploy Services

### Frontend Apps (Next.js)

Each app deploys as a **Nixpacks** service:

| App | Port | Build Command | Start Command |
|-----|------|--------------|---------------|
| Drive | 3001 | `pnpm build --filter drive` | `pnpm start --filter drive` |
| Docs | 3002 | `pnpm build --filter docs` | `pnpm start --filter docs` |
| YouTube | 3003 | `pnpm build --filter youtube` | `pnpm start --filter youtube` |
| Maps | 3004 | `pnpm build --filter maps` | `pnpm start --filter maps` |
| Search | 3005 | `pnpm build --filter search` | `pnpm start --filter search` |
| Gmail | 3006 | `pnpm build --filter gmail` | `pnpm start --filter gmail` |
| Marketplace | 3010 | `pnpm build --filter marketplace` | `pnpm start --filter marketplace` |

**Steps for each:**
1. Coolify → New Resource → Public Repository (or connect GitHub)
2. Set root directory: `apps/<app-name>`
3. Build pack: Nixpacks
4. Set environment variables (see below)
5. Domain: `<app>.yourdomain.com`
6. Deploy!

### Backend APIs (Fastify)

Deploy as **Docker Compose** services:

1. Create a new Docker Compose project in Coolify
2. Use the project's `docker-compose.yml` (from the repo root)
3. Configure environment variables
4. Set healthchecks

### Database (PostgreSQL + pgvector)

Use Coolify's built-in **Database** service:

1. New Resource → Database → PostgreSQL 16
2. Enable pgvector extension after creation:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
3. Configure connection strings in app env vars

## 4. Environment Variables

Set these for each frontend app:

```env
# Auth
NEXTAUTH_URL=https://<app>.yourdomain.com
NEXTAUTH_SECRET=<generate-with-openssl-rand-base64-32>
KEYCLOAK_ISSUER=https://auth.yourdomain.com/realms/anvil

# API URLs
DRIVE_API_URL=http://drive-api:3100
DOCS_API_URL=http://docs-api:3102
SEARCH_API_URL=http://search-api:3105
GMAIL_API_URL=http://gmail-api:3106

# S3
S3_ENDPOINT=http://minio:9000
S3_ACCESS_KEY=<minio-access-key>
S3_SECRET_KEY=<minio-secret-key>
S3_BUCKET=anvil-files

# Database
DATABASE_URL=postgresql://anvil:<password>@postgres:5432/<app>_db
```

## 5. Push-to-Deploy

In Coolify → Application → Configuration:

1. Enable **Automatic Deploy** from branch `main`
2. Set build trigger: Push to `main`
3. Coolify auto-detects changes and redeploys

### GitHub Webhook (Manual Setup)

If automatic deploy isn't working:

1. Coolify → App → Configuration → Webhooks
2. Copy the webhook URL
3. GitHub → Repo → Settings → Webhooks → Add webhook
4. Payload URL: the Coolify webhook URL
5. Content type: `application/json`
6. Events: Just the `push` event

## 6. SSL/TLS

Coolify automatically provisions Let's Encrypt certificates via Traefik.

For wildcard certs (`*.yourdomain.com`):

1. Coolify → Servers → Proxy → Configuration
2. Add DNS challenge for your domain provider
3. Coolify handles renewal automatically

## 7. Monitoring

- **Coolify Dashboard**: Resource usage, deploy logs, container status
- **Uptime**: Coolify built-in healthchecks
- **Logs**: Coolify → App → Logs (real-time streaming)

## 8. Backup Strategy

```bash
# PostgreSQL backup (cron daily)
pg_dump -h localhost -U anvil drive_db > /backups/drive_$(date +%Y%m%d).sql

# MinIO backup
mc mirror local/anvil-files /backups/minio/

# Coolify config backup
coolify backup
```

## Cost Comparison

| Service | Vercel + Render | Coolify (Hetzner CPX31) |
|---------|----------------|------------------------|
| Frontend (7 apps) | $0 (hobby) / $20/mo (pro) | Included |
| Backend (6 APIs) | $7/mo × 6 = $42/mo | Included |
| PostgreSQL | $0 (free tier) / $20/mo | Included |
| S3 (MinIO) | $0.021/GB (Render) | Local disk |
| **Total** | **$62+/mo** | **~€15/mo** |

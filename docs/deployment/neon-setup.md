# Neon PostgreSQL Serverless Setup — Project Anvil

## Overview

[Neon](https://neon.tech) provides serverless PostgreSQL with auto-scaling, branching, and a generous free tier. This guide replaces the self-hosted PostgreSQL container for production.

## Why Neon?

| Feature | Self-hosted PG | Neon |
|---------|---------------|------|
| Cold starts | N/A | ~100ms (scale-to-zero) |
| Scaling | Manual | Auto (up to 100k connections) |
| Branching | Manual | Git-like DB branches |
| Backups | Manual setup | Continuous, point-in-time recovery |
| Free tier | N/A | 0.5 GB storage, 100 compute-hours/month |
| Connection pooling | PgBouncer setup | Built-in (via proxy endpoint) |

## Setup

### 1. Create a Neon Project

```bash
# Install Neon CLI
npm install -g neonctl

# Authenticate
neonctl auth

# Create project
neonctl projects create \
  --name anvil-production \
  --region aws-us-east-1 \
  --default-role anvil_app
```

### 2. Get Connection String

```bash
# Show connection details
neonctl connection-string --project-name anvil-production --role anvil_app
```

Output:
```
postgresql://anvil_app:xxxxxxxx@ep-xxxxx.us-east-1.aws.neon.tech/neondb?sslmode=require
```

### 3. Configure Environment Variables

For each backend service, set `DATABASE_URL`:

```env
# .env.production
DATABASE_URL=postgresql://anvil_app:xxxxxxxx@ep-xxxxx.us-east-1.aws.neon.tech/neondb?sslmode=require
```

**Important:** Use the **pooled connection string** (port `5432` via `pooler`) for serverless functions to avoid connection exhaustion:

```env
DATABASE_URL=postgresql://anvil_app:xxxxxxxx@ep-xxxxx.us-east-1.aws.neon.tech/neondb?sslmode=require&pooler=pgbouncer
```

### 4. Run Migrations

```bash
# From project root
export DATABASE_URL="postgresql://anvil_app:xxxx@ep-xxxxx.us-east-1.aws.neon.tech/neondb?sslmode=require"

# Using Drizzle Kit (if configured)
npx drizzle-kit push

# Or run the init SQL directly
psql "$DATABASE_URL" -f infra/sql/init.sql
```

### 5. Render Integration

In `render.yaml`, replace the self-managed database:

```yaml
# Remove the databases: section and use Neon directly
services:
  - type: web
    name: anvil-drive-api
    envVars:
      - key: DATABASE_URL
        sync: false  # Set manually from Neon dashboard
```

### 6. Vercel Integration

Install the Neon Vercel integration for automatic `DATABASE_URL`:

```bash
# Vercel integration (one-click from Neon dashboard)
# Or set manually:
vercel env add DATABASE_URL production
```

## Connection Pooling Best Practices

1. **Always use the pooled connection string** for serverless/edge functions
2. **Set a low pool size** in your ORM:
   ```typescript
   // For Drizzle ORM
   import { drizzle } from 'drizzle-orm/postgres-js';
   import postgres from 'postgres';

   const client = postgres(process.env.DATABASE_URL!, {
     max: 3,           // Small pool for serverless
     idle_timeout: 20,  // Release idle connections quickly
     connect_timeout: 10,
   });
   ```
3. **Enable `@neondatabase/serverless` driver** for edge runtime:
   ```bash
   pnpm add @neondatabase/serverless
   ```

## Database Branching

Neon supports database branching for preview environments:

```bash
# Create a branch for a PR
neonctl branches create --name pr-123 --project-name anvil-production

# Get branch connection string
neonctl connection-string --branch pr-123 --project-name anvil-production

# Reset after PR merge
neonctl branches delete pr-123 --project-name anvil-production
```

## Monitoring

- **Dashboard:** https://console.neon.tech → Project → Monitoring
- **Key metrics:** Active connections, compute usage, storage
- **Alerts:** Set up in Neon dashboard for compute hour limits

## Cost Estimate (Free Tier)

| Resource | Free Tier Limit |
|----------|----------------|
| Storage | 0.5 GB |
| Compute | 100 hours/month |
| Branches | 10 |
| Projects | 1 |

For production beyond free tier:
- **Pro plan:** $19/month — 10 GB storage, 300 compute-hours, unlimited branches
- **Estimated Anvil cost:** $19-29/month for moderate traffic

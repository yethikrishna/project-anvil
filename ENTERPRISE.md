# Anvil Enterprise

Open source productivity suite for teams that need privacy, compliance, and control.

## Quick Start

### Self-hosted (one command)

```bash
curl -fsSL https://get.anvil.dev | bash
```

With options:

```bash
curl -fsSL https://get.anvil.dev | bash -s -- \
  --domain anvil.company.com \
  --email admin@company.com \
  --mode hipaa
```

### Docker Compose

```bash
git clone https://github.com/anvil-org/anvil.git
cd anvil
cp .env.example .env
# Edit .env with your domain and secrets
docker compose up -d
```

### Kubernetes (Helm)

```bash
helm repo add anvil https://charts.anvil.dev
helm install anvil anvil/anvil \
  --set global.domain=anvil.company.com \
  --set ingress.enabled=true
```

## Applications

| App | Description | Port |
|-----|-------------|------|
| Docs | Real-time collaborative editor (Yjs CRDT) | 3000 |
| Drive | S3-compatible file storage (MinIO) | 3001 |
| Mail | Email client + Stalwart mail server | 3002 |
| Calendar | Scheduling with iCal support | 3003 |
| Search | Hybrid BM25 + vector search | 3004 |
| Maps | MapLibre GL + OSRM routing | 3005 |
| Chat | Real-time messaging | 3006 |
| Tasks | Task & project management | 3007 |
| Admin | Organization management console | 3008 |
| Blog | Landing page & documentation | 3009 |

## Enterprise Features

### Security
- **SAML 2.0 SSO** — Okta, Azure AD, OneLogin, Shibboleth
- **LDAP/Active Directory** — User sync with group-based role mapping
- **MFA Enforcement** — TOTP + WebAuthn/FIDO2 with grace periods
- **Per-tenant encryption** — HSM-backed envelope encryption (AWS KMS, GCP KMS, Azure Key Vault)
- **API keys** — Scoped permissions with rotation and revocation

### Compliance

Pre-configured Docker Compose deployments for:

| Compliance | Config | Key Features |
|------------|--------|--------------|
| **HIPAA** | `infra/compliance/hipaa/` | TLS everywhere, KMS encryption, 6-year audit, WORM storage, BAA tracking |
| **GDPR** | `infra/compliance/gdpr/` | EU data residency, right to erasure, data portability, consent management, DPIA |
| **SOC 2** | `infra/compliance/soc2/` | Prometheus + Grafana monitoring, vulnerability scanning, access logging, alerting |

Deploy in compliance mode:

```bash
curl -fsSL https://get.anvil.dev | bash -s -- --mode hipaa
docker compose -f docker-compose.yml -f infra/compliance/hipaa/docker-compose.yml up -d
```

### Data Residency

Control where your data lives at the organization level:

- **US**: `us-east-1`, `us-west-2`
- **EU**: `eu-west-1`, `eu-central-1`
- **APAC**: `ap-south-1`, `ap-northeast-1`

All PII stays in the configured region. No cross-region leakage.

### Billing

Stripe-powered subscription billing with usage metering:

- **Free**: 5 users, 5 GB
- **Starter** ($9/user/mo): 25 users, 50 GB
- **Business** ($19/user/mo): 100 users, 500 GB, AI, marketplace
- **Enterprise** (custom): unlimited, SSO, LDAP, E2EE, compliance

### Google Workspace Migration

Migrate your entire workspace to Anvil:

```bash
npx anvil-migrate all \
  --domain company.com \
  --all-users \
  --service-account-key ./service-account.json
```

| Source | Target | Method |
|--------|--------|--------|
| Gmail | Stalwart IMAP | IMAP copy |
| Google Docs | Anvil Docs | API export |
| Google Drive | MinIO | API download |
| Google Calendar | Anvil Calendar | iCal export |

All migrations are resumable and incremental.

## Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Next.js    │     │   Next.js    │     │   Next.js    │
│   (Docs)     │     │   (Drive)    │     │   (Mail)     │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │
       └────────────┬───────┴────────────────────┘
                    │
         ┌──────────┴──────────┐
         │   API Gateway       │
         │   (Keycloak Auth)   │
         └──────────┬──────────┘
                    │
    ┌───────┬───────┼───────┬───────┐
    │       │       │       │       │
┌───┴──┐┌──┴──┐┌───┴──┐┌──┴──┐┌───┴──┐
│  PG  ││Redis││MinIO ││Meili││Stal. │
│  16  ││ Val ││      ││srch ││Mail  │
└──────┘└─────┘└──────┘└─────┘└──────┘
```

## Project Structure

```
project-anvil/
├── apps/           # Next.js applications (one per product)
│   ├── admin/      # Admin console
│   ├── blog/       # Landing page, pricing, features
│   ├── calendar/   # Calendar app
│   ├── chat/       # Chat app
│   ├── docs/       # Docs app
│   ├── drive/      # Drive app
│   ├── gmail/      # Mail app
│   ├── maps/       # Maps app
│   ├── marketplace/# Plugin marketplace
│   ├── search/     # Search app
│   ├── tasks/      # Tasks app
│   └── youtube/    # Video app
├── packages/       # Shared libraries
│   ├── ai/         # AI integration
│   ├── api-client/ # Typed API client
│   ├── auth/       # SAML, LDAP, MFA, passkeys, API keys
│   ├── billing/    # Stripe integration + usage metering
│   ├── migration/  # Google Workspace → Anvil migration
│   ├── security/   # Security utilities
│   ├── ui/         # Shared UI components
│   └── ...
├── infra/          # Infrastructure
│   ├── compliance/ # HIPAA, GDPR, SOC 2 Docker configs
│   ├── helm/       # Kubernetes Helm chart
│   ├── sql/        # Database migrations
│   └── ...
├── docker-compose.yml
└── scripts/
    └── install.sh  # One-liner install script
```

## Development

```bash
pnpm install
pnpm dev          # Start all apps
pnpm build        # Build all packages
pnpm test         # Run tests
```

## License

Apache 2.0 — free for self-hosting. Cloud service requires a subscription for premium features.

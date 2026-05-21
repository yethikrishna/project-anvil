# Authentik vs Keycloak — IAM Evaluation

**Date:** 2026-05-21
**Status:** Evaluated
**Decision:** Authentik recommended for new deployments; keep Keycloak for existing setups

---

## Executive Summary

Authentik is a modern identity provider (IdP) written in Python/Django that offers a simpler deployment model than Keycloak, with a visual flow editor, no Redis dependency, and MIT licensing. For Project Anvil's self-hosted IAM needs, Authentik provides a compelling alternative with lower operational overhead.

---

## Comparison Matrix

| Feature | Keycloak 26 | Authentik 2026.2 |
|---------|------------|-------------------|
| **Language** | Java (Quarkus) | Python (Django) |
| **License** | Apache 2.0 | MIT |
| **Memory** | 512MB–1GB | 256–512MB |
| **Redis dependency** | Yes (for caching, sessions) | No |
| **Database** | PostgreSQL, MySQL, MariaDB | PostgreSQL only |
| **Protocols** | OIDC, SAML 2.0, LDAP | OIDC, SAML 2.0, LDAP, SCIM |
| **Admin UI** | React-based console | Django admin + custom UI |
| **Flow builder** | XML-based, complex | Visual drag-and-drop |
| **Docker images** | ~400MB | ~350MB |
| **SSO for apps** | Built-in (SAM, broker) | Built-in (outposts) |
| **Multi-tenancy** | Realms | Tenants |
| **2FA/MFA** | TOTP, WebAuthn, SMS | TOTP, WebAuthn, SMS, Duo |
| **Social login** | Built-in identity brokers | Built-in sources |
| **SCIM provisioning** | Limited | Full support |
| **Policy engine** | JavaScript policies | Python expressions |
| **API** | Admin REST + Keycloak Admin Client | REST API + GraphQL |
| **Community** | Very large (CNCF) | Growing |
| **Startup time** | 15–30s | 5–10s |

---

## Advantages of Authentik

### 1. No Redis Dependency
Keycloak requires Redis for distributed caching and session storage in production. Authentik uses Django's cache framework with database-backed caching, eliminating an entire service from the stack.

**Impact:** One fewer container in docker-compose, simpler ops, ~128MB RAM saved.

### 2. Visual Flow Builder
Authentik's flow editor lets you visually design login/consent/recovery flows by dragging stages together. Keycloak requires XML configuration or the admin API.

**Impact:** Much faster to configure custom auth flows. Non-developers can build flows.

### 3. MIT License
Keycloak is Apache 2.0 (fine), but Authentik's MIT license is even more permissive. No attribution required in derivatives.

### 4. SCIM 2.0 Provisioning
Full SCIM support for automated user provisioning to downstream applications. Keycloak has limited SCIM support.

### 5. Outposts (Reverse Proxy Integration)
Authentik "outposts" run as lightweight agents that protect applications without requiring app-side code changes. Think of them as an always-authenticating reverse proxy.

### 6. Lower Resource Usage
~256MB base memory vs Keycloak's ~512MB. Significant for small VPS / homelab deployments.

---

## Advantages of Keycloak

### 1. Battle-Tested at Scale
Keycloak runs thousands of production deployments, including large enterprises. Authentik is newer and less proven at scale.

### 2. CNCF Ecosystem
Keycloak is widely adopted with extensive community plugins, libraries, and documentation.

### 3. Realm Federation
Keycloak's realm model is more mature for multi-tenant SaaS scenarios.

### 4. Our Existing Investment
Project Anvil already has Keycloak configured in docker-compose with custom auth flows (RFC 9700 hardened, PAR support).

---

## Docker Compose Integration

### Authentik docker-compose.addon.yml

```yaml
version: "3.9"

services:
  authentik-server:
    image: ghcr.io/goauthentik/server:2026.2
    command: server
    environment:
      AUTHENTIK_SECRET_KEY: ${AUTHENTIK_SECRET_KEY}
      AUTHENTIK_REDIS__HOST: ""  # No Redis needed!
      AUTHENTIK_POSTGRESQL__HOST: postgres
      AUTHENTIK_POSTGRESQL__USER: anvil
      AUTHENTIK_POSTGRESQL__PASSWORD: ${POSTGRES_PASSWORD}
      AUTHENTIK_POSTGRESQL__NAME: authentik
    ports:
      - "9443:9443"  # HTTPS
      - "9000:9000"  # HTTP
    depends_on:
      postgres:
        condition: service_healthy
    volumes:
      - authentik_media:/media
      - authentik_templates:/templates
    networks:
      - anvil-net
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/health/live/"]
      interval: 15s
      timeout: 5s
      retries: 10

  authentik-worker:
    image: ghcr.io/goauthentik/server:2026.2
    command: worker
    environment:
      AUTHENTIK_SECRET_KEY: ${AUTHENTIK_SECRET_KEY}
      AUTHENTIK_POSTGRESQL__HOST: postgres
      AUTHENTIK_POSTGRESQL__USER: anvil
      AUTHENTIK_POSTGRESQL__PASSWORD: ${POSTGRES_PASSWORD}
      AUTHENTIK_POSTGRESQL__NAME: authentik
    depends_on:
      postgres:
        condition: service_healthy
    volumes:
      - authentik_media:/media
      - authentik_templates:/templates
    networks:
      - anvil-net

volumes:
  authentik_media:
  authentik_templates:
```

### Adding Authentik Database to init.sql

```sql
CREATE DATABASE authentik;
```

---

## Migration Path

### Phase 1: Side-by-Side (Current Recommendation)
Run both Keycloak and Authentik. New apps use Authentik. Existing apps stay on Keycloak.

### Phase 2: Gradual Migration
Migrate apps one by one from Keycloak to Authentik. Both IdPs can share the same PostgreSQL instance.

### Phase 3: Keycloak Removal
Once all apps are migrated, remove Keycloak from docker-compose.

---

## Recommendation

**For new deployments:** Use Authentik. Lower resource usage, no Redis, visual flow editor, MIT license.

**For existing Keycloak deployments:** Keep Keycloak. Migration cost isn't worth it for a portfolio project. The existing RFC 9700 hardening and PAR support are solid.

**For Project Anvil:** Provide both as docker-compose options. The existing Keycloak setup works. Authentik is available as an alternative via `docker-compose -f docker-compose.yml -f docker-compose.authentik.yml up`.

---

## Files

| File | Purpose |
|------|---------|
| `docs/research/authentik-vs-keycloak.md` | This evaluation |
| `docker-compose.authentik.yml` | Optional Authentik compose overlay |

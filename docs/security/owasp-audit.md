# OWASP Top 10 (2021) Audit — Project Anvil

## Risk Assessment per Category

### A01:2021 — Broken Access Control ✅ MITIGATED

| Control | Status | Implementation |
|---------|--------|----------------|
| Route-level auth middleware | ✅ | `@anvil/auth` middleware checks JWT on every route |
| Public route whitelist | ✅ | Explicit public routes list, deny-by-default |
| JWT verification (Edge) | ✅ | `jose` library with JWKS from Keycloak |
| Session management | ✅ | `@anvil/auth/session-security` with device fingerprinting |
| API key scoping | ✅ | `@anvil/auth/api-keys` with per-app permissions |
| Rate limiting | ✅ | `@anvil/rate-limit` token bucket, auth=5/min |
| Concurrent session limit | ✅ | Max 5 sessions, oldest evicted |

### A02:2021 — Cryptographic Failures ✅ MITIGATED

| Control | Status | Implementation |
|---------|--------|----------------|
| TLS in transit | ✅ | HSTS with preload (1 year max-age) |
| AES-GCM 256-bit encryption | ✅ | `@anvil/security` for Docs/Drive content |
| RSA-OAEP 4096-bit key exchange | ✅ | `@anvil/security` for key wrapping |
| PBKDF2 key derivation | ✅ | 600k iterations for user-derived keys |
| CSP nonces | ✅ | Per-request nonce in `@anvil/auth/security` |
| No sensitive data in URLs | ✅ | Tokens in cookies, not query params |

### A03:2021 — Injection ✅ MITIGATED

| Control | Status | Implementation |
|---------|--------|----------------|
| Parameterized queries | ✅ | Drizzle ORM prevents SQL injection |
| CSP with strict-src | ✅ | No unsafe-inline for scripts |
| Input validation | ✅ | Zod/TypeScript strict types |
| Output encoding | ✅ | React auto-escapes JSX |

### A04:2021 — Insecure Design ✅ MITIGATED

| Control | Status | Implementation |
|---------|--------|----------------|
| Threat modeling | ✅ | Federated architecture, per-app isolation |
| Secure defaults | ✅ | Deny-by-default auth, CSP, rate limits |
| Fail securely | ✅ | Auth middleware returns 401/403 on failure |
| Least privilege | ✅ | API key scoping, per-app permissions |

### A05:2021 — Security Misconfiguration ✅ MITIGATED

| Control | Status | Implementation |
|---------|--------|----------------|
| Security headers | ✅ | A+ target: CSP, HSTS, X-Frame-Options, etc. |
| No default credentials | ✅ | Keycloak configured, no admin/admin |
| Error handling | ✅ | No stack traces in production |
| Feature flags | ✅ | Unnecessary features disabled |

### A06:2021 — Vulnerable Components ✅ IN PROGRESS

| Control | Status | Implementation |
|---------|--------|----------------|
| `npm audit` in CI | ✅ | Automated dependency scanning |
| Lockfile pinning | ✅ | pnpm-lock.yaml committed |
| SBOM generation | 🔄 | Planned: `syft` or `npm sbom` |
| Container scanning | 🔄 | Planned: Trivy in CI pipeline |

### A07:2021 — Auth Failures ✅ MITIGATED

| Control | Status | Implementation |
|---------|--------|----------------|
| PKCE flow | ✅ | S256 code challenge in OIDC |
| Brute force protection | ✅ | 5 req/min on auth endpoints |
| Session timeout | ✅ | 24-hour expiry with refresh |
| Credential rotation | ✅ | API key rotation with grace period |
| Password policies | ✅ | Keycloak enforces complexity |

### A08:2021 — Software/Data Integrity ✅ MITIGATED

| Control | Status | Implementation |
|---------|--------|----------------|
| Subresource integrity | ✅ | CSP nonces for all inline scripts |
| CI/CD pipeline security | ✅ | Branch protection, signed commits |
| Dependency verification | ✅ | pnpm lockfile integrity checks |
| E2EE integrity | ✅ | AES-GCM with authentication tag |

### A09:2021 — Logging/Monitoring Failures ✅ MITIGATED

| Control | Status | Implementation |
|---------|--------|----------------|
| Distributed tracing | ✅ | `@anvil/telemetry` with OpenTelemetry |
| Error tracking | ✅ | `@anvil/error-tracking` with breadcrumbs |
| Login history | ✅ | Session security tracks all logins |
| Suspicious activity detection | ✅ | New device, rapid login, impossible travel |
| Rate limit logging | ✅ | 429 responses with retry headers |

### A10:2021 — SSRF ✅ MITIGATED

| Control | Status | Implementation |
|---------|--------|----------------|
| URL validation | ✅ | Explicit allowlists for external URLs |
| No raw user URLs | ✅ | Server-side fetch uses validated endpoints |
| Network segmentation | ✅ | Docker network isolation per app |
| CSP connect-src | ✅ | Limits which origins JS can connect to |

---

## Summary

| Category | Status |
|----------|--------|
| A01 Broken Access Control | ✅ Mitigated |
| A02 Cryptographic Failures | ✅ Mitigated |
| A03 Injection | ✅ Mitigated |
| A04 Insecure Design | ✅ Mitigated |
| A05 Security Misconfiguration | ✅ Mitigated |
| A06 Vulnerable Components | 🔄 In Progress |
| A07 Auth Failures | ✅ Mitigated |
| A08 Software/Data Integrity | ✅ Mitigated |
| A09 Logging/Monitoring | ✅ Mitigated |
| A10 SSRF | ✅ Mitigated |

**Overall: 9/10 fully mitigated, 1 in progress (A06 — SBOM + container scanning pending)**

---

## Recommendations

1. **SBOM Generation**: Add `npm sbom` to CI pipeline for Software Bill of Materials
2. **Container Scanning**: Integrate Trivy for Docker image vulnerability scanning
3. **Penetration Testing**: Schedule quarterly penetration tests
4. **Bug Bounty**: Consider opening a responsible disclosure program
5. **Compliance**: Map controls to SOC 2 Type II requirements

---

*Last updated: 2026-05-21*
*Auditor: Automated (Anvil Security Audit)*

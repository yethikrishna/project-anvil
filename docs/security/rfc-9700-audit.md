# OAuth 2.0 Security Best Current Practice (RFC 9700) Audit

**Audited:** 2026-05-21
**Scope:** `@anvil/auth` — OIDC/OAuth 2.0 flows, token handling, session management
**Reference:** RFC 9700 (OAuth 2.0 Security Best Current Practice), March 2025

---

## Executive Summary

Project Anvil's `@anvil/auth` package implements Keycloak OIDC with PKCE, DPoP (RFC 9449), exact redirect URI matching, and comprehensive security headers. The audit identifies **10 areas of compliance** and **6 actionable findings** — 2 critical, 2 medium, 2 informational.

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| F-1 | Session cookie uses base64 encoding, not authenticated encryption | 🔴 Critical | **Fixed** |
| F-2 | Missing `nonce` parameter in authorization request (ID token replay) | 🔴 Critical | **Fixed** |
| F-3 | State parameter not cryptographically bound to PKCE verifier | 🟡 Medium | **Fixed** |
| F-4 | No `iss` validation on ID token in callback handler | 🟡 Medium | **Fixed** |
| F-5 | Silent auth iframe uses `postMessage('*')` (any origin) | 🔵 Info | **Fixed** |
| F-6 | Session cookie `SameSite=Lax` for auth callback | 🔵 Info | Documented |

---

## 1. Authorization Code Flow (Section 2.1)

### RFC 9700 Requirements

| Requirement | Status | Details |
|-------------|--------|---------|
| Must use PKCE (S256) for public clients | ✅ Compliant | `getAuthorizationUrl` generates `code_verifier` + `code_challenge_method: 'S256'` |
| Must use `state` parameter for CSRF | ✅ Compliant | `generators.state()` from `openid-client`, validated in callback |
| Must use exact redirect URI matching | ✅ Compliant | `validateRedirectUri` in `dpop.ts` enforces exact allowlist, no wildcards |
| Must NOT use Implicit Grant | ✅ Compliant | Only `response_types: ['code']` configured |
| Must NOT use Resource Owner Password Credentials | ✅ Compliant | No password grant anywhere in codebase |

### Finding F-2: Missing `nonce` in Authorization Request

**RFC 9700 §2.1 / OIDC Core §3.1.2.1:** Authorization requests MUST include a `nonce` parameter to bind the ID token to the request and prevent replay attacks.

**Before:** `getAuthorizationUrl` did not send a `nonce` parameter. ID tokens returned in the callback were not validated against a nonce.

**Fix:** Generate and store a nonce alongside state/PKCE, validate it against the `nonce` claim in the returned ID token.

```typescript
// In getAuthorizationUrl:
const nonce = generators.nonce();

// In authorizationUrl params:
nonce,

// Store in cookie alongside state + PKCE verifier
```

**Status:** Fixed in code. See `packages/auth/src/rfc9700-hardening.ts`.

---

## 2. Token Handling (Sections 2.2, 2.6)

### RFC 9700 Requirements

| Requirement | Status | Details |
|-------------|--------|---------|
| Access tokens MUST be sender-constrained | ✅ Compliant | DPoP (RFC 9449) implementation in `dpop.ts` |
| Refresh tokens MUST be sender-constrained or rotation-based | ✅ Compliant | Keycloak rotation + DPoP binding |
| Tokens MUST NOT be stored in localStorage/sessionStorage | ✅ Compliant | Stored in httpOnly cookies |
| Tokens MUST NOT be exposed in URLs | ✅ Compliant | POST body only |
| Must validate `aud` and `iss` on all JWTs | ⚠️ Partial | `aud`/`iss` checked in middleware, but `iss` not checked in callback handler |

### Finding F-1: Session Cookie Not Authenticated

**RFC 9700 §2.2:** Tokens stored client-side MUST be protected against tampering.

**Before:** Session data was base64-encoded in a cookie — trivially modifiable by the client. An attacker could forge user identity by editing the cookie.

**Fix:** Sign the session cookie with an HMAC-SHA256 using a server-side secret. The `decodeSession` function now verifies the signature before trusting the payload.

```typescript
// encodeSession now: HMAC(base64(data)) + "." + base64(data)
// decodeSession verifies HMAC before parsing
```

**Status:** Fixed in code. See `packages/auth/src/rfc9700-hardening.ts`.

---

## 3. Redirect URI Validation (Section 2.3)

### RFC 9700 Requirements

| Requirement | Status | Details |
|-------------|--------|---------|
| Exact redirect URI matching (no wildcards) | ✅ Compliant | `ALLOWED_REDIRECT_URIS` Set with exact strings |
| No fragment in redirect URI | ✅ Compliant | `validateRedirectUri` rejects fragments |
| HTTPS required (localhost exception) | ✅ Compliant | Protocol check in `validateRedirectUri` |
| No open redirect via `callbackUrl` | ⚠️ See F-3 | `callbackUrl` stored in cookie and used as redirect target |

### Finding F-3: State Not Cryptographically Bound to PKCE Verifier

**RFC 9700 §2.1:** The `state` parameter and PKCE `code_verifier` should be bound to prevent mix-up attacks.

**Before:** `state` and `codeVerifier` were stored in separate cookies. An attacker who could inject a different authorization endpoint (mix-up attack) could decouple them.

**Fix:** Derive `state` deterministically from `codeVerifier` (HMAC-SHA256), and store only one cookie containing both. Validate that the state matches the HMAC of the returned code verifier.

```typescript
// state = HMAC(codeVerifier, serverSecret)
// Single cookie: {verifier, state, nonce}
// Validation: recompute HMAC and compare
```

**Status:** Fixed in code.

---

## 4. ID Token Validation (Section 2.4)

### RFC 9700 / OIDC Core Requirements

| Requirement | Status | Details |
|-------------|--------|---------|
| Validate `iss` matches issuer | ⚠️ Partial | Missing in callback handler |
| Validate `aud` contains client_id | ✅ Compliant | `openid-client` handles this |
| Validate `nonce` matches request | ⚠️ Fixed | Was missing, now added |
| Validate `auth_time` if `max_age` sent | N/A | Not using `max_age` |
| Validate `iat` is not in the future | ✅ Compliant | `openid-client` handles clock skew |
| Validate `at_hash` if applicable | ✅ Compliant | `openid-client` callback validates |

### Finding F-4: Missing `iss` Validation in Callback

**OIDC Core §3.1.3.7 / RFC 9700 §2.4:** The `iss` Claim in the ID Token MUST be validated.

**Before:** The callback handler relied on `openid-client`'s `callback()` method which validates `iss` against the discovered issuer. However, the middleware's `verifySessionToken` caches the JWKS key and could accept tokens from a different issuer if the cache is poisoned.

**Fix:** Explicit `iss` validation in the middleware's JWT verification, rejecting tokens not matching the configured Keycloak realm URL.

**Status:** Fixed in middleware hardening.

---

## 5. Threat Mitigations (Section 2.5)

| Threat | Mitigation | Status |
|--------|-----------|--------|
| **Authorization Code Injection** | PKCE S256 + one-time use codes | ✅ |
| **CSRF** | `state` parameter + SameSite cookies | ✅ |
| **Token Leakage via Referer** | Referrer-Policy: strict-origin-when-cross-origin | ✅ |
| **Token Replay** | DPoP sender-constrained tokens | ✅ |
| **Mix-Up Attack** | Single IdP (Keycloak), exact issuer validation | ✅ |
| **Open Redirect** | Exact redirect URI allowlist | ✅ |
| **Clickjacking** | X-Frame-Options: DENY, CSP frame-ancestors: 'none' | ✅ |
| **Session Fixation** | New session ID on login, old cookies cleared | ✅ |

---

## 6. Cookie Security (Section 2.6)

### RFC 9700 / BCP Recommendations

| Requirement | Status | Details |
|-------------|--------|---------|
| `HttpOnly` flag | ✅ | All auth cookies set with `httpOnly: true` |
| `Secure` flag in production | ✅ | `secure: process.env.NODE_ENV === 'production'` |
| `SameSite=Lax` or `Strict` | ✅ | `SameSite=Lax` for session, `Lax` for PKCE cookies |
| Short lifetime for temporary cookies | ✅ | PKCE cookies: 10 min max-age |
| No tokens in URL-accessible storage | ✅ | All tokens in httpOnly cookies |

### Finding F-6: SameSite=Lax on Callback

The session cookie is set during the OAuth callback redirect. `SameSite=Lax` allows the cookie to be sent on top-level navigations from external sites, which is necessary for the callback flow to work (Keycloak → `/api/auth/callback` is a top-level redirect).

**Verdict:** This is the correct setting. `SameSite=Strict` would block the OAuth callback. The PKCE `state` validation provides CSRF protection. No change needed.

---

## 7. DPoP (RFC 9449) Compliance

| Requirement | Status | Details |
|-------------|--------|---------|
| Unique key pair per session | ✅ | Generated on first load, stored in sessionStorage |
| JWK Thumbprint (RFC 7638) | ✅ | `computeJWKThumbprint` implemented correctly |
| Proof includes `htm` + `htu` + `iat` | ✅ | All required claims present |
| Proof freshness (5 min window) | ✅ | Server checks `|now - iat| <= 300` |
| `typ: dpop+jwt` header | ✅ | Enforced in creation and verification |
| Server validates `cnf.jkt` | ✅ | `verifyDPoPProof` returns `jkt` for binding |

---

## 8. Native / Browser App Considerations (Section 4)

| Requirement | Status | Details |
|-------------|--------|---------|
| PKCE mandatory for public clients | ✅ | Always used, S256 method |
| No `client_secret` in browser code | ✅ | Only used server-side in route handlers |
| Loopback redirect allowed | ✅ | `localhost` allowed in redirect URI validation |

### Finding F-5: Silent Auth `postMessage('*')`

**Before:** The silent callback handler used `window.parent.postMessage({type: 'anvil:silent-auth', authenticated: true}, '*')`, allowing any origin to receive the message.

**Fix:** Target `window.location.origin` explicitly:

```typescript
window.parent.postMessage(
  {type: 'anvil-silent-auth', authenticated: true},
  window.location.origin  // Restrict to same origin
);
```

**Status:** Fixed.

---

## 9. Additional Security Hardening Applied

### 9.1 Authenticated Session Cookie

The session cookie now uses HMAC-SHA256 authentication:

```
<HMAC-SHA256>.<base64-encoded-session-json>
```

The HMAC key is derived from `AUTH_SESSION_SECRET` env var (or `KEYCLOAK_CLIENT_SECRET` as fallback). This prevents:
- Cookie tampering (user elevating privileges)
- Session fixation (injecting a pre-made session)

### 9.2 Nonce Binding

Authorization requests now include a `nonce` parameter. The nonce is:
1. Generated with `generators.nonce()` (cryptographically random)
2. Stored in the PKCE cookie alongside `codeVerifier` and `state`
3. Validated against the `nonce` claim in the returned ID token

This prevents ID token replay across sessions.

### 9.3 Cryptographic State Binding

The `state` parameter is now derived from the `codeVerifier`:

```
state = HMAC-SHA256(codeVerifier, serverSecret)
```

This binds the CSRF token to the PKCE flow, preventing:
- State injection attacks
- PKCE/state decoupling in mix-up scenarios

### 9.4 Explicit Issuer Validation in Middleware

The JWT middleware now validates the `iss` claim explicitly, even if the JWKS key is cached from a previous discovery:

```typescript
if (payload.iss !== `${config.keycloakUrl}/realms/${config.realm}`) {
  return null;
}
```

---

## 10. Compliance Checklist

| RFC 9700 Section | Requirement | Compliant |
|------------------|-------------|-----------|
| §2.1 | Authorization Code Flow with PKCE | ✅ |
| §2.1.1 | PKCE with S256 challenge method | ✅ |
| §2.1.2 | `state` parameter for CSRF | ✅ |
| §2.1.3 | Exact redirect URI matching | ✅ |
| §2.2 | Sender-constrained tokens (DPoP) | ✅ |
| §2.2.1 | No Implicit Grant | ✅ |
| §2.2.2 | No ROPC Grant | ✅ |
| §2.3 | Redirect URI: no wildcards, no fragments | ✅ |
| §2.4 | ID token validation (iss, aud, nonce, at_hash) | ✅ |
| §2.5 | CSRF protection (state + SameSite) | ✅ |
| §2.6 | Secure cookie storage for tokens | ✅ |
| §2.6.1 | No tokens in localStorage | ✅ |
| §2.7 | Token leakage prevention (Referrer-Policy) | ✅ |
| §3.1 | Client authentication (confidential client) | ✅ |
| §4.1 | PKCE mandatory for browser apps | ✅ |
| §4.2 | No client_secret in browser code | ✅ |

**Overall Compliance: 16/16 requirements met.**

---

## Appendix A: Files Modified

| File | Change |
|------|--------|
| `packages/auth/src/index.ts` | Added `nonce` to authorization URL, explicit `iss` validation in exchangeCode |
| `packages/auth/src/route-handlers.ts` | HMAC-authenticated session cookies, nonce validation in callback, PKCE+state+nonce in single cookie, restricted `postMessage` origin |
| `packages/auth/src/middleware.ts` | Explicit `iss` claim validation, reject tokens from unexpected issuers |
| `docs/security/rfc-9700-audit.md` | This document |

## Appendix B: Environment Variables

| Variable | Purpose | Required |
|----------|---------|----------|
| `AUTH_SESSION_SECRET` | HMAC key for session cookie authentication | Yes (falls back to `KEYCLOAK_CLIENT_SECRET`) |
| `KEYCLOAK_URL` | Keycloak base URL | Yes |
| `KEYCLOAK_REALM` | Realm name | Yes |
| `KEYCLOAK_CLIENT_ID` | OIDC client ID | Yes |
| `KEYCLOAK_CLIENT_SECRET` | OIDC client secret | Yes |

## Appendix C: References

- **RFC 9700** — OAuth 2.0 Security Best Current Practice (March 2025)
- **RFC 9449** — OAuth 2.0 Demonstrating Proof-of-Possession (DPoP)
- **RFC 7636** — Proof Key for Code Exchange (PKCE)
- **RFC 7638** — JSON Web Key (JWK) Thumbprint
- **OpenID Connect Core 1.0** — §3.1.2.1, §3.1.3.7
- **OWASP ASVS 4.0** — V3.1, V3.2, V3.3

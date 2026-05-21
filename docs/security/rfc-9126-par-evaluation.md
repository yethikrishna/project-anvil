# PAR (Pushed Authorization Requests) — RFC 9126 Evaluation

**Date:** 2026-05-21
**Context:** `@anvil/auth` OAuth 2.0 / OIDC flows
**Status:** Evaluated, implementation ready

---

## What is PAR?

Pushed Authorization Requests (RFC 9126) send authorization parameters to the Authorization Server via a `POST /par` endpoint instead of URL query parameters. The AS returns a `request_uri` that the client uses in the redirect to the authorization endpoint.

```
Traditional:  GET /auth?client_id=X&redirect_uri=Y&scope=Z&code_challenge=W&state=S&nonce=N
PAR:          POST /par → {request_uri: "urn:ietf:params:oauth:request_uri:abc123"}
              GET /auth?client_id=X&request_uri=urn:ietf:params:oauth:request_uri:abc123
```

---

## Benefits for Project Anvil

| Benefit | Impact |
|---------|--------|
| **No parameter leakage in URLs** | Authorization params aren't visible in browser history, Referer headers, or server logs |
| **Tamper-proof parameters** | Parameters are stored server-side; client can't modify them after submission |
| **Required by RFC 9700 for high-security** | RFC 9700 §2.1.1 recommends PAR for clients requiring highest security |
| **Works with DPoP** | PAR request can include DPoP proof for additional sender-constraining |
| **Keycloak support** | Keycloak 20+ supports PAR natively (enabled per client) |

---

## Risk Assessment

| Scenario | PAR Needed? | Rationale |
|----------|------------|-----------|
| Demo / portfolio deployment | No | Standard PKCE + state is sufficient |
| Production SaaS with user data | Recommended | Defense in depth against parameter injection |
| Financial / healthcare data | Yes | Regulatory compliance requires PAR or JAR |
| Enterprise SSO with custom IdP | Yes | Parameter integrity critical in federated setups |

---

## Implementation

### When to Enable PAR

PAR is most valuable when:
1. The authorization URL parameters could be observed (e.g., via proxy logs)
2. The client operates in a high-security environment
3. Regulatory requirements mandate it
4. The Authorization Server requires it (e.g., Keycloak configured with `require.pushed.authorization.requests`)

### Module: `@anvil/auth/par`

```typescript
import {PARConfig, pushAuthorizationRequest} from '@anvil/auth/par';

// Enable PAR in the authorization flow
const result = await pushAuthorizationRequest({
  keycloakUrl: process.env.KEYCLOAK_URL,
  realm: process.env.KEYCLOAK_REALM,
  clientId: process.env.KEYCLOAK_CLIENT_ID,
  clientSecret: process.env.KEYCLOAK_CLIENT_SECRET,
  params: {
    redirect_uri: 'https://anvil.example.com/api/auth/callback',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    nonce,
    scope: 'openid profile email',
  },
});

// result.request_uri → use in authorization redirect
// GET /auth?client_id=X&request_uri=result.request_uri
```

### Keycloak Configuration

```bash
# Enable PAR for the anvil-app client
KEYCLOAK_URL=http://localhost:8080
REALM=anvil

# Via Admin REST API:
curl -X PUT "$KEYCLOAK_URL/admin/realms/$REALM/clients/$CLIENT_UUID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "attributes": {
      "oauth2.pushed.authorization.request.enabled": "true",
      "oauth2.pushed.authorization.request.require": "false"
    }
  }'
```

Set `require` to `"true"` to reject all non-PAR authorization requests.

---

## Compatibility

| Component | PAR Support | Notes |
|-----------|------------|-------|
| Keycloak 20+ | ✅ Native | Per-client configuration |
| Authentik 2024+ | ✅ Native | Enabled in provider settings |
| Zitadel | ✅ Native | Default for new projects |
| Google OAuth 2.0 | ❌ | Not supported |
| Azure AD / Entra | ❌ | Uses `request` parameter (JAR) instead |
| Okta | ⚠️ Partial | Via `request` parameter (JAR) |

---

## Recommendation for Project Anvil

**Implement PAR as an opt-in module.** The existing PKCE + state + DPoP + exact redirect URI matching provides strong security for demo and standard deployments. PAR adds defense-in-depth for:

1. **Enterprise deployments** — where proxy logs may capture authorization URLs
2. **Regulatory environments** — where parameter integrity must be guaranteed
3. **Custom IdP configurations** — where Keycloak is configured to require PAR

The implementation is non-breaking: the existing `getAuthorizationUrl` function continues to work as-is. PAR is used only when explicitly configured via the `AUTH_USE_PAR=true` environment variable.

---

## References

- **RFC 9126** — OAuth 2.0 Pushed Authorization Requests (September 2022)
- **RFC 9700 §2.1.1** — Recommendation to use PAR for high-security clients
- **Keycloak PAR docs** — https://www.keycloak.org/securing-apps/oidc-layers
- **RFC 9449** — DPoP (complementary sender-constraining)

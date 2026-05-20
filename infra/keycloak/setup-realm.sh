#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────
# Project Anvil — Keycloak Realm Setup
# Creates the 'anvil' realm, 6 OIDC clients, a test user,
# and configures PKCE for all public clients.
# ──────────────────────────────────────────────────────────
set -euo pipefail

KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8080}"
ADMIN_USER="${KEYCLOAK_ADMIN:-admin}"
ADMIN_PASS="${KEYCLOAK_ADMIN_PASSWORD:-admin}"
REALM="anvil"

echo "🔑 Logging in to Keycloak admin..."
# Obtain admin access token
TOKEN=$(curl -sfS \
  -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=${ADMIN_USER}" \
  -d "password=${ADMIN_PASS}" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" | jq -r '.access_token')

if [ -z "${TOKEN}" ] || [ "${TOKEN}" = "null" ]; then
  echo "❌ Failed to obtain admin token. Is Keycloak running?"
  exit 1
fi

AUTH="Authorization: Bearer ${TOKEN}"

# ── Create Realm ──────────────────────────────────────────
echo "📍 Creating realm '${REALM}'..."
curl -sfS -o /dev/null -w "%{http_code}" \
  -X POST "${KEYCLOAK_URL}/admin/realms" \
  -H "${AUTH}" \
  -H "Content-Type: application/json" \
  -d '{
    "realm": "'"${REALM}"'",
    "enabled": true,
    "sslRequired": "none",
    "registrationAllowed": false,
    "loginWithEmailAllowed": true,
    "duplicateEmailsAllowed": false,
    "resetPasswordAllowed": true,
    "editUsernameAllowed": false,
    "bruteForceProtected": true,
    "permanentLockout": false,
    "maxFailureWaitSeconds": 900,
    "minimumQuickLoginWaitSeconds": 60,
    "waitIncrementSeconds": 60,
    "quickLoginCheckMilliSeconds": 1000,
    "maxDeltaTimeSeconds": 43200,
    "failureFactor": 30
  }' && echo " ✓" || echo " (may already exist)"

# ── Helper: Create or update OIDC client ──────────────────
create_client() {
  local CLIENT_ID="$1"
  local REDIRECT_URIS="$2"
  local WEB_ORIGINS="$3"
  local PUBLIC="${4:-true}"

  echo "  📦 Creating client '${CLIENT_ID}' (public=${PUBLIC})..."

  local CLIENT_PAYLOAD
  CLIENT_PAYLOAD=$(cat <<EOF
{
  "clientId": "${CLIENT_ID}",
  "enabled": true,
  "protocol": "openid-connect",
  "publicClient": ${PUBLIC},
  "standardFlowEnabled": true,
  "implicitFlowEnabled": false,
  "directAccessGrantsEnabled": false,
  "serviceAccountsEnabled": false,
  "authorizationServicesEnabled": false,
  "redirectUris": ${REDIRECT_URIS},
  "webOrigins": ${WEB_ORIGINS},
  "attributes": {
    "pkce.code.challenge.method": "S256",
    "oauth2.device.authorization.grant.enabled": "false",
    "oidc.ciba.grant.enabled": "false",
    "backchannel.logout.session.required": "true",
    "backchannel.logout.revoke.offline.tokens": "false",
    "post.logout.redirect.uris": "+"
  },
  "defaultClientScopes": [
    "web-origins",
    "profile",
    "roles",
    "email"
  ],
  "optionalClientScopes": [
    "address",
    "phone",
    "offline_access",
    "microprofile-jwt"
  ]
}
EOF
)

  HTTP_CODE=$(curl -sfS -o /dev/null -w "%{http_code}" \
    -X POST "${KEYCLOAK_URL}/admin/realms/${REALM}/clients" \
    -H "${AUTH}" \
    -H "Content-Type: application/json" \
    -d "${CLIENT_PAYLOAD}" 2>/dev/null || true)

  if [ "${HTTP_CODE}" = "409" ]; then
    echo "    (already exists, updating...)"
    CLIENT_UUID=$(curl -sfS \
      "${KEYCLOAK_URL}/admin/realms/${REALM}/clients?clientId=${CLIENT_ID}" \
      -H "${AUTH}" | jq -r '.[0].id')
    curl -sfS -o /dev/null \
      -X PUT "${KEYCLOAK_URL}/admin/realms/${REALM}/clients/${CLIENT_UUID}" \
      -H "${AUTH}" \
      -H "Content-Type: application/json" \
      -d "${CLIENT_PAYLOAD}"
  fi
  echo "    ✓ ${CLIENT_ID}"
}

# ── App base URLs ─────────────────────────────────────────
# Each app runs on a separate port in development
DRIVE_URL="http://localhost:3001"
DOCS_URL="http://localhost:3002"
YOUTUBE_URL="http://localhost:3003"
MAPS_URL="http://localhost:3004"
SEARCH_URL="http://localhost:3005"
GMAIL_URL="http://localhost:3006"

# ── Create 6 OIDC Clients ────────────────────────────────
echo "📦 Setting up OIDC clients..."

create_client "drive" \
  "[\"${DRIVE_URL}/*\", \"${DRIVE_URL}/api/auth/callback\"]" \
  "[\"${DRIVE_URL}\"]" \
  "true"

create_client "docs" \
  "[\"${DOCS_URL}/*\", \"${DOCS_URL}/api/auth/callback\"]" \
  "[\"${DOCS_URL}\"]" \
  "true"

create_client "youtube" \
  "[\"${YOUTUBE_URL}/*\", \"${YOUTUBE_URL}/api/auth/callback\"]" \
  "[\"${YOUTUBE_URL}\"]" \
  "true"

create_client "maps" \
  "[\"${MAPS_URL}/*\", \"${MAPS_URL}/api/auth/callback\"]" \
  "[\"${MAPS_URL}\"]" \
  "true"

create_client "search" \
  "[\"${SEARCH_URL}/*\", \"${SEARCH_URL}/api/auth/callback\"]" \
  "[\"${SEARCH_URL}\"]" \
  "true"

create_client "gmail" \
  "[\"${GMAIL_URL}/*\", \"${GMAIL_URL}/api/auth/callback\"]" \
  "[\"${GMAIL_URL}\"]" \
  "true"

# ── Create test user ──────────────────────────────────────
echo "👤 Creating test user..."
USER_PAYLOAD='{
  "username": "testuser",
  "email": "testuser@anvil.local",
  "firstName": "Test",
  "lastName": "User",
  "enabled": true,
  "emailVerified": true,
  "credentials": [{
    "type": "password",
    "value": "testpassword",
    "temporary": false
  }],
  "requiredActions": []
}'

HTTP_CODE=$(curl -sfS -o /dev/null -w "%{http_code}" \
  -X POST "${KEYCLOAK_URL}/admin/realms/${REALM}/users" \
  -H "${AUTH}" \
  -H "Content-Type: application/json" \
  -d "${USER_PAYLOAD}" 2>/dev/null || true)

if [ "${HTTP_CODE}" = "409" ]; then
  echo "  (test user already exists)"
else
  echo "  ✓ testuser created"
fi

# ── Verify setup ──────────────────────────────────────────
echo ""
echo "🔍 Verifying setup..."
CLIENT_COUNT=$(curl -sfS \
  "${KEYCLOAK_URL}/admin/realms/${REALM}/clients" \
  -H "${AUTH}" | jq length)
USER_COUNT=$(curl -sfS \
  "${KEYCLOAK_URL}/admin/realms/${REALM}/users" \
  -H "${AUTH}" | jq length)

echo "  Realm:     ${REALM}"
echo "  Clients:   ${CLIENT_COUNT} (includes built-in)"
echo "  Users:     ${USER_COUNT}"
echo ""
echo "✅ Keycloak realm setup complete!"
echo ""
echo "Test user credentials:"
echo "  Username: testuser"
echo "  Password: testpassword"
echo ""
echo "OIDC Discovery URL:"
echo "  ${KEYCLOAK_URL}/realms/${REALM}/.well-known/openid-configuration"

/**
 * SCIM 2.0 Users endpoint — /api/scim/v2/Users
 *
 * Implements RFC 7644 SCIM protocol for enterprise user provisioning.
 * IdPs (Okta, Azure AD, OneLogin) use this to create/update/deactivate users.
 *
 * Security:
 * - Bearer token authentication (per-tenant, hashed in DB)
 * - Tenant isolation via token → tenantId lookup
 * - Rate limited (built into Traefik in production)
 * - Audit log entry for every mutation
 */

import {NextRequest, NextResponse} from 'next/server';
import {getAdminDB} from '../../../../lib/db';
import {
  type SCIMUser,
  type PatchOp,
  parseFilter,
  matchesFilter,
  scimUserToAnvil,
  anvilUserToSCIM,
  scimListResponse,
  scimError,
  verifySCIMToken,
} from '@anvil/auth/scim';

const SCIM_CONTENT_TYPE = 'application/scim+json';

function scimResponse(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {'Content-Type': SCIM_CONTENT_TYPE},
  });
}

// ── Auth middleware ──

async function getSCIMTenant(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  const db = getAdminDB();

  // Look up tenant by token hash
  // In production: SELECT tenant_id FROM scim_tokens WHERE token_hash = sha256($1) AND active = true
  const tenantId = await db.lookupSCIMToken(token).catch(() => null);
  return tenantId ?? null;
}

// ── GET /api/scim/v2/Users — List or search users ──

export async function GET(request: NextRequest): Promise<NextResponse> {
  const tenantId = await getSCIMTenant(request);
  if (!tenantId) {
    return scimResponse(scimError(401, 'Authentication required.'), 401);
  }

  const {searchParams} = new URL(request.url);
  const filterStr = searchParams.get('filter') ?? '';
  const startIndex = Math.max(1, parseInt(searchParams.get('startIndex') ?? '1', 10));
  const count = Math.min(200, parseInt(searchParams.get('count') ?? '100', 10));

  const db = getAdminDB();

  try {
    const {users, total} = await db.listUsersForSCIM(tenantId, {
      startIndex,
      count,
      filter: filterStr,
    });

    const filter = parseFilter(filterStr);
    const scimUsers = users
      .map(u => anvilUserToSCIM(u, getBaseUrl(request)))
      .filter(u => matchesFilter(u, filter));

    return scimResponse(scimListResponse(scimUsers, total, startIndex, count));
  } catch (err) {
    console.error('[SCIM] GET /Users error:', err);
    return scimResponse(scimError(500, 'Internal server error.'), 500);
  }
}

// ── POST /api/scim/v2/Users — Create user ──

export async function POST(request: NextRequest): Promise<NextResponse> {
  const tenantId = await getSCIMTenant(request);
  if (!tenantId) {
    return scimResponse(scimError(401, 'Authentication required.'), 401);
  }

  let scimUser: SCIMUser;
  try {
    scimUser = await request.json();
  } catch {
    return scimResponse(scimError(400, 'Invalid JSON.', 'invalidSyntax'), 400);
  }

  if (!scimUser.userName) {
    return scimResponse(scimError(400, 'userName is required.', 'invalidValue'), 400);
  }

  const db = getAdminDB();

  try {
    // Check for duplicate
    const existing = await db.findUserByEmail(tenantId, scimUser.userName);
    if (existing) {
      return scimResponse(
        scimError(409, `User with userName '${scimUser.userName}' already exists.`, 'uniqueness'),
        409,
      );
    }

    // Get SCIM config for this tenant
    const scimConfig = await db.getSCIMConfig(tenantId);
    const anvilData = scimUserToAnvil(scimUser, scimConfig ?? {defaultRole: 'member'}, scimConfig?.groupRoleMap ?? {});

    // Create user
    const created = await db.createUserFromSCIM(tenantId, anvilData, scimUser.externalId);

    // Audit log
    await db.writeAuditLog(tenantId, null, 'scim.user.created', 'user', created.id, {
      scimUserName: scimUser.userName,
      externalId: scimUser.externalId,
    });

    const responseUser = anvilUserToSCIM(
      {...anvilData, id: created.id, createdAt: created.created_at, updatedAt: created.updated_at},
      getBaseUrl(request),
    );

    return scimResponse(responseUser, 201);
  } catch (err) {
    console.error('[SCIM] POST /Users error:', err);
    return scimResponse(scimError(500, 'Internal server error.'), 500);
  }
}

// ── Helpers ──

function getBaseUrl(request: NextRequest): string {
  const host = request.headers.get('host') ?? 'localhost';
  const proto = request.headers.get('x-forwarded-proto') ?? 'https';
  return `${proto}://${host}`;
}

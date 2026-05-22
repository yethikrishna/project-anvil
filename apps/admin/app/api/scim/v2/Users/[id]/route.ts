/**
 * SCIM 2.0 User by ID — /api/scim/v2/Users/[id]
 *
 * GET    — Retrieve a specific user
 * PUT    — Full replace (IdP-driven)
 * PATCH  — Partial update (activate/deactivate, attribute updates)
 * DELETE — Deprovision (soft-delete / deactivate)
 */

import {NextRequest, NextResponse} from 'next/server';
import {getAdminDB} from '../../../../../lib/db';
import {
  type SCIMUser,
  type PatchOp,
  applyPatch,
  scimUserToAnvil,
  anvilUserToSCIM,
  scimError,
  verifySCIMToken,
} from '@anvil/auth/scim';

const SCIM_CT = 'application/scim+json';
const sr = (body: unknown, status = 200) =>
  NextResponse.json(body, {status, headers: {'Content-Type': SCIM_CT}});

async function getSCIMTenant(request: NextRequest): Promise<string | null> {
  const auth = request.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const db = getAdminDB();
  return db.lookupSCIMToken(auth.slice(7)).catch(() => null);
}

function baseUrl(req: NextRequest): string {
  const host = req.headers.get('host') ?? 'localhost';
  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  return `${proto}://${host}`;
}

// ── GET /api/scim/v2/Users/[id] ──

export async function GET(
  request: NextRequest,
  {params}: {params: {id: string}},
): Promise<NextResponse> {
  const tenantId = await getSCIMTenant(request);
  if (!tenantId) return sr(scimError(401, 'Authentication required.'), 401);

  const db = getAdminDB();
  const user = await db.getUserForSCIM(tenantId, params.id);
  if (!user) return sr(scimError(404, 'User not found.'), 404);

  return sr(anvilUserToSCIM(user, baseUrl(request)));
}

// ── PUT /api/scim/v2/Users/[id] — Full replace ──

export async function PUT(
  request: NextRequest,
  {params}: {params: {id: string}},
): Promise<NextResponse> {
  const tenantId = await getSCIMTenant(request);
  if (!tenantId) return sr(scimError(401, 'Authentication required.'), 401);

  let body: SCIMUser;
  try {
    body = await request.json();
  } catch {
    return sr(scimError(400, 'Invalid JSON.', 'invalidSyntax'), 400);
  }

  const db = getAdminDB();
  const existing = await db.getUserForSCIM(tenantId, params.id);
  if (!existing) return sr(scimError(404, 'User not found.'), 404);

  const scimConfig = await db.getSCIMConfig(tenantId);
  const anvilData = scimUserToAnvil(body, scimConfig ?? {defaultRole: 'member'}, scimConfig?.groupRoleMap ?? {});

  const updated = await db.updateUserFromSCIM(tenantId, params.id, anvilData);
  if (!updated) return sr(scimError(404, 'User not found.'), 404);

  await db.writeAuditLog(tenantId, null, 'scim.user.updated', 'user', params.id, {
    scimUserName: body.userName,
  });

  return sr(anvilUserToSCIM(updated, baseUrl(request)));
}

// ── PATCH /api/scim/v2/Users/[id] — Partial update ──

export async function PATCH(
  request: NextRequest,
  {params}: {params: {id: string}},
): Promise<NextResponse> {
  const tenantId = await getSCIMTenant(request);
  if (!tenantId) return sr(scimError(401, 'Authentication required.'), 401);

  let patch: PatchOp;
  try {
    patch = await request.json();
  } catch {
    return sr(scimError(400, 'Invalid JSON.', 'invalidSyntax'), 400);
  }

  if (!patch.Operations?.length) {
    return sr(scimError(400, 'Operations array is required.', 'invalidValue'), 400);
  }

  const db = getAdminDB();
  const existing = await db.getUserForSCIM(tenantId, params.id);
  if (!existing) return sr(scimError(404, 'User not found.'), 404);

  // Convert existing user back to SCIM, apply patch, convert back to Anvil
  const scimExisting = anvilUserToSCIM(existing, baseUrl(request));
  const patched = applyPatch(scimExisting, patch);

  const scimConfig = await db.getSCIMConfig(tenantId);
  const anvilData = scimUserToAnvil(patched, scimConfig ?? {defaultRole: 'member'}, scimConfig?.groupRoleMap ?? {});

  const updated = await db.updateUserFromSCIM(tenantId, params.id, anvilData);
  if (!updated) return sr(scimError(404, 'User not found.'), 404);

  // Special handling: deactivation removes sessions
  const wasDeactivated = existing.active && !anvilData.active;
  if (wasDeactivated) {
    await db.revokeUserSessions(tenantId, params.id).catch(() => {});
  }

  await db.writeAuditLog(tenantId, null, 'scim.user.patched', 'user', params.id, {
    operations: patch.Operations.map(o => o.op),
    deactivated: wasDeactivated,
  });

  return sr(anvilUserToSCIM(updated, baseUrl(request)));
}

// ── DELETE /api/scim/v2/Users/[id] — Deprovision ──

export async function DELETE(
  request: NextRequest,
  {params}: {params: {id: string}},
): Promise<NextResponse> {
  const tenantId = await getSCIMTenant(request);
  if (!tenantId) return sr(scimError(401, 'Authentication required.'), 401);

  const db = getAdminDB();
  const existing = await db.getUserForSCIM(tenantId, params.id);
  if (!existing) return sr(scimError(404, 'User not found.'), 404);

  // Soft-delete: deactivate + revoke sessions, preserve data for audit
  await db.deactivateUserFromSCIM(tenantId, params.id);
  await db.revokeUserSessions(tenantId, params.id).catch(() => {});

  await db.writeAuditLog(tenantId, null, 'scim.user.deprovisioned', 'user', params.id, {
    email: existing.email,
  });

  return new NextResponse(null, {status: 204});
}

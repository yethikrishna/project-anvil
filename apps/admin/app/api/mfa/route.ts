import {NextRequest} from 'next/server';
import {getAdminDB} from '../../../lib/db';
import {success, error} from '../../../lib/admin-api';

// ── GET /api/admin/mfa — Get MFA policy ──

export async function GET(request: NextRequest) {
  const session = getAdminSession(request);
  if (!session) return error('Unauthorized', 401);
  if (!isAdmin(session)) return error('Forbidden', 403);

  const db = getAdminDB();
  const policy = await db.getMfaPolicy(session.tenantId);

  return success({policy: policy ?? {policy: 'disabled', allowedMethods: ['totp', 'webauthn']}});
}

// ── PUT /api/admin/mfa — Update MFA policy ──

export async function PUT(request: NextRequest) {
  const session = getAdminSession(request);
  if (!session) return error('Unauthorized', 401);
  if (session.role !== 'owner') return error('Only owners can change MFA policy', 403);

  const body = await request.json();
  const {policy, allowedMethods, gracePeriodDays, excludedRoles} = body;

  const validPolicies = ['disabled', 'optional', 'required', 'required_with_grace'];
  if (!validPolicies.includes(policy)) {
    return error(`Invalid policy. Must be one of: ${validPolicies.join(', ')}`);
  }

  const validMethods = ['totp', 'webauthn'];
  if (allowedMethods) {
    for (const m of allowedMethods) {
      if (!validMethods.includes(m)) return error(`Invalid MFA method: ${m}`);
    }
  }

  const db = getAdminDB();
  const updated = await db.updateMfaPolicy(session.tenantId, policy, {
    allowedMethods: allowedMethods ?? ['totp', 'webauthn'],
    gracePeriodDays: gracePeriodDays ?? 14,
    excludedRoles: excludedRoles ?? [],
  });

  return success({policy: updated});
}

function getAdminSession(request: NextRequest) {
  const header = request.headers.get('x-admin-session');
  if (!header) return null;
  try { return JSON.parse(atob(header)); } catch { return null; }
}

function isAdmin(session: any): boolean {
  return session?.role === 'owner' || session?.role === 'admin';
}

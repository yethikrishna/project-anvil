import {NextRequest} from 'next/server';
import {getAdminDB} from '../../../lib/db';
import {success, error} from '../../../lib/admin-api';

// ── GET /api/admin/org — Get organization settings ──

export async function GET(request: NextRequest) {
  const session = getAdminSession(request);
  if (!session) return error('Unauthorized', 401);
  if (!isAdmin(session)) return error('Forbidden', 403);

  const db = getAdminDB();
  const settings = await db.getOrgSettings(session.tenantId);

  if (!settings) return error('Organization not found', 404);
  return success({settings});
}

// ── PATCH /api/admin/org — Update organization settings ──

export async function PATCH(request: NextRequest) {
  const session = getAdminSession(request);
  if (!session) return error('Unauthorized', 401);
  if (session.role !== 'owner') return error('Only owners can update organization settings', 403);

  const body = await request.json();
  const {name, branding, features, limits} = body;

  // Validate
  if (name !== undefined && (typeof name !== 'string' || name.trim().length < 2)) {
    return error('Organization name must be at least 2 characters');
  }

  if (branding && typeof branding !== 'object') {
    return error('branding must be an object');
  }

  if (features) {
    const validFeatures = ['sso', 'mfa', 'auditLog', 'e2ee', 'customDomain', 'api', 'ai', 'marketplace'];
    for (const key of Object.keys(features)) {
      if (!validFeatures.includes(key)) {
        return error(`Unknown feature: ${key}`);
      }
    }
  }

  const db = getAdminDB();
  await db.updateOrgSettings(session.tenantId, {name, branding, features, limits});

  const updated = await db.getOrgSettings(session.tenantId);
  return success({settings: updated});
}

function getAdminSession(request: NextRequest) {
  const header = request.headers.get('x-admin-session');
  if (!header) return null;
  try { return JSON.parse(atob(header)); } catch { return null; }
}

function isAdmin(session: any): boolean {
  return session?.role === 'owner' || session?.role === 'admin';
}

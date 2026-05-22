import {NextRequest} from 'next/server';
import {getAdminDB} from '../../../lib/db';
import {success, error} from '../../../lib/admin-api';

// ── GET /api/admin/ldap — List LDAP connections ──

export async function GET(request: NextRequest) {
  const session = getAdminSession(request);
  if (!session) return error('Unauthorized', 401);
  if (!isAdmin(session)) return error('Forbidden', 403);

  const db = getAdminDB();
  const connections = await db.listLdapConnections(session.tenantId);
  return success({connections});
}

// ── POST /api/admin/ldap — Add LDAP connection ──

export async function POST(request: NextRequest) {
  const session = getAdminSession(request);
  if (!session) return error('Unauthorized', 401);
  if (session.role !== 'owner') return error('Only owners can configure LDAP', 403);

  const body = await request.json();
  const {name, url, bindDn, bindPassword, searchBase, searchFilter, groupBase, useTls, activeDirectory, roleMappings, syncInterval} = body;

  if (!name || !url || !bindDn || !bindPassword || !searchBase) {
    return error('name, url, bindDn, bindPassword, and searchBase are required');
  }

  // Validate URL
  try {
    const parsed = new URL(url);
    if (!['ldap:', 'ldaps:'].includes(parsed.protocol)) {
      return error('URL must use ldap:// or ldaps:// protocol');
    }
  } catch {
    return error('Invalid LDAP URL');
  }

  const db = getAdminDB();
  const connection = await db.createLdapConnection(session.tenantId, {
    name,
    url,
    bindDn,
    bindPassword, // In production: encrypt before storage
    searchBase,
    searchFilter,
    groupBase,
    useTls: useTls ?? true,
    activeDirectory: activeDirectory ?? false,
    roleMappings,
    syncInterval,
  });

  return success({connection}, 201);
}

// ── DELETE /api/admin/ldap?connId=... — Remove LDAP connection ──

export async function DELETE(request: NextRequest) {
  const session = getAdminSession(request);
  if (!session) return error('Unauthorized', 401);
  if (session.role !== 'owner') return error('Only owners can remove LDAP', 403);

  const connId = new URL(request.url).searchParams.get('connId');
  if (!connId) return error('connId is required');

  const db = getAdminDB();
  await db.deleteLdapConnection(session.tenantId, connId);

  return success({deleted: true});
}

function getAdminSession(request: NextRequest) {
  const header = request.headers.get('x-admin-session');
  if (!header) return null;
  try { return JSON.parse(atob(header)); } catch { return null; }
}

function isAdmin(session: any): boolean {
  return session?.role === 'owner' || session?.role === 'admin';
}

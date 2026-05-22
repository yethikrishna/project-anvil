import {NextRequest} from 'next/server';
import {getAdminDB} from '../../../lib/db';
import {success, error} from '../../../lib/admin-api';

// ── GET /api/admin/sso — List SAML IdPs ──

export async function GET(request: NextRequest) {
  const session = getAdminSession(request);
  if (!session) return error('Unauthorized', 401);
  if (!isAdmin(session)) return error('Forbidden', 403);

  const db = getAdminDB();
  const idps = await db.listSamlIdps(session.tenantId);
  return success({idps});
}

// ── POST /api/admin/sso — Add SAML IdP ──

export async function POST(request: NextRequest) {
  const session = getAdminSession(request);
  if (!session) return error('Unauthorized', 401);
  if (session.role !== 'owner') return error('Only owners can configure SSO', 403);

  const body = await request.json();
  const {name, entityId, ssoUrl, sloUrl, certificate, attributeMap} = body;

  if (!name || !entityId || !ssoUrl || !certificate) {
    return error('name, entityId, ssoUrl, and certificate are required');
  }

  // Validate URL format
  try { new URL(ssoUrl); } catch { return error('Invalid ssoUrl'); }
  if (sloUrl) {
    try { new URL(sloUrl); } catch { return error('Invalid sloUrl'); }
  }

  // Validate certificate (basic PEM check)
  if (!certificate.includes('-----BEGIN CERTIFICATE-----')) {
    return error('Certificate must be in PEM format');
  }

  const db = getAdminDB();
  const idp = await db.createSamlIdp(session.tenantId, {
    name,
    entityId,
    ssoUrl,
    sloUrl,
    certificate,
    attributeMap,
  });

  return success({idp}, 201);
}

// ── DELETE /api/admin/sso?idpId=... — Remove SAML IdP ──

export async function DELETE(request: NextRequest) {
  const session = getAdminSession(request);
  if (!session) return error('Unauthorized', 401);
  if (session.role !== 'owner') return error('Only owners can remove SSO', 403);

  const idpId = new URL(request.url).searchParams.get('idpId');
  if (!idpId) return error('idpId is required');

  const db = getAdminDB();
  await db.deleteSamlIdp(session.tenantId, idpId);

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

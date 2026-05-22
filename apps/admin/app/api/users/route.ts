import {NextRequest} from 'next/server';
import {getAdminDB} from '../../../lib/db';
import {success, error, notFound, parsePagination, createAuditEvent, type AdminSession} from '../../../lib/admin-api';

// ── GET /api/admin/users — List users ──

export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session) return error('Unauthorized', 401);

  const forbidden = requireAdminRole(session);
  if (forbidden) return forbidden;

  const url = new URL(request.url);
  const {page, limit} = parsePagination(url.searchParams);
  const search = url.searchParams.get('search') ?? undefined;
  const role = url.searchParams.get('role') ?? undefined;
  const status = url.searchParams.get('status') ?? undefined;

  const db = getAdminDB();
  const result = await db.listUsers(session.tenantId, {page, limit, search, role, status});

  return success({
    users: result.users,
    pagination: {page, limit, total: result.total, hasMore: page * limit < result.total},
  });
}

// ── POST /api/admin/users — Create/invite user ──

export async function POST(request: NextRequest) {
  const session = getSession(request);
  if (!session) return error('Unauthorized', 401);

  const forbidden = requireAdminRole(session);
  if (forbidden) return forbidden;

  const body = await request.json();
  const {email, name, role = 'member', action = 'invite'} = body;

  if (!email || !name) {
    return error('email and name are required');
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return error('Invalid email format');
  }

  const validRoles = ['admin', 'member', 'viewer', 'guest'];
  if (!validRoles.includes(role)) {
    return error(`Invalid role. Must be one of: ${validRoles.join(', ')}`);
  }

  const db = getAdminDB();

  if (action === 'invite') {
    const invitation = await db.inviteUser(session.tenantId, email, role, session.userId);

    await createAuditEvent({
      tenantId: session.tenantId,
      userId: session.userId,
      action: 'user.invite',
      resourceType: 'user',
      resourceId: email,
      details: {email, role, invitationToken: invitation.token},
      ipAddress: request.headers.get('x-forwarded-for') ?? undefined,
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    return success({invitation: {email, role, expiresAt: invitation.expires}}, 201);
  }

  // Direct create
  const user = await db.createUser(session.tenantId, {email, name, role});

  await createAuditEvent({
    tenantId: session.tenantId,
    userId: session.userId,
    action: 'user.create',
    resourceType: 'user',
    resourceId: user.id,
    details: {email, name, role},
    ipAddress: request.headers.get('x-forwarded-for') ?? undefined,
    userAgent: request.headers.get('user-agent') ?? undefined,
  });

  return success({user}, 201);
}

// ── Helpers ──

function getSession(request: NextRequest): AdminSession | null {
  // In production: validate JWT/session cookie via @anvil/auth
  // This is a placeholder that reads from authorization header
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return null;

  // Decode and validate JWT
  // const session = await validateToken(authHeader.replace('Bearer ', ''));
  // return session;

  // Demo: parse from header (X-Admin-Session for dev)
  const sessionHeader = request.headers.get('x-admin-session');
  if (sessionHeader) {
    try {
      return JSON.parse(atob(sessionHeader));
    } catch {
      return null;
    }
  }

  return null;
}

function requireAdminRole(session: AdminSession): Response | null {
  if (session.role !== 'owner' && session.role !== 'admin') {
    return error('Forbidden: admin access required', 403);
  }
  return null;
}

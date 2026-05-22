import {NextRequest} from 'next/server';
import {getAdminDB} from '../../../../lib/db';
import {success, error, notFound} from '../../../../lib/admin-api';

// ── GET /api/admin/users/[id] — Get user details ──

export async function GET(
  request: NextRequest,
  {params}: {params: Promise<{id: string}>},
) {
  const session = getAdminSession(request);
  if (!session) return error('Unauthorized', 401);
  if (!isAdmin(session)) return error('Forbidden', 403);

  const {id} = await params;
  const db = getAdminDB();
  const user = await db.getUser(session.tenantId, id);

  if (!user) return notFound('User');
  return success({user});
}

// ── PATCH /api/admin/users/[id] — Update user ──

export async function PATCH(
  request: NextRequest,
  {params}: {params: Promise<{id: string}>},
) {
  const session = getAdminSession(request);
  if (!session) return error('Unauthorized', 401);
  if (!isAdmin(session)) return error('Forbidden', 403);

  const {id} = await params;
  const body = await request.json();

  // Only allow certain fields to be updated
  const allowedUpdates: Record<string, unknown> = {};
  const allowedFields = ['name', 'display_name', 'role', 'status', 'timezone', 'locale'];

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      allowedUpdates[field] = body[field];
    }
  }

  // Validate role
  if (body.role && !['admin', 'member', 'viewer', 'guest'].includes(body.role)) {
    return error('Invalid role');
  }

  // Validate status
  if (body.status && !['active', 'suspended', 'deactivated'].includes(body.status)) {
    return error('Invalid status');
  }

  // Prevent self-demotion for owners
  if (id === session.userId && session.role === 'owner' && body.role && body.role !== 'owner') {
    return error('Owners cannot demote themselves');
  }

  const db = getAdminDB();
  const user = await db.updateUser(session.tenantId, id, allowedUpdates as any);

  if (!user) return notFound('User');

  await createAuditEvent({
    tenantId: session.tenantId,
    userId: session.userId,
    action: 'user.update',
    resourceType: 'user',
    resourceId: id,
    details: allowedUpdates,
  });

  return success({user});
}

// ── DELETE /api/admin/users/[id] — Delete user ──

export async function DELETE(
  request: NextRequest,
  {params}: {params: Promise<{id: string}>},
) {
  const session = getAdminSession(request);
  if (!session) return error('Unauthorized', 401);
  if (session.role !== 'owner') return error('Only owners can delete users', 403);

  const {id} = await params;

  // Prevent self-deletion
  if (id === session.userId) {
    return error('Cannot delete your own account');
  }

  const db = getAdminDB();
  await db.deleteUser(session.tenantId, id);

  await createAuditEvent({
    tenantId: session.tenantId,
    userId: session.userId,
    action: 'user.delete',
    resourceType: 'user',
    resourceId: id,
  });

  return success({deleted: true});
}

// ── Helpers ──

function getAdminSession(request: NextRequest) {
  const header = request.headers.get('x-admin-session');
  if (!header) return null;
  try { return JSON.parse(atob(header)); } catch { return null; }
}

function isAdmin(session: any): boolean {
  return session?.role === 'owner' || session?.role === 'admin';
}

async function createAuditEvent(event: any) {
  // Delegate to lib/admin-api createAuditEvent
  // In production: calls the shared function
}

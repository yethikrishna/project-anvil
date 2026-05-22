import {NextRequest} from 'next/server';
import {getAdminDB} from '../../../lib/db';
import {success, error, parsePagination} from '../../../lib/admin-api';

// ── GET /api/admin/audit — List audit log entries ──

export async function GET(request: NextRequest) {
  const session = getAdminSession(request);
  if (!session) return error('Unauthorized', 401);
  if (!isAdmin(session)) return error('Forbidden', 403);

  const url = new URL(request.url);
  const {page, limit} = parsePagination(url.searchParams);

  const db = getAdminDB();
  const result = await db.listAuditLog(session.tenantId, {
    page,
    limit,
    userId: url.searchParams.get('userId') ?? undefined,
    action: url.searchParams.get('action') ?? undefined,
    startDate: url.searchParams.get('startDate') ?? undefined,
    endDate: url.searchParams.get('endDate') ?? undefined,
  });

  return success({
    entries: result.entries,
    pagination: {page, limit, total: result.total, hasMore: page * limit < result.total},
  });
}

// ── POST /api/admin/audit — Export audit log ──

export async function POST(request: NextRequest) {
  const session = getAdminSession(request);
  if (!session) return error('Unauthorized', 401);
  if (session.role !== 'owner') return error('Only owners can export audit logs', 403);

  const body = await request.json();
  const {format = 'json', startDate, endDate} = body;

  const db = getAdminDB();
  const result = await db.listAuditLog(session.tenantId, {
    page: 1,
    limit: 10000,
    startDate,
    endDate,
  });

  if (format === 'csv') {
    const csvHeader = 'ID,Timestamp,User,Email,Action,Resource Type,Resource ID,IP Address,Details\n';
    const csvRows = result.entries.map((e: any) =>
      `${e.id},"${e.created_at}","${e.user_name ?? 'system'}","${e.user_email ?? ''}","${e.action}","${e.resource_type}","${e.resource_id ?? ''}","${e.ip_address ?? ''}","${JSON.stringify(e.details).replace(/"/g, '""')}"`
    ).join('\n');

    return new Response(csvHeader + csvRows, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  return success({
    entries: result.entries,
    exportedAt: new Date().toISOString(),
    count: result.entries.length,
  });
}

function getAdminSession(request: NextRequest) {
  const header = request.headers.get('x-admin-session');
  if (!header) return null;
  try { return JSON.parse(atob(header)); } catch { return null; }
}

function isAdmin(session: any): boolean {
  return session?.role === 'owner' || session?.role === 'admin';
}

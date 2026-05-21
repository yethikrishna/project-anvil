/**
 * Admin API — Audit log endpoint.
 */

import {NextRequest, NextResponse} from 'next/server';

interface AuditEntry {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  action: string;
  resource: string;
  details: string;
  ip: string;
  userAgent: string;
  severity: 'info' | 'warn' | 'error';
}

// In production: SELECT * FROM ${schema}.audit_log ORDER BY created_at DESC
const auditLog: AuditEntry[] = [];

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const action = url.searchParams.get('action') ?? '';
  const userId = url.searchParams.get('userId') ?? '';
  const from = url.searchParams.get('from') ?? '';
  const to = url.searchParams.get('to') ?? '';
  const page = parseInt(url.searchParams.get('page') ?? '1');
  const limit = parseInt(url.searchParams.get('limit') ?? '100');

  let result = [...auditLog];

  if (action) result = result.filter(e => e.action.startsWith(action));
  if (userId) result = result.filter(e => e.userId === userId);
  if (from) result = result.filter(e => e.timestamp >= from);
  if (to) result = result.filter(e => e.timestamp <= to);

  // Sort newest first
  result.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  const total = result.length;
  const offset = (page - 1) * limit;

  return NextResponse.json({
    entries: result.slice(offset, offset + limit),
    total,
    page,
    limit,
    actions: [...new Set(auditLog.map(e => e.action))],
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {userId, userName, action, resource, details, ip, userAgent, severity} = body;

  if (!action || !resource) {
    return NextResponse.json({error: 'Missing required fields'}, {status: 400});
  }

  const entry: AuditEntry = {
    id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    userId: userId ?? 'system',
    userName: userName ?? 'System',
    action,
    resource,
    details: details ?? '',
    ip: ip ?? '127.0.0.1',
    userAgent: userAgent ?? '',
    severity: severity ?? 'info',
  };

  auditLog.push(entry);

  // Keep last 10,000 entries in memory
  if (auditLog.length > 10000) {
    auditLog.splice(0, auditLog.length - 10000);
  }

  return NextResponse.json({entry}, {status: 201});
}

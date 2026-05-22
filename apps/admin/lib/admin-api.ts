/**
 * Admin API — Shared types and utilities for admin console backend.
 */

import {createHmac, randomBytes, timingSafeEqual} from 'crypto';

// ── Auth Middleware Helpers ──

export interface AdminSession {
  userId: string;
  tenantId: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  email: string;
}

export function requireAdmin(session: AdminSession): Response | null {
  if (session.role !== 'owner' && session.role !== 'admin') {
    return Response.json({error: 'Forbidden', message: 'Admin access required'}, {status: 403});
  }
  return null;
}

export function requireOwner(session: AdminSession): Response | null {
  if (session.role !== 'owner') {
    return Response.json({error: 'Forbidden', message: 'Owner access required'}, {status: 403});
  }
  return null;
}

// ── Pagination ──

export interface PaginationParams {
  page?: number;
  limit?: number;
  cursor?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export function parsePagination(params: URLSearchParams): Required<PaginationParams> {
  return {
    page: Math.max(1, parseInt(params.get('page') ?? '1', 10)),
    limit: Math.min(100, Math.max(1, parseInt(params.get('limit') ?? '25', 10))),
    cursor: params.get('cursor') ?? '',
  };
}

// ── Audit Event Creation ──

export interface AuditEventInput {
  tenantId: string;
  userId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export async function createAuditEvent(event: AuditEventInput): Promise<void> {
  // In production: INSERT INTO audit_log via DB client
  // This is the server-side function that records to the partitioned audit_log table
  const sql = `
    SELECT record_audit($1, $2, $3, $4, $5, $6, $7::inet, $8)
  `;
  // await db.query(sql, [
  //   event.tenantId,
  //   event.userId,
  //   event.action,
  //   event.resourceType,
  //   event.resourceId ?? null,
  //   JSON.stringify(event.details ?? {}),
  //   event.ipAddress ?? null,
  //   event.userAgent ?? null,
  // ]);
}

// ── API Response Helpers ──

export function success<T>(data: T, status = 200): Response {
  return Response.json({ok: true, data}, {status});
}

export function error(message: string, status = 400, code?: string): Response {
  return Response.json({ok: false, error: {message, code}}, {status});
}

export function notFound(resource: string): Response {
  return Response.json({ok: false, error: {message: `${resource} not found`, code: 'NOT_FOUND'}}, {status: 404});
}

// ── Input Validation ──

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validateSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(slug);
}

export function sanitizeString(input: string, maxLength = 255): string {
  return input.trim().slice(0, maxLength).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
}

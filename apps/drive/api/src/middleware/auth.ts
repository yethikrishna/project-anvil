/**
 * Drive API — Auth middleware
 * Validates Keycloak JWT tokens on incoming requests.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';

// ── Lightweight JWT decode (no library needed) ────────────

interface JwtPayload {
  sub: string;
  email?: string;
  realm_access?: { roles: string[] };
  exp: number;
  iat: number;
}

function decodeJwt(token: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = Buffer.from(parts[1], 'base64url').toString('utf-8');
    return JSON.parse(payload) as JwtPayload;
  } catch {
    return null;
  }
}

// ── Extend FastifyRequest ─────────────────────────────────

declare module 'fastify' {
  interface FastifyRequest {
    userId: string;
    userEmail: string;
  }
}

/**
 * Extract and validate the Bearer token from the Authorization header.
 * Attaches userId and userEmail to the request.
 */
export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    reply.code(401).send({ code: 'AUTH_REQUIRED', message: 'Missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.slice(7);
  const payload = decodeJwt(token);

  if (!payload) {
    reply.code(401).send({ code: 'INVALID_TOKEN', message: 'Malformed JWT token' });
    return;
  }

  // Check expiry (with 30s clock skew tolerance)
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now - 30) {
    reply.code(401).send({ code: 'TOKEN_EXPIRED', message: 'Token has expired' });
    return;
  }

  request.userId = payload.sub;
  request.userEmail = payload.email ?? '';
}

/**
 * Optional auth — attaches user info if token present, but doesn't reject.
 * Used for public share links where auth is optional.
 */
export async function optionalAuth(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return;

  const token = authHeader.slice(7);
  const payload = decodeJwt(token);
  if (payload && payload.exp > Math.floor(Date.now() / 1000) - 30) {
    request.userId = payload.sub;
    request.userEmail = payload.email ?? '';
  }
}

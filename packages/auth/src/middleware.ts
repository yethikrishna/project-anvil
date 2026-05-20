/**
 * @anvil/auth — Next.js Edge-compatible middleware for OIDC session checks
 *
 * Runs on every request to protected routes. Verifies the session cookie
 * and redirects unauthenticated users to the Keycloak login flow.
 */

import {jwtVerify, importSPKI} from 'jose';

// ── Configuration ──

export interface AuthMiddlewareConfig {
  keycloakUrl: string;
  realm: string;
  clientId: string;
  /** Routes that skip auth (exact match or prefix with *) */
  publicRoutes: string[];
  /** Cookie name holding the encrypted session */
  sessionCookie: string;
  /** Where to redirect after login */
  loginRedirect: string;
}

const DEFAULT_PUBLIC_ROUTES = [
  '/api/auth/login',
  '/api/auth/callback',
  '/api/auth/logout',
  '/api/health',
  '/_next',
  '/favicon.ico',
];

// ── JWT Verification (Edge-compatible) ──

let cachedKey: CryptoKey | null = null;

async function getSigningKey(keycloakUrl: string, realm: string): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;

  // Fetch JWKS from Keycloak
  const jwksUrl = `${keycloakUrl}/realms/${realm}/protocol/openid-connect/certs`;
  const resp = await fetch(jwksUrl);
  const jwks = await resp.json();
  const key = jwks.keys?.[0];

  if (!key) throw new Error('No signing keys found in JWKS');

  // Import the RSA public key
  cachedKey = await importSPKI(
    `-----BEGIN PUBLIC KEY-----\n${key.x5c?.[0] ?? key.n}\n-----END PUBLIC KEY-----`,
    'RS256'
  );

  return cachedKey;
}

async function verifySessionToken(
  token: string,
  config: AuthMiddlewareConfig
): Promise<{sub: string; email: string; name: string} | null> {
  try {
    const key = await getSigningKey(config.keycloakUrl, config.realm);
    const {payload} = await jwtVerify(token, key, {
      issuer: `${config.keycloakUrl}/realms/${config.realm}`,
      audience: config.clientId,
    });

    return {
      sub: payload.sub ?? '',
      email: (payload.email as string) ?? '',
      name: (payload.name as string) ?? '',
    };
  } catch {
    return null;
  }
}

// ── Route matching ──

function isPublicRoute(pathname: string, publicRoutes: string[]): boolean {
  return publicRoutes.some(route => {
    if (route.endsWith('*')) {
      return pathname.startsWith(route.slice(0, -1));
    }
    return pathname === route;
  });
}

// ── Middleware ──

export function createAuthMiddleware(config: Partial<AuthMiddlewareConfig> = {}) {
  const fullConfig: AuthMiddlewareConfig = {
    keycloakUrl: process.env.KEYCLOAK_URL ?? 'http://localhost:8080',
    realm: process.env.KEYCLOAK_REALM ?? 'anvil',
    clientId: process.env.KEYCLOAK_CLIENT_ID ?? 'anvil-app',
    publicRoutes: [...DEFAULT_PUBLIC_ROUTES, ...(config.publicRoutes ?? [])],
    sessionCookie: config.sessionCookie ?? 'anvil-session',
    loginRedirect: config.loginRedirect ?? '/api/auth/login',
  };

  return async function authMiddleware(request: Request): Promise<Response | null> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Skip public routes
    if (isPublicRoute(pathname, fullConfig.publicRoutes)) {
      return null; // Continue
    }

    // Check for session cookie
    const cookieHeader = request.headers.get('cookie') ?? '';
    const sessionMatch = cookieHeader.match(
      new RegExp(`${fullConfig.sessionCookie}=([^;]+)`)
    );

    if (!sessionMatch) {
      // No session cookie — redirect to login
      const loginUrl = new URL(fullConfig.loginRedirect, url.origin);
      loginUrl.searchParams.set('callbackUrl', pathname);
      return Response.redirect(loginUrl.toString());
    }

    // Verify the JWT
    const token = decodeURIComponent(sessionMatch[1]);
    const user = await verifySessionToken(token, fullConfig);

    if (!user) {
      // Invalid/expired token — redirect to login
      const loginUrl = new URL(fullConfig.loginRedirect, url.origin);
      loginUrl.searchParams.set('callbackUrl', pathname);
      return Response.redirect(loginUrl.toString());
    }

    // Valid session — inject user info into headers for downstream
    const headers = new Headers(request.headers);
    headers.set('x-anvil-user-id', user.sub);
    headers.set('x-anvil-user-email', user.email);
    headers.set('x-anvil-user-name', user.name);

    return null; // Continue with modified request
  };
}

// ── Default export for Next.js middleware.ts ──

export const defaultAuthMiddleware = createAuthMiddleware();

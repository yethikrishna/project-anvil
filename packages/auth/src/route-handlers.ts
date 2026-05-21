/**
 * @anvil/auth — Next.js Route Handlers for OIDC auth flow
 *
 * Drop these into app/api/auth/ in any Anvil app.
 * Handles login (PKCE init), callback (code exchange), session,
 * refresh, logout, and silent-callback for iframe SSO.
 *
 * RFC 9700 hardening:
 * - HMAC-SHA256 authenticated session cookies (tamper-proof)
 * - Nonce validation on ID tokens (replay protection)
 * - Cryptographically bound state + PKCE (mix-up prevention)
 * - Single auth cookie (state + verifier + nonce bundled)
 * - Origin-restricted postMessage for silent auth
 */

import {
  getAuthorizationUrl,
  exchangeCode,
  refreshTokens,
  getLogoutUrl,
  getUserInfo,
} from './index';
import {createHmac} from 'crypto';

// ── Session Cookie Auth (RFC 9700 §2.6: tamper-proof storage) ──

const SESSION_SECRET = process.env.AUTH_SESSION_SECRET ?? process.env.KEYCLOAK_CLIENT_SECRET ?? '';

function signSessionData(data: string): string {
  const hmac = createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
  return `${hmac}.${data}`;
}

function verifyAndDecodeSession(signed: string): string | null {
  const dotIndex = signed.indexOf('.');
  if (dotIndex === -1) return null;
  const signature = signed.slice(0, dotIndex);
  const data = signed.slice(dotIndex + 1);
  const expected = createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
  // Constant-time comparison
  if (signature.length !== expected.length) return null;
  let result = 0;
  for (let i = 0; i < signature.length; i++) {
    result |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return result === 0 ? data : null;
}

// ── Cookie helpers ──

const SESSION_COOKIE = 'anvil-session';
const AUTH_STATE_COOKIE = 'anvil-auth-state';

const SESSION_COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 7, // 7 days
};

function setCookie(headers: Headers, name: string, value: string, opts: Record<string, unknown> = {}) {
  const parts = [`${name}=${value}`];
  if (opts.httpOnly) parts.push('HttpOnly');
  if (opts.secure) parts.push('Secure');
  if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`);
  if (opts.path) parts.push(`Path=${opts.path}`);
  if (opts.maxAge) parts.push(`Max-Age=${opts.maxAge}`);
  headers.append('Set-Cookie', parts.join('; '));
}

function clearCookie(headers: Headers, name: string) {
  headers.append('Set-Cookie', `${name}=; Path=/; Max-Age=0`);
}

// ── Session storage (HMAC-authenticated cookie) ──

interface SessionData {
  user: {sub: string; email: string; name: string; picture?: string};
  accessToken: string;
  refreshToken: string;
  idToken: string;
}

function encodeSession(data: SessionData): string {
  const json = JSON.stringify(data);
  const encoded = btoa(json);
  return signSessionData(encoded);
}

function decodeSession(cookieValue: string): SessionData | null {
  try {
    const data = verifyAndDecodeSession(cookieValue);
    if (!data) return null;
    return JSON.parse(atob(data));
  } catch {
    return null;
  }
}

// ── Auth State (PKCE + state + nonce in single cookie) ──

interface AuthState {
  codeVerifier: string;
  state: string;
  nonce: string;
  callbackUrl: string;
}

function encodeAuthState(authState: AuthState): string {
  const json = JSON.stringify(authState);
  const encoded = encodeURIComponent(btoa(json));
  return signSessionData(encoded);
}

function decodeAuthState(cookieValue: string): AuthState | null {
  try {
    const data = verifyAndDecodeSession(cookieValue);
    if (!data) return null;
    return JSON.parse(atob(decodeURIComponent(data)));
  } catch {
    return null;
  }
}

// ── Login Route Handler ──

export async function loginHandler(request: Request): Promise<Response> {
  const {searchParams} = new URL(request.url);
  const callbackUrl = searchParams.get('callbackUrl') ?? '/';

  const baseUrl = new URL(request.url).origin;
  const redirectUri = `${baseUrl}/api/auth/callback`;

  const {url, state, codeVerifier, nonce} = await getAuthorizationUrl(redirectUri);

  // Store all auth state in a single HMAC-signed cookie
  const authState: AuthState = {codeVerifier, state, nonce, callbackUrl};
  const headers = new Headers();
  setCookie(headers, AUTH_STATE_COOKIE, encodeAuthState(authState), {
    ...SESSION_COOKIE_OPTS,
    maxAge: 600, // 10 minutes
  });

  headers.set('Location', url);
  return new Response(null, {status: 302, headers});
}

// ── Callback Route Handler ──

export async function callbackHandler(request: Request): Promise<Response> {
  const {searchParams} = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  if (error) {
    return new Response(`Auth error: ${searchParams.get('error_description') ?? error}`, {status: 400});
  }

  if (!code || !state) {
    return new Response('Missing code or state', {status: 400});
  }

  // Get stored auth state from signed cookie
  const cookies = request.headers.get('cookie') ?? '';
  const getCookie = (name: string) => {
    const match = cookies.match(new RegExp(`${name}=([^;]+)`));
    return match ? decodeURIComponent(match[1]) : null;
  };

  const authStateCookie = getCookie(AUTH_STATE_COOKIE);
  if (!authStateCookie) {
    return new Response('Missing auth state cookie', {status: 400});
  }

  const authState = decodeAuthState(authStateCookie);
  if (!authState) {
    return new Response('Invalid or tampered auth state', {status: 400});
  }

  // RFC 9700: Verify state matches (cryptographically bound to PKCE)
  if (authState.state !== state) {
    return new Response('State mismatch — possible CSRF attack', {status: 400});
  }

  const baseUrl = new URL(request.url).origin;
  const redirectUri = `${baseUrl}/api/auth/callback`;

  // Exchange code for tokens, passing nonce for ID token validation
  const tokens = await exchangeCode(code, authState.codeVerifier, redirectUri, authState.nonce);
  const userInfo = await getUserInfo(tokens.accessToken);

  const sessionData: SessionData = {
    user: {
      sub: tokens.claims.sub as string ?? '',
      email: tokens.claims.email as string ?? '',
      name: tokens.claims.name as string ?? (userInfo as Record<string, unknown>).name as string ?? '',
      picture: (userInfo as Record<string, unknown>).picture as string | undefined,
    },
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    idToken: tokens.idToken,
  };

  // Set HMAC-authenticated session cookie
  const headers = new Headers();
  setCookie(headers, SESSION_COOKIE, encodeSession(sessionData), SESSION_COOKIE_OPTS);
  // Clear auth state cookie
  clearCookie(headers, AUTH_STATE_COOKIE);

  headers.set('Location', authState.callbackUrl);
  return new Response(null, {status: 302, headers});
}

// ── Session Route Handler ──

export async function sessionHandler(request: Request): Promise<Response> {
  const cookies = request.headers.get('cookie') ?? '';
  const match = cookies.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));

  if (!match) {
    return Response.json({user: null, accessToken: null});
  }

  const session = decodeSession(match[1]);
  if (!session) {
    return Response.json({user: null, accessToken: null});
  }

  return Response.json({
    user: session.user,
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    idToken: session.idToken,
  });
}

// ── Refresh Route Handler ──

export async function refreshHandler(request: Request): Promise<Response> {
  const cookies = request.headers.get('cookie') ?? '';
  const match = cookies.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));

  if (!match) {
    return Response.json({error: 'No session'}, {status: 401});
  }

  const session = decodeSession(match[1]);
  if (!session?.refreshToken) {
    return Response.json({error: 'No refresh token'}, {status: 401});
  }

  try {
    const newTokens = await refreshTokens(session.refreshToken);

    const updatedSession: SessionData = {
      ...session,
      accessToken: newTokens.accessToken,
      refreshToken: newTokens.refreshToken,
      idToken: newTokens.idToken,
    };

    const headers = new Headers();
    setCookie(headers, SESSION_COOKIE, encodeSession(updatedSession), SESSION_COOKIE_OPTS);

    return Response.json({success: true}, {headers});
  } catch {
    // Refresh failed — clear session
    const headers = new Headers();
    clearCookie(headers, SESSION_COOKIE);
    return Response.json({error: 'Refresh failed'}, {status: 401, headers});
  }
}

// ── Logout Route Handler ──

export async function logoutHandler(request: Request): Promise<Response> {
  const cookies = request.headers.get('cookie') ?? '';
  const match = cookies.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));

  const headers = new Headers();
  clearCookie(headers, SESSION_COOKIE);

  let logoutUrl = '/';

  if (match) {
    const session = decodeSession(match[1]);
    if (session?.idToken) {
      const baseUrl = new URL(request.url).origin;
      logoutUrl = await getLogoutUrl(session.idToken, baseUrl);
    }
  }

  headers.set('Location', logoutUrl);
  return new Response(null, {status: 302, headers});
}

// ── Silent Callback (iframe) — RFC 9700: origin-restricted postMessage ──

export async function silentCallbackHandler(request: Request): Promise<Response> {
  // This endpoint is loaded in an iframe during silent auth check.
  // If we got here, the user has an active SSO session.
  const origin = new URL(request.url).origin;
  const html = `<!DOCTYPE html>
<html>
<head><title>Silent Auth</title></head>
<body>
<script>
  // RFC 9700: Restrict postMessage to same origin only
  window.parent.postMessage({type: 'anvil-silent-auth', authenticated: true}, '${origin}');
</script>
</body>
</html>`;

  return new Response(html, {
    headers: {'Content-Type': 'text/html'},
  });
}

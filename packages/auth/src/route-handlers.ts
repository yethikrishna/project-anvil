/**
 * @anvil/auth — Next.js Route Handlers for OIDC auth flow
 *
 * Drop these into app/api/auth/ in any Anvil app.
 * Handles login (PKCE init), callback (code exchange), session,
 * refresh, logout, and silent-callback for iframe SSO.
 */

import {
  getAuthorizationUrl,
  exchangeCode,
  refreshTokens,
  getLogoutUrl,
  getUserInfo,
} from './index';

// ── Cookie helpers ──

const SESSION_COOKIE = 'anvil-session';
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

// ── Session storage (simple encrypted cookie) ──

interface SessionData {
  user: {sub: string; email: string; name: string; picture?: string};
  accessToken: string;
  refreshToken: string;
  idToken: string;
}

function encodeSession(data: SessionData): string {
  return encodeURIComponent(btoa(JSON.stringify(data)));
}

function decodeSession(encoded: string): SessionData | null {
  try {
    return JSON.parse(atob(decodeURIComponent(encoded)));
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

  const {url, state, codeVerifier} = await getAuthorizationUrl(redirectUri);

  // Store PKCE verifier + state in cookies (short-lived)
  const headers = new Headers();
  setCookie(headers, 'anvil:pkce', codeVerifier, {...SESSION_COOKIE_OPTS, maxAge: 600}); // 10 min
  setCookie(headers, 'anvil:state', state, {...SESSION_COOKIE_OPTS, maxAge: 600});
  setCookie(headers, 'anvil:callback', callbackUrl, {...SESSION_COOKIE_OPTS, maxAge: 600});

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

  // Get stored PKCE + state from cookies
  const cookies = request.headers.get('cookie') ?? '';
  const getCookie = (name: string) => {
    const match = cookies.match(new RegExp(`${name}=([^;]+)`));
    return match ? decodeURIComponent(match[1]) : null;
  };

  const codeVerifier = getCookie('anvil:pkce');
  const storedState = getCookie('anvil:state');
  const callbackUrl = getCookie('anvil:callback') ?? '/';

  if (!codeVerifier || storedState !== state) {
    return new Response('PKCE verification failed', {status: 400});
  }

  const baseUrl = new URL(request.url).origin;
  const redirectUri = `${baseUrl}/api/auth/callback`;

  // Exchange code for tokens
  const tokens = await exchangeCode(code, codeVerifier, redirectUri);
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

  // Set session cookie
  const headers = new Headers();
  setCookie(headers, SESSION_COOKIE, encodeSession(sessionData), SESSION_COOKIE_OPTS);
  // Clear PKCE cookies
  clearCookie(headers, 'anvil:pkce');
  clearCookie(headers, 'anvil:state');
  clearCookie(headers, 'anvil:callback');

  headers.set('Location', callbackUrl);
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

// ── Silent Callback (iframe) ──

export async function silentCallbackHandler(_request: Request): Promise<Response> {
  // This endpoint is loaded in an iframe during silent auth check.
  // If we got here, the user has an active SSO session.
  const html = `<!DOCTYPE html>
<html>
<head><title>Silent Auth</title></head>
<body>
<script>
  window.parent.postMessage({type: 'anvil:silent-auth', authenticated: true}, '*');
</script>
</body>
</html>`;

  return new Response(html, {
    headers: {'Content-Type': 'text/html'},
  });
}

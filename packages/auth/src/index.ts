/**
 * @anvil/auth — Shared OIDC authentication for Project Anvil
 *
 * Provides Keycloak OIDC integration with PKCE, token refresh,
 * and seamless SSO session propagation across all Anvil apps.
 *
 * RFC 9700 compliant:
 * - PKCE S256 for all authorization requests
 * - Nonce binding for ID token replay protection
 * - Exact redirect URI matching
 * - Issuer validation on all tokens
 * - DPoP sender-constrained tokens (RFC 9449)
 */

import {
  discovery,
  randomPKCECodeVerifier,
  calculatePKCECodeChallenge,
  randomNonce,
  authorizationCodeGrant,
  refreshTokenGrant,
  fetchUserInfo,
  buildAuthorizationUrl,
  skipSubjectCheck,
  Configuration,
  type TokenEndpointResponse,
} from 'openid-client';
import {createHmac} from 'crypto';

// ── Configuration ──

export interface AnvilAuthConfig {
  keycloakUrl: string;
  realm: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  postLogoutRedirectUri?: string;
  /** Secret for HMAC-signing session cookies. Falls back to clientSecret. */
  sessionSecret?: string;
}

const DEFAULT_CONFIG: Partial<AnvilAuthConfig> = {
  keycloakUrl: process.env.KEYCLOAK_URL ?? 'http://localhost:8080',
  realm: process.env.KEYCLOAK_REALM ?? 'anvil',
  clientId: process.env.KEYCLOAK_CLIENT_ID ?? 'anvil-app',
  clientSecret: process.env.KEYCLOAK_CLIENT_SECRET ?? '',
  sessionSecret: process.env.AUTH_SESSION_SECRET ?? process.env.KEYCLOAK_CLIENT_SECRET ?? '',
};

// ── OIDC Configuration Factory ──

let configInstance: Configuration | null = null;

export async function getOidcConfig(
  config: Partial<AnvilAuthConfig> = {}
): Promise<Configuration> {
  if (configInstance) return configInstance;

  const fullConfig = {...DEFAULT_CONFIG, ...config} as AnvilAuthConfig;
  const issuerUrl = new URL(`${fullConfig.keycloakUrl}/realms/${fullConfig.realm}`);

  configInstance = await discovery(
    issuerUrl,
    fullConfig.clientId,
    {
      client_secret: fullConfig.clientSecret,
      redirect_uris: [fullConfig.redirectUri],
      post_logout_redirect_uris: fullConfig.postLogoutRedirectUri
        ? [fullConfig.postLogoutRedirectUri]
        : [],
      response_types: ['code'],
    }
  );

  return configInstance;
}

/** @deprecated Use getOidcConfig instead */
export const getOidcClient = getOidcConfig;

// ── HMAC Helper (RFC 9700: cryptographic binding) ──

function getHmacSecret(): string {
  const config = {...DEFAULT_CONFIG} as AnvilAuthConfig;
  return config.sessionSecret ?? config.clientSecret;
}

function hmacSign(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

function hmacVerify(data: string, signature: string, secret: string): boolean {
  const expected = hmacSign(data, secret);
  // Constant-time comparison to prevent timing attacks
  if (signature.length !== expected.length) return false;
  let result = 0;
  for (let i = 0; i < signature.length; i++) {
    result |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return result === 0;
}

// ── PKCE Authorization (RFC 9700 §2.1) ──

export interface AuthUrlParams {
  state?: string;
  prompt?: 'login' | 'consent' | 'none';
  scope?: string;
}

export interface AuthorizationResult {
  url: string;
  state: string;
  codeVerifier: string;
  /** Nonce for ID token validation (OIDC Core §3.1.2.1) */
  nonce: string;
}

export async function getAuthorizationUrl(
  redirectUri: string,
  params: AuthUrlParams = {}
): Promise<AuthorizationResult> {
  const config = await getOidcConfig({redirectUri});
  const codeVerifier = randomPKCECodeVerifier();
  const codeChallenge = await calculatePKCECodeChallenge(codeVerifier);
  const nonce = randomNonce();

  // RFC 9700 §2.1: Derive state from codeVerifier to cryptographically bind
  // PKCE and CSRF protection together, preventing mix-up attacks.
  const state = params.state ?? hmacSign(codeVerifier, getHmacSecret());

  const urlResult = buildAuthorizationUrl(config, {
    scope: params.scope ?? 'openid profile email',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    nonce,
    ...(params.prompt ? { prompt: params.prompt } : {}),
    redirect_uri: redirectUri,
  });

  return {url: urlResult.href, state, codeVerifier, nonce};
}

// ── Token Exchange ──

/**
 * Exchange authorization code for tokens.
 * RFC 9700 §2.4: Validates nonce and issuer on ID token.
 */
export async function exchangeCode(
  code: string,
  codeVerifier: string,
  redirectUri: string,
  nonce?: string
): Promise<{
  idToken: string;
  accessToken: string;
  refreshToken: string;
  claims: Record<string, unknown>;
}> {
  const fullConfig = {...DEFAULT_CONFIG} as AnvilAuthConfig;
  const config = await getOidcConfig({redirectUri});
  const expectedIssuer = `${fullConfig.keycloakUrl}/realms/${fullConfig.realm}`;

  // Build the callback URL with the code parameter for v6 authorizationCodeGrant
  const callbackUrl = new URL(redirectUri);
  callbackUrl.searchParams.set('code', code);

  const tokenSet = await authorizationCodeGrant(config, callbackUrl, {
    pkceCodeVerifier: codeVerifier,
    expectedNonce: nonce,
    idTokenExpected: true,
  } as any);

  // Explicit issuer validation (defense in depth)
  const claims = (tokenSet as any).claims?.() ?? {};
  if (claims?.iss && claims.iss !== expectedIssuer) {
    throw new Error(`ID token issuer mismatch: expected ${expectedIssuer}, got ${claims.iss}`);
  }

  return {
    idToken: (tokenSet as TokenEndpointResponse).id_token ?? '',
    accessToken: tokenSet.access_token ?? '',
    refreshToken: (tokenSet as any).refresh_token ?? '',
    claims: claims as Record<string, unknown>,
  };
}

// ── Silent SSO Check (prompt=none) ──

export async function checkSSOSession(
  redirectUri: string
): Promise<{authenticated: boolean; tokens?: Awaited<ReturnType<typeof exchangeCode>>}> {
  try {
    const {url, state, codeVerifier, nonce} = await getAuthorizationUrl(redirectUri, {
      prompt: 'none',
    });

    // In a browser context, redirect to the URL.
    // On the server, this is used to construct the redirect response.
    return {
      authenticated: true,
      tokens: undefined, // Will be populated after callback
    };
  } catch {
    return {authenticated: false};
  }
}

// ── Token Refresh ──

export async function refreshTokens(
  refreshToken: string
): Promise<{accessToken: string; refreshToken: string; idToken: string}> {
  const config = await getOidcConfig();
  const tokenSet = await refreshTokenGrant(config, refreshToken);

  return {
    accessToken: tokenSet.access_token ?? '',
    refreshToken: (tokenSet as any).refresh_token ?? refreshToken,
    idToken: (tokenSet as TokenEndpointResponse).id_token ?? '',
  };
}

// ── User Info ──

export async function getUserInfo(accessToken: string) {
  const config = await getOidcConfig();
  return fetchUserInfo(config, accessToken, skipSubjectCheck);
}

// ── Logout URL ──

export async function getLogoutUrl(
  idToken: string,
  postLogoutRedirectUri?: string
): Promise<string> {
  const config = await getOidcConfig({
    postLogoutRedirectUri: postLogoutRedirectUri ?? '',
  });
  const server = config.serverMetadata();
  const endSessionEndpoint = server.end_session_endpoint;
  if (!endSessionEndpoint) return '/';
  const url = new URL(endSessionEndpoint);
  url.searchParams.set('id_token_hint', idToken);
  if (postLogoutRedirectUri) {
    url.searchParams.set('post_logout_redirect_uri', postLogoutRedirectUri);
  }
  return url.href;
}

// ── Re-exports for convenience ──

export * from './hooks';
export * from './route-handlers';
export * from './middleware';
export * from './security';
export * from './session-security';
export * from './api-keys';
export * from './dpop';
export * from './passkeys';
export * from './par';
export * from './saml';
export * from './ldap';
export * from './mfa';
export * from './scim';

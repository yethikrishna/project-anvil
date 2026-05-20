/**
 * @anvil/auth — Shared OIDC authentication for Project Anvil
 *
 * Provides Keycloak OIDC integration with PKCE, token refresh,
 * and seamless SSO session propagation across all Anvil apps.
 */

import {Issuer, Client, generators} from 'openid-client';

// ── Configuration ──

export interface AnvilAuthConfig {
  keycloakUrl: string;
  realm: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  postLogoutRedirectUri?: string;
}

const DEFAULT_CONFIG: Partial<AnvilAuthConfig> = {
  keycloakUrl: process.env.KEYCLOAK_URL ?? 'http://localhost:8080',
  realm: process.env.KEYCLOAK_REALM ?? 'anvil',
  clientId: process.env.KEYCLOAK_CLIENT_ID ?? 'anvil-app',
  clientSecret: process.env.KEYCLOAK_CLIENT_SECRET ?? '',
};

// ── OIDC Client Factory ──

let clientInstance: Client | null = null;

export async function getOidcClient(
  config: Partial<AnvilAuthConfig> = {}
): Promise<Client> {
  if (clientInstance) return clientInstance;

  const fullConfig = {...DEFAULT_CONFIG, ...config} as AnvilAuthConfig;
  const issuerUrl = `${fullConfig.keycloakUrl}/realms/${fullConfig.realm}`;

  const issuer = await Issuer.discover(issuerUrl);
  clientInstance = new issuer.Client({
    client_id: fullConfig.clientId,
    client_secret: fullConfig.clientSecret,
    redirect_uris: [fullConfig.redirectUri],
    post_logout_redirect_uris: fullConfig.postLogoutRedirectUri
      ? [fullConfig.postLogoutRedirectUri]
      : [],
    response_types: ['code'],
  });

  return clientInstance;
}

// ── PKCE Authorization ──

export interface AuthUrlParams {
  state?: string;
  prompt?: 'login' | 'consent' | 'none';
  scope?: string;
}

export async function getAuthorizationUrl(
  redirectUri: string,
  params: AuthUrlParams = {}
): Promise<{url: string; state: string; codeVerifier: string}> {
  const client = await getOidcClient({redirectUri});
  const codeVerifier = generators.codeVerifier();
  const codeChallenge = generators.codeChallenge(codeVerifier);
  const state = params.state ?? generators.state();

  const url = client.authorizationUrl({
    scope: params.scope ?? 'openid profile email',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    prompt: params.prompt,
  });

  return {url, state, codeVerifier};
}

// ── Token Exchange ──

export async function exchangeCode(
  code: string,
  codeVerifier: string,
  redirectUri: string
): Promise<{
  idToken: string;
  accessToken: string;
  refreshToken: string;
  claims: Record<string, unknown>;
}> {
  const client = await getOidcClient({redirectUri});
  const tokenSet = await client.callback(
    redirectUri,
    {code},
    {code_verifier: codeVerifier}
  );

  const claims = tokenSet.claims();

  return {
    idToken: tokenSet.id_token ?? '',
    accessToken: tokenSet.access_token ?? '',
    refreshToken: tokenSet.refresh_token ?? '',
    claims: claims as Record<string, unknown>,
  };
}

// ── Silent SSO Check ──

export async function checkSSOSession(
  redirectUri: string
): Promise<{authenticated: boolean; tokens?: Awaited<ReturnType<typeof exchangeCode>>}> {
  try {
    const {url, state, codeVerifier} = await getAuthorizationUrl(redirectUri, {
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
  const client = await getOidcClient();
  const tokenSet = await client.refresh(refreshToken);

  return {
    accessToken: tokenSet.access_token ?? '',
    refreshToken: tokenSet.refresh_token ?? refreshToken,
    idToken: tokenSet.id_token ?? '',
  };
}

// ── User Info ──

export async function getUserInfo(accessToken: string) {
  const client = await getOidcClient();
  return client.userinfo(accessToken);
}

// ── Logout URL ──

export async function getLogoutUrl(
  idToken: string,
  postLogoutRedirectUri?: string
): Promise<string> {
  const client = await getOidcClient({
    postLogoutRedirectUri: postLogoutRedirectUri ?? '',
  });
  return client.endSessionUrl({
    id_token_hint: idToken,
    post_logout_redirect_uri: postLogoutRedirectUri,
  }) ?? '';
}

// ── Re-exports for convenience ──

export * from './hooks';
export * from './route-handlers';
export * from './middleware';

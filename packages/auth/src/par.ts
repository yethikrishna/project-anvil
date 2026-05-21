/**
 * PAR (Pushed Authorization Requests) — RFC 9126
 *
 * Sends authorization parameters to the AS via POST instead of URL query params.
 * Prevents parameter leakage and tampering in high-security deployments.
 *
 * Usage:
 *   Set AUTH_USE_PAR=true to enable. The authorization flow will automatically
 *   use PAR when the environment variable is set.
 *
 * Flow:
 *   1. Client POSTs authorization params to /par endpoint
 *   2. AS returns {request_uri, expires_in}
 *   3. Client redirects to /auth?client_id=X&request_uri=Y
 *
 * Requires Keycloak 20+ with PAR enabled per client.
 */

// ── Types ──

export interface PARConfig {
  keycloakUrl: string;
  realm: string;
  clientId: string;
  clientSecret: string;
}

export interface PARParams {
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: 'S256';
  state: string;
  nonce: string;
  scope: string;
  /** Optional: response_type override (default: 'code') */
  response_type?: string;
  /** Optional: prompt parameter */
  prompt?: 'login' | 'consent' | 'none';
}

export interface PARResponse {
  request_uri: string;
  expires_in: number;
}

export interface PARResult {
  success: boolean;
  request_uri?: string;
  expires_in?: number;
  authorizationUrl?: string;
  error?: string;
}

// ── PAR Request ──

/**
 * Push authorization parameters to the AS.
 * RFC 9126 §2: The client makes a POST to the pushed authorization request endpoint.
 */
export async function pushAuthorizationRequest(
  config: PARConfig,
  params: PARParams
): Promise<PARResult> {
  const parEndpoint = `${config.keycloakUrl}/realms/${config.realm}/protocol/openid-connect/par`;

  // Build form-encoded body
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: params.redirect_uri,
    code_challenge: params.code_challenge,
    code_challenge_method: params.code_challenge_method,
    state: params.state,
    nonce: params.nonce,
    scope: params.scope,
    response_type: params.response_type ?? 'code',
  });

  if (params.prompt) {
    body.set('prompt', params.prompt);
  }

  try {
    const response = await fetch(parEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.error_description ?? errorData.error ?? `PAR request failed: ${response.status}`,
      };
    }

    const data: PARResponse = await response.json();

    // Build the authorization URL with request_uri
    const authBaseUrl = `${config.keycloakUrl}/realms/${config.realm}/protocol/openid-connect/auth`;
    const authUrl = `${authBaseUrl}?client_id=${encodeURIComponent(config.clientId)}&request_uri=${encodeURIComponent(data.request_uri)}`;

    return {
      success: true,
      request_uri: data.request_uri,
      expires_in: data.expires_in,
      authorizationUrl: authUrl,
    };
  } catch (err) {
    return {
      success: false,
      error: `PAR request failed: ${(err as Error).message}`,
    };
  }
}

// ── PAR Detection ──

/**
 * Check if PAR is enabled via environment variable.
 */
export function isPAREnabled(): boolean {
  return process.env.AUTH_USE_PAR === 'true';
}

// ── Integration with existing auth flow ──

/**
 * High-level function: use PAR if enabled, otherwise fall back to standard flow.
 * Returns the authorization URL to redirect the user to.
 */
export async function getAuthorizationUrlWithPAR(
  config: PARConfig,
  params: PARParams,
  standardAuthUrl: string
): Promise<string> {
  if (!isPAREnabled()) {
    return standardAuthUrl;
  }

  const result = await pushAuthorizationRequest(config, params);

  if (result.success && result.authorizationUrl) {
    return result.authorizationUrl;
  }

  // PAR failed — fall back to standard flow (with warning)
  console.warn(`PAR request failed, falling back to standard flow: ${result.error}`);
  return standardAuthUrl;
}

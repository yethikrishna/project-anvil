/**
 * DPoP (RFC 9449) — Sender-Constrained Tokens for Project Anvil.
 *
 * DPoP binds access tokens to a key pair held by the client.
 * Even if a token is leaked, it can't be used without the matching private key.
 *
 * Flow:
 * 1. Client generates a key pair on first load
 * 2. Each API request includes a DPoP proof JWT signed with the private key
 * 3. Server verifies the DPoP proof and checks the JKT thumbprint matches the token's cnf claim
 *
 * Requires Web Crypto API (available in all modern browsers).
 */

// ── Types ──

export interface DPoPKeyPair {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
  jwk: JsonWebKey;
  /** JWK Thumbprint (RFC 7638) — SHA-256 hash of the public JWK */
  jkt: string;
}

export interface DPoPProof {
  header: {
    typ: 'dpop+jwt';
    alg: string;
    jwk: JsonWebKey;
  };
  payload: {
    jti: string;
    htm: string;  // HTTP method
    htu: string;  // HTTP URI
    iat: number;  // Issued at
  };
  signature: string;
}

export interface DPoPVerifyResult {
  valid: boolean;
  jkt: string;
  error?: string;
}

// ── Key Pair Management ──

const KEY_STORAGE_KEY = 'anvil-dpop-key';

/**
 * Generate a new ECDSA P-256 key pair for DPoP.
 */
export async function generateDPoPKeyPair(): Promise<DPoPKeyPair> {
  const keyPair = await crypto.subtle.generateKey(
    {name: 'ECDSA', namedCurve: 'P-256'},
    true, // extractable
    ['sign', 'verify']
  );

  const jwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const jkt = await computeJWKThumbprint(jwk);

  return {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
    jwk,
    jkt,
  };
}

/**
 * Compute JWK Thumbprint per RFC 7638.
 */
export async function computeJWKThumbprint(jwk: JsonWebKey): Promise<string> {
  // RFC 7638: Only include required fields in alphabetical order
  const thumbprintInput = JSON.stringify({
    crv: jwk.crv,
    kty: jwk.kty,
    x: jwk.x,
    y: jwk.y,
  });

  const encoded = new TextEncoder().encode(thumbprintInput);
  const hash = await crypto.subtle.digest('SHA-256', encoded);
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Get or create a stored DPoP key pair.
 */
export async function getDPoPKeyPair(): Promise<DPoPKeyPair> {
  if (typeof window === 'undefined') {
    return generateDPoPKeyPair();
  }

  try {
    const stored = sessionStorage.getItem(KEY_STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      const privateKey = await crypto.subtle.importKey(
        'jwk', data.privateKey,
        {name: 'ECDSA', namedCurve: 'P-256'},
        true, ['sign']
      );
      const publicKey = await crypto.subtle.importKey(
        'jwk', data.publicKey,
        {name: 'ECDSA', namedCurve: 'P-256'},
        true, ['verify']
      );
      return {publicKey, privateKey, jwk: data.publicKey, jkt: data.jkt};
    }
  } catch {}

  const keyPair = await generateDPoPKeyPair();
  const privJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
  const pubJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);

  sessionStorage.setItem(KEY_STORAGE_KEY, JSON.stringify({
    privateKey: privJwk,
    publicKey: pubJwk,
    jkt: keyPair.jkt,
  }));

  return keyPair;
}

// ── DPoP Proof Creation ──

/**
 * Create a DPoP proof JWT for an API request.
 */
export async function createDPoPProof(
  method: string,
  url: string,
  keyPair: DPoPKeyPair
): Promise<string> {
  const header = {
    typ: 'dpop+jwt',
    alg: 'ES256',
    jwk: {
      kty: keyPair.jwk.kty,
      crv: keyPair.jwk.crv,
      x: keyPair.jwk.x,
      y: keyPair.jwk.y,
    },
  };

  const payload = {
    jti: crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    htm: method.toUpperCase(),
    htu: url,
    iat: Math.floor(Date.now() / 1000),
  };

  // Encode header and payload
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const signInput = `${encodedHeader}.${encodedPayload}`;

  // Sign with ECDSA P-256
  const signatureBuffer = await crypto.subtle.sign(
    {name: 'ECDSA', hash: 'SHA-256'},
    keyPair.privateKey,
    new TextEncoder().encode(signInput)
  );

  const encodedSignature = arrayBufferToBase64url(signatureBuffer);
  return `${signInput}.${encodedSignature}`;
}

// ── DPoP Proof Verification (server-side) ──

export async function verifyDPoPProof(
  proof: string,
  expectedMethod: string,
  expectedUrl: string
): Promise<DPoPVerifyResult> {
  try {
    const parts = proof.split('.');
    if (parts.length !== 3) {
      return {valid: false, jkt: '', error: 'Invalid JWT format'};
    }

    const [encodedHeader, encodedPayload, encodedSignature] = parts;

    // Decode header
    const header = JSON.parse(base64urlDecode(encodedHeader));
    if (header.typ !== 'dpop+jwt') {
      return {valid: false, jkt: '', error: 'Invalid typ header'};
    }
    if (header.alg !== 'ES256') {
      return {valid: false, jkt: '', error: 'Unsupported algorithm'};
    }

    // Decode payload
    const payload = JSON.parse(base64urlDecode(encodedPayload));
    
    // Verify method
    if (payload.htm !== expectedMethod.toUpperCase()) {
      return {valid: false, jkt: '', error: 'HTTP method mismatch'};
    }

    // Verify URL
    if (payload.htu !== expectedUrl) {
      return {valid: false, jkt: '', error: 'URL mismatch'};
    }

    // Verify freshness (5-minute window)
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - payload.iat) > 300) {
      return {valid: false, jkt: '', error: 'Proof expired'};
    }

    // Import public key from JWK
    const publicKey = await crypto.subtle.importKey(
      'jwk', header.jwk,
      {name: 'ECDSA', namedCurve: 'P-256'},
      true, ['verify']
    );

    // Compute JKT thumbprint
    const jkt = await computeJWKThumbprint(header.jwk);

    // Verify signature
    const signatureBuffer = base64urlToArrayBuffer(encodedSignature);
    const valid = await crypto.subtle.verify(
      {name: 'ECDSA', hash: 'SHA-256'},
      publicKey,
      signatureBuffer,
      new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`)
    );

    if (!valid) {
      return {valid: false, jkt: '', error: 'Invalid signature'};
    }

    return {valid: true, jkt};
  } catch (err) {
    return {valid: false, jkt: '', error: `Verification failed: ${(err as Error).message}`};
  }
}

// ── Redirect URI Matching (exact, no wildcard) ──

const ALLOWED_REDIRECT_URIS = new Set([
  'http://localhost:3000/api/auth/callback',
  'http://localhost:3001/api/auth/callback',
  'http://localhost:3002/api/auth/callback',
  'http://localhost:3003/api/auth/callback',
  'http://localhost:3004/api/auth/callback',
  'http://localhost:3005/api/auth/callback',
  'http://localhost:3010/api/auth/callback',
]);

/**
 * Validate redirect URI with exact matching (no wildcards, no regex).
 * Per OAuth 2.0 Security Best Current Practice (RFC 9700).
 */
export function validateRedirectUri(uri: string): {valid: boolean; error?: string} {
  if (!uri) {
    return {valid: false, error: 'Missing redirect_uri'};
  }

  // Must be HTTPS in production (allow HTTP for localhost)
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return {valid: false, error: 'Invalid redirect_uri format'};
  }

  if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
    return {valid: false, error: 'redirect_uri must use HTTPS'};
  }

  // No query parameters or fragments allowed
  if (parsed.search || parsed.hash) {
    return {valid: false, error: 'redirect_uri must not contain query parameters or fragments'};
  }

  // Exact match only
  if (!ALLOWED_REDIRECT_URIS.has(uri)) {
    return {valid: false, error: 'redirect_uri not in allowlist'};
  }

  return {valid: true};
}

/**
 * Add a redirect URI to the allowlist (for dynamic registration).
 */
export function addRedirectUri(uri: string): void {
  const validation = validateRedirectUri(uri);
  if (validation.valid || validation.error === 'redirect_uri not in allowlist') {
    ALLOWED_REDIRECT_URIS.add(uri);
  }
}

// ── Helpers ──

function base64url(input: string): string {
  return btoa(input).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(input: string): string {
  let str = input.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return atob(str);
}

function arrayBufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlToArrayBuffer(input: string): ArrayBuffer {
  const binary = base64urlDecode(input);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

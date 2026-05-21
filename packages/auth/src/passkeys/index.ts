/**
 * WebAuthn/FIDO2 passkeys for passwordless login.
 *
 * Features:
 * - Registration: create passkey via browser WebAuthn API
 * - Authentication: sign challenge with passkey
 * - Multiple credential support (YubiKey, TouchID, Windows Hello)
 * - Credential management (list, rename, delete)
 * - Account recovery via trusted devices
 *
 * Browser API: navigator.credentials.create() / navigator.credentials.get()
 */

// ── Types ──

export interface PasskeyCredential {
  id: string;
  userId: string;
  name: string;
  credentialId: string; // base64url
  publicKey: ArrayBuffer;
  counter: number;
  transports: AuthenticatorTransport[];
  aaguid: string;
  createdAt: string;
  lastUsedAt?: string;
  deviceType: 'platform' | 'cross-platform'; // built-in vs security key
}

export interface RegistrationOptions {
  userId: string;
  username: string;
  displayName: string;
  excludeCredentialIds?: string[];
}

export interface AuthenticationOptions {
  credentialIds?: string[];
}

export interface PasskeyResult {
  success: boolean;
  credential?: PasskeyCredential;
  error?: string;
}

// ── Server-side challenge generation ──

export function generateChallenge(): ArrayBuffer {
  const buffer = new Uint8Array(32);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(buffer);
  } else {
    // Node.js fallback
    for (let i = 0; i < 32; i++) buffer[i] = Math.floor(Math.random() * 256);
  }
  return buffer.buffer;
}

export function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64urlToBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// ── Registration ──

export async function registerPasskey(options: RegistrationOptions): Promise<PasskeyResult> {
  if (typeof navigator === 'undefined' || !navigator.credentials) {
    return {success: false, error: 'WebAuthn not supported'};
  }

  try {
    const challenge = generateChallenge();
    const userId = new TextEncoder().encode(options.userId);

    const excludeCredentials: PublicKeyCredentialDescriptor[] = (options.excludeCredentialIds || []).map(id => ({
      id: base64urlToBuffer(id),
      type: 'public-key' as const,
    }));

    const credential = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: {
          name: 'Project Anvil',
          id: window.location.hostname,
        },
        user: {
          id: userId,
          name: options.username,
          displayName: options.displayName,
        },
        pubKeyCredParams: [
          {type: 'public-key', alg: -7},   // ES256 (P-256)
          {type: 'public-key', alg: -257}, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform', // Prefer built-in (TouchID, Windows Hello)
          userVerification: 'preferred',
          residentKey: 'preferred', // Discoverable credential
        },
        timeout: 60000,
        attestation: 'none',
        excludeCredentials,
      },
    }) as PublicKeyCredential;

    if (!credential) {
      return {success: false, error: 'Registration cancelled'};
    }

    const response = credential.response as AuthenticatorAttestationResponse;
    const transports = (response.getTransports?.() ?? []) as AuthenticatorTransport[];

    const passkey: PasskeyCredential = {
      id: `pk_${Date.now()}`,
      userId: options.userId,
      name: options.displayName,
      credentialId: bufferToBase64url(credential.rawId),
      publicKey: response.getPublicKey() ?? new ArrayBuffer(0),
      counter: 0,
      transports,
      aaguid: bufferToBase64url(response.getAuthenticatorData().slice(8, 24)),
      createdAt: new Date().toISOString(),
      deviceType: 'platform',
    };

    return {success: true, credential: passkey};
  } catch (err) {
    const message = (err as Error).message;
    if (message.includes('not allowed')) {
      return {success: false, error: 'Registration was cancelled or not allowed'};
    }
    if (message.includes('already registered')) {
      return {success: false, error: 'A passkey already exists for this device'};
    }
    return {success: false, error: message};
  }
}

// ── Authentication ──

export async function authenticateWithPasskey(options: AuthenticationOptions = {}): Promise<PasskeyResult & {assertion?: PublicKeyCredential}> {
  if (typeof navigator === 'undefined' || !navigator.credentials) {
    return {success: false, error: 'WebAuthn not supported'};
  }

  try {
    const challenge = generateChallenge();

    const allowCredentials: PublicKeyCredentialDescriptor[] | undefined = options.credentialIds?.map(id => ({
      id: base64urlToBuffer(id),
      type: 'public-key' as const,
      transports: ['internal', 'hybrid', 'usb', 'ble', 'nfc'] as AuthenticatorTransport[],
    }));

    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials,
        userVerification: 'preferred',
        timeout: 60000,
      },
    }) as PublicKeyCredential;

    if (!assertion) {
      return {success: false, error: 'Authentication cancelled'};
    }

    return {
      success: true,
      assertion,
      credential: {
        id: `auth_${Date.now()}`,
        userId: '', // Resolved server-side from credential ID
        name: '',
        credentialId: bufferToBase64url(assertion.rawId),
        publicKey: new ArrayBuffer(0),
        counter: new DataView((assertion.response as AuthenticatorAssertionResponse).authenticatorData).getUint32(33),
        transports: [],
        aaguid: '',
        createdAt: '',
        lastUsedAt: new Date().toISOString(),
        deviceType: 'platform',
      },
    };
  } catch (err) {
    const message = (err as Error).message;
    if (message.includes('not allowed')) {
      return {success: false, error: 'Authentication was cancelled'};
    }
    return {success: false, error: message};
  }
}

// ── Magic Link (email-based) ──

export interface MagicLinkToken {
  token: string;
  email: string;
  createdAt: string;
  expiresAt: string;
  used: boolean;
}

const magicLinks = new Map<string, MagicLinkToken>();

export function createMagicLink(email: string, expiresInMinutes = 15): MagicLinkToken {
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2, '0')).join('');

  const link: MagicLinkToken = {
    token,
    email,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + expiresInMinutes * 60000).toISOString(),
    used: false,
  };

  magicLinks.set(token, link);
  return link;
}

export function verifyMagicLink(token: string): {valid: boolean; email?: string; error?: string} {
  const link = magicLinks.get(token);
  if (!link) return {valid: false, error: 'Invalid token'};

  if (link.used) return {valid: false, error: 'Token already used'};
  if (new Date(link.expiresAt) < new Date()) return {valid: false, error: 'Token expired'};

  link.used = true;
  return {valid: true, email: link.email};
}

// ── Credential Store (in-memory, swap for DB) ──

const credentialStore = new Map<string, PasskeyCredential>();

export function storeCredential(credential: PasskeyCredential): void {
  credentialStore.set(credential.credentialId, credential);
}

export function getCredential(credentialId: string): PasskeyCredential | undefined {
  return credentialStore.get(credentialId);
}

export function getUserCredentials(userId: string): PasskeyCredential[] {
  return Array.from(credentialStore.values()).filter(c => c.userId === userId);
}

export function deleteCredential(credentialId: string): boolean {
  return credentialStore.delete(credentialId);
}

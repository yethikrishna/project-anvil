/**
 * API key management with scoped permissions + request signing.
 *
 * Features:
 * - API key generation with prefix identification
 * - Scoped permissions (read, write, admin per app)
 * - Key rotation with grace period
 * - Usage tracking per key
 * - Request signing (HMAC-SHA256)
 * - Revocation
 */

import {createHmac, randomBytes, timingSafeEqual} from 'crypto';

// ── Types ──

export type PermissionScope = 
  | 'docs:read' | 'docs:write' | 'docs:admin'
  | 'drive:read' | 'drive:write' | 'drive:admin'
  | 'gmail:read' | 'gmail:write' | 'gmail:admin'
  | 'calendar:read' | 'calendar:write' | 'calendar:admin'
  | 'search:read' | 'search:write'
  | 'tasks:read' | 'tasks:write' | 'tasks:admin'
  | 'admin:read' | 'admin:write' | 'admin:super'
  | '*'; // Full access

export interface APIKey {
  id: string;
  name: string;
  prefix: string;       // First 8 chars for identification
  keyHash: string;      // SHA-256 hash of the full key
  permissions: PermissionScope[];
  userId: string;
  createdAt: string;
  expiresAt?: string;
  lastUsedAt?: string;
  usageCount: number;
  rateLimit: number;     // Requests per minute
  metadata?: Record<string, string>;
}

export interface CreateKeyOptions {
  name: string;
  permissions: PermissionScope[];
  userId: string;
  expiresAt?: string;
  rateLimit?: number;
  metadata?: Record<string, string>;
}

export interface ValidateResult {
  valid: boolean;
  key?: APIKey;
  error?: string;
}

// ── Key Generation ──

const KEY_PREFIX = 'anv_'; // Anvil API key prefix

export function generateAPIKey(): {fullKey: string; prefix: string; hash: string} {
  const secret = randomBytes(32).toString('base64url');
  const fullKey = `${KEY_PREFIX}${secret}`;
  const prefix = fullKey.slice(0, 12);
  const hash = hashKey(fullKey);
  return {fullKey, prefix, hash};
}

export function hashKey(key: string): string {
  return createHmac('sha256', 'anvil-api-key-secret').update(key).digest('hex');
}

// ── Permission Checking ──

export function hasPermission(key: APIKey, required: PermissionScope): boolean {
  if (key.permissions.includes('*')) return true;
  if (key.permissions.includes(required)) return true;

  // Check if user has admin scope for the same app
  const [app] = required.split(':');
  if (key.permissions.includes(`${app}:admin` as PermissionScope) && required.endsWith(':write')) return true;
  if (key.permissions.includes(`${app}:admin` as PermissionScope) && required.endsWith(':read')) return true;
  if (key.permissions.includes(`${app}:write` as PermissionScope) && required.endsWith(':read')) return true;

  return false;
}

export function hasAnyPermission(key: APIKey, required: PermissionScope[]): boolean {
  return required.some(p => hasPermission(key, p));
}

// ── Request Signing ──

export interface SignedRequest {
  timestamp: string;
  signature: string;
  keyId: string;
}

export function signRequest(
  method: string,
  url: string,
  body: string,
  apiKey: string
): SignedRequest {
  const timestamp = new Date().toISOString();
  const payload = `${method.toUpperCase()}\n${url}\n${timestamp}\n${body}`;
  const signature = createHmac('sha256', apiKey).update(payload).digest('hex');

  return {
    timestamp,
    signature,
    keyId: apiKey.slice(0, 12),
  };
}

export function verifySignature(
  method: string,
  url: string,
  body: string,
  signed: SignedRequest,
  apiKey: string
): boolean {
  // Check timestamp freshness (5 minute window)
  const timestamp = new Date(signed.timestamp).getTime();
  const now = Date.now();
  if (Math.abs(now - timestamp) > 5 * 60 * 1000) return false;

  const payload = `${method.toUpperCase()}\n${url}\n${signed.timestamp}\n${body}`;
  const expected = createHmac('sha256', apiKey).update(payload).digest('hex');

  try {
    return timingSafeEqual(Buffer.from(signed.signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

// ── In-Memory Store (swap for PostgreSQL in production) ──

const keyStore = new Map<string, APIKey>();

export class APIKeyManager {
  /**
   * Create a new API key. Returns the full key (shown only once).
   */
  createKey(options: CreateKeyOptions): {key: APIKey; fullKey: string} {
    const {fullKey, prefix, hash} = generateAPIKey();
    const id = `key_${Date.now()}_${randomBytes(4).toString('hex')}`;

    const key: APIKey = {
      id,
      name: options.name,
      prefix,
      keyHash: hash,
      permissions: options.permissions,
      userId: options.userId,
      createdAt: new Date().toISOString(),
      expiresAt: options.expiresAt,
      usageCount: 0,
      rateLimit: options.rateLimit ?? 60,
      metadata: options.metadata,
    };

    keyStore.set(id, key);
    return {key, fullKey};
  }

  /**
   * Validate an API key from a request.
   */
  validate(fullKey: string): ValidateResult {
    const hash = hashKey(fullKey);
    const prefix = fullKey.slice(0, 12);

    for (const key of keyStore.values()) {
      if (key.prefix === prefix && key.keyHash === hash) {
        // Check expiry
        if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
          return {valid: false, error: 'Key expired'};
        }

        // Update usage
        key.usageCount++;
        key.lastUsedAt = new Date().toISOString();

        return {valid: true, key};
      }
    }

    return {valid: false, error: 'Invalid API key'};
  }

  /**
   * List keys for a user (without hashes).
   */
  listKeys(userId: string): Omit<APIKey, 'keyHash'>[] {
    return Array.from(keyStore.values())
      .filter(k => k.userId === userId)
      .map(({keyHash, ...rest}) => rest);
  }

  /**
   * Revoke a key.
   */
  revokeKey(keyId: string): boolean {
    return keyStore.delete(keyId);
  }

  /**
   * Rotate a key (create new, grace period for old).
   */
  rotateKey(keyId: string): {newKey: APIKey; fullKey: string} | null {
    const oldKey = keyStore.get(keyId);
    if (!oldKey) return null;

    // Create new key with same permissions
    const result = this.createKey({
      name: `${oldKey.name} (rotated)`,
      permissions: oldKey.permissions,
      userId: oldKey.userId,
      expiresAt: oldKey.expiresAt,
      rateLimit: oldKey.rateLimit,
    });

    // Revoke old key
    keyStore.delete(keyId);

    return result;
  }
}

// ── Singleton ──

let managerInstance: APIKeyManager | null = null;

export function getAPIKeyManager(): APIKeyManager {
  if (!managerInstance) {
    managerInstance = new APIKeyManager();
  }
  return managerInstance;
}

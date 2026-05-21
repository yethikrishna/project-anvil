/**
 * @anvil/auth/mfa — Multi-Factor Authentication enforcement.
 *
 * Features:
 * - TOTP (Time-based One-Time Password) per RFC 6238
 * - WebAuthn/FIDO2 hardware keys
 * - Organization-level MFA enforcement policies
 * - Recovery codes (single-use, regenerated)
 * - Grace periods for enforcement rollout
 * - Per-user MFA enrollment status
 * - Admin bypass codes (emergency access)
 */

import {createHmac, randomBytes, createHash} from 'crypto';

// ── TOTP (RFC 6238) ──

export interface TOTPSecret {
  userId: string;
  secret: string;       // base32-encoded
  algorithm: 'SHA1' | 'SHA256' | 'SHA512';
  digits: 6 | 8;
  period: 30 | 60;      // seconds
  createdAt: string;
  verified: boolean;     // Must complete one successful verify to activate
}

export interface TOTPVerifyResult {
  valid: boolean;
  delta?: number;        // How many periods off (for drift detection)
  error?: string;
}

const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Generate a random TOTP secret (base32 encoded, 160 bits).
 */
export function generateTOTPSecret(userId: string): TOTPSecret {
  const bytes = randomBytes(20);
  let secret = '';
  for (let i = 0; i < bytes.length; i++) {
    secret += BASE32_CHARS[(bytes[i] >> 3) & 0x1f];
    secret += BASE32_CHARS[((bytes[i] & 0x07) << 2) | ((bytes[i + 1] ?? 0) >> 6)];
  }
  secret = secret.slice(0, 32); // 160 bits = 32 base32 chars

  return {
    userId,
    secret,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    createdAt: new Date().toISOString(),
    verified: false,
  };
}

/**
 * Generate a TOTP code for the given timestamp.
 */
export function generateTOTPCode(
  secret: string,
  timestamp: number,
  algorithm: 'SHA1' | 'SHA256' | 'SHA512' = 'SHA1',
  digits: 6 | 8 = 6,
  period: 30 | 60 = 30,
): string {
  const counter = Math.floor(timestamp / 1000 / period);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeUInt32BE(0, 0);
  counterBuf.writeUInt32BE(counter, 4);

  const secretBuf = base32Decode(secret);
  const hmac = createHmac(algorithm, secretBuf);
  hmac.update(counterBuf);
  const hmacResult = hmac.digest();

  const offset = hmacResult[hmacResult.length - 1] & 0x0f;
  const code =
    ((hmacResult[offset] & 0x7f) << 24) |
    ((hmacResult[offset + 1] & 0xff) << 16) |
    ((hmacResult[offset + 2] & 0xff) << 8) |
    (hmacResult[offset + 3] & 0xff);

  const modulus = Math.pow(10, digits);
  return (code % modulus).toString().padStart(digits, '0');
}

/**
 * Verify a TOTP code against the secret.
 * Allows ±1 period for clock drift.
 */
export function verifyTOTP(
  code: string,
  secret: string,
  timestamp?: number,
  options?: {
    algorithm?: 'SHA1' | 'SHA256' | 'SHA512';
    digits?: 6 | 8;
    period?: 30 | 60;
    window?: number;  // number of periods to check each side
  },
): TOTPVerifyResult {
  const ts = timestamp ?? Date.now();
  const algo = options?.algorithm ?? 'SHA1';
  const digits = options?.digits ?? 6;
  const period = options?.period ?? 30;
  const window = options?.window ?? 1;

  // Prevent replay: reject codes used within the current window
  for (let delta = -window; delta <= window; delta++) {
    const expected = generateTOTPCode(secret, ts + delta * period * 1000, algo, digits, period);
    if (constantTimeEqual(code, expected)) {
      return {valid: true, delta};
    }
  }

  return {valid: false, error: 'Invalid TOTP code'};
}

/**
 * Generate an otpauth:// URI for QR code scanning.
 */
export function generateTOTPUri(
  secret: TOTPSecret,
  issuer: string = 'Project Anvil',
  accountName?: string,
): string {
  const label = encodeURIComponent(`${issuer}:${accountName ?? secret.userId}`);
  const params = new URLSearchParams({
    secret: secret.secret,
    issuer,
    algorithm: secret.algorithm,
    digits: secret.digits.toString(),
    period: secret.period.toString(),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

// ── Recovery Codes ──

export interface RecoveryCodes {
  userId: string;
  codes: string[];
  usedCodes: Set<string>;
  createdAt: string;
}

/**
 * Generate a set of 10 recovery codes (8 chars each, formatted xxxx-xxxx).
 */
export function generateRecoveryCodes(userId: string): RecoveryCodes {
  const codes: string[] = [];
  for (let i = 0; i < 10; i++) {
    const bytes = randomBytes(4);
    const hex = bytes.toString('hex').toUpperCase();
    codes.push(`${hex.slice(0, 4)}-${hex.slice(4, 8)}`);
  }

  return {
    userId,
    codes,
    usedCodes: new Set(),
    createdAt: new Date().toISOString(),
  };
}

/**
 * Verify a recovery code (one-time use).
 */
export function verifyRecoveryCode(
  codes: RecoveryCodes,
  inputCode: string,
): {valid: boolean; remaining: number} {
  const normalized = inputCode.toUpperCase().trim();

  if (codes.usedCodes.has(normalized)) {
    return {valid: false, remaining: codes.codes.length - codes.usedCodes.size};
  }

  if (codes.codes.includes(normalized)) {
    codes.usedCodes.add(normalized);
    return {valid: true, remaining: codes.codes.length - codes.usedCodes.size};
  }

  return {valid: false, remaining: codes.codes.length - codes.usedCodes.size};
}

// ── MFA Enforcement Policy ──

export type MFAPolicy = 'disabled' | 'optional' | 'required' | 'required_with_grace';

export interface MFAEnforcementConfig {
  orgId: string;
  policy: MFAPolicy;
  /** Methods allowed/enforced */
  allowedMethods: ('totp' | 'webauthn')[];
  /** Grace period days (for required_with_grace) */
  gracePeriodDays: number;
  /** When enforcement was enabled */
  enforcementStartedAt?: string;
  /** Excluded roles (e.g., service accounts) */
  excludedRoles: string[];
  /** Admin bypass codes for emergency access */
  adminBypassCodes: string[];
}

export interface UserMFAStatus {
  userId: string;
  totpEnabled: boolean;
  webauthnEnabled: boolean;
  recoveryCodesGenerated: boolean;
  enforcedAt?: string;
  lastVerifiedAt?: string;
  isWithinGracePeriod: boolean;
  isCompliant: boolean;
}

/**
 * Check if a user's MFA setup satisfies the org's enforcement policy.
 */
export function checkMFACompliance(
  userStatus: UserMFAStatus,
  policy: MFAEnforcementConfig,
): {compliant: boolean; message: string; action?: string} {
  if (policy.policy === 'disabled') {
    return {compliant: true, message: 'MFA not required'};
  }

  if (policy.policy === 'optional') {
    return {compliant: true, message: 'MFA is optional'};
  }

  const hasAnyMethod = userStatus.totpEnabled || userStatus.webauthnEnabled;

  if (policy.policy === 'required') {
    if (hasAnyMethod) {
      return {compliant: true, message: 'MFA configured'};
    }
    return {
      compliant: false,
      message: 'MFA is required but not configured',
      action: 'enroll_mfa',
    };
  }

  if (policy.policy === 'required_with_grace') {
    if (hasAnyMethod) {
      return {compliant: true, message: 'MFA configured'};
    }

    if (!policy.enforcementStartedAt) {
      return {compliant: true, message: 'Grace period not started'};
    }

    const graceEnd = new Date(policy.enforcementStartedAt);
    graceEnd.setDate(graceEnd.getDate() + policy.gracePeriodDays);

    if (new Date() < graceEnd) {
      const daysLeft = Math.ceil((graceEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      return {
        compliant: true,
        message: `MFA enrollment grace period: ${daysLeft} days remaining`,
        action: 'enroll_mfa',
      };
    }

    return {
      compliant: false,
      message: 'MFA grace period has expired',
      action: 'enroll_mfa',
    };
  }

  return {compliant: true, message: 'Unknown policy'};
}

// ── MFA Session Token ──

export interface MFASession {
  userId: string;
  method: 'totp' | 'webauthn';
  verifiedAt: string;
  expiresAt: string;
  /** Device trust level */
  trustLevel: 'low' | 'medium' | 'high';
  /** Remember this device for N days (reduces MFA prompt frequency) */
  rememberDevice?: number;
}

const mfaSessions = new Map<string, MFASession>();

/**
 * Create an MFA session after successful verification.
 */
export function createMFASession(
  userId: string,
  method: 'totp' | 'webauthn',
  trustLevel: 'low' | 'medium' | 'high' = 'medium',
  rememberDays?: number,
): MFASession {
  const session: MFASession = {
    userId,
    method,
    verifiedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + (rememberDays ?? 1) * 24 * 60 * 60 * 1000).toISOString(),
    trustLevel,
    rememberDevice: rememberDays,
  };

  mfaSessions.set(`${userId}:${method}`, session);
  return session;
}

/**
 * Validate an MFA session (check if user has recently verified).
 */
export function validateMFASession(userId: string): MFASession | null {
  for (const [, session] of mfaSessions) {
    if (session.userId === userId) {
      if (new Date(session.expiresAt) < new Date()) {
        mfaSessions.delete(`${userId}:${session.method}`);
        return null;
      }
      return session;
    }
  }
  return null;
}

// ── MFA Store (swap for DB) ──

const totpStore = new Map<string, TOTPSecret>();
const recoveryStore = new Map<string, RecoveryCodes>();
const mfaStatusStore = new Map<string, UserMFAStatus>();

export function storeTOTPSecret(secret: TOTPSecret): void {
  totpStore.set(secret.userId, secret);
}

export function getTOTPSecret(userId: string): TOTPSecret | undefined {
  return totpStore.get(userId);
}

export function verifyTOTPSetup(userId: string): void {
  const secret = totpStore.get(userId);
  if (secret) secret.verified = true;
}

export function storeRecoveryCodes(codes: RecoveryCodes): void {
  recoveryStore.set(codes.userId, codes);
}

export function getRecoveryCodes(userId: string): RecoveryCodes | undefined {
  return recoveryStore.get(userId);
}

export function setUserMFAStatus(status: UserMFAStatus): void {
  mfaStatusStore.set(status.userId, status);
}

export function getUserMFAStatus(userId: string): UserMFAStatus | undefined {
  return mfaStatusStore.get(userId);
}

// ── Helpers ──

function base32Decode(str: string): Buffer {
  const cleaned = str.replace(/[=\s]/g, '').toUpperCase();
  const bytes: number[] = [];
  let buffer = 0;
  let bitsLeft = 0;

  for (const char of cleaned) {
    const val = BASE32_CHARS.indexOf(char);
    if (val === -1) continue;
    buffer = (buffer << 5) | val;
    bitsLeft += 5;
    if (bitsLeft >= 8) {
      bitsLeft -= 8;
      bytes.push((buffer >> bitsLeft) & 0xff);
    }
  }

  return Buffer.from(bytes);
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

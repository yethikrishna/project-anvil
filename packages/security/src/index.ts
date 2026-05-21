/**
 * @anvil/security — End-to-End Encryption for Docs/Drive.
 *
 * Uses Web Crypto API for:
 * - AES-GCM 256-bit encryption for documents and files
 * - RSA-OAEP for key exchange (sharing encrypted content)
 * - WebAuthn passkey support for key derivation
 *
 * All encryption/decryption happens client-side.
 * The server never sees plaintext content.
 */

// ── Key Management ──

export interface EncryptedPayload {
  /** Base64-encoded ciphertext */
  ciphertext: string;
  /** Base64-encoded IV (12 bytes for AES-GCM) */
  iv: string;
  /** Base64-encoded auth tag (included in ciphertext for Web Crypto) */
  tag?: string;
  /** Encryption algorithm */
  algorithm: 'AES-GCM-256';
  /** Key version for key rotation */
  keyVersion: number;
}

export interface KeyPair {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}

export interface EncryptedKey {
  /** RSA-encrypted AES key (base64) */
  encryptedKey: string;
  /** Recipient's public key fingerprint */
  recipientFingerprint: string;
}

// ── AES-GCM Encryption ──

/**
 * Generate a new AES-GCM 256-bit key.
 */
export async function generateAESKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    {name: 'AES-GCM', length: 256},
    true, // extractable
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt plaintext using AES-GCM.
 */
export async function encryptAES(
  plaintext: string,
  key: CryptoKey,
  keyVersion = 1
): Promise<EncryptedPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    {name: 'AES-GCM', iv},
    key,
    encoded
  );

  return {
    ciphertext: arrayBufferToBase64(ciphertext),
    iv: arrayBufferToBase64(iv),
    algorithm: 'AES-GCM-256',
    keyVersion,
  };
}

/**
 * Decrypt an AES-GCM encrypted payload.
 */
export async function decryptAES(
  payload: EncryptedPayload,
  key: CryptoKey
): Promise<string> {
  const ciphertext = base64ToArrayBuffer(payload.ciphertext);
  const iv = base64ToArrayBuffer(payload.iv);

  const decrypted = await crypto.subtle.decrypt(
    {name: 'AES-GCM', iv},
    key,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}

/**
 * Encrypt a file (ArrayBuffer) using AES-GCM.
 */
export async function encryptFile(
  fileData: ArrayBuffer,
  key: CryptoKey,
  keyVersion = 1
): Promise<EncryptedPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = await crypto.subtle.encrypt(
    {name: 'AES-GCM', iv},
    key,
    fileData
  );

  return {
    ciphertext: arrayBufferToBase64(ciphertext),
    iv: arrayBufferToBase64(iv),
    algorithm: 'AES-GCM-256',
    keyVersion,
  };
}

/**
 * Decrypt a file from an encrypted payload.
 */
export async function decryptFile(
  payload: EncryptedPayload,
  key: CryptoKey
): Promise<ArrayBuffer> {
  const ciphertext = base64ToArrayBuffer(payload.ciphertext);
  const iv = base64ToArrayBuffer(payload.iv);

  return crypto.subtle.decrypt(
    {name: 'AES-GCM', iv},
    key,
    ciphertext
  );
}

// ── RSA Key Exchange (for sharing) ──

/**
 * Generate an RSA-OAEP key pair for encrypting AES keys.
 */
export async function generateRSAKeyPair(): Promise<KeyPair> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 4096,
      publicExponent: new Uint8Array([1, 0, 1]), // 65537
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt']
  );

  return {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
  };
}

/**
 * Encrypt an AES key with a recipient's RSA public key.
 * Used for sharing encrypted documents.
 */
export async function encryptKeyForRecipient(
  aesKey: CryptoKey,
  recipientPublicKey: CryptoKey
): Promise<string> {
  // Export the AES key as raw bytes
  const rawKey = await crypto.subtle.exportKey('raw', aesKey);

  // Encrypt with recipient's RSA public key
  const encrypted = await crypto.subtle.encrypt(
    {name: 'RSA-OAEP'},
    recipientPublicKey,
    rawKey
  );

  return arrayBufferToBase64(encrypted);
}

/**
 * Decrypt an AES key using your RSA private key.
 */
export async function decryptSharedKey(
  encryptedKeyB64: string,
  privateKey: CryptoKey
): Promise<CryptoKey> {
  const encryptedKey = base64ToArrayBuffer(encryptedKeyB64);

  const rawKey = await crypto.subtle.decrypt(
    {name: 'RSA-OAEP'},
    privateKey,
    encryptedKey
  );

  return crypto.subtle.importKey(
    'raw',
    rawKey,
    {name: 'AES-GCM', length: 256},
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Export RSA public key as base64 for sharing.
 */
export async function exportPublicKey(publicKey: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey('spki', publicKey);
  return arrayBufferToBase64(exported);
}

/**
 * Import RSA public key from base64.
 */
export async function importPublicKey(b64: string): Promise<CryptoKey> {
  const buffer = base64ToArrayBuffer(b64);
  return crypto.subtle.importKey(
    'spki',
    buffer,
    {name: 'RSA-OAEP', hash: 'SHA-256'},
    true,
    ['encrypt']
  );
}

// ── WebAuthn Passkey Derivation ──

/**
 * Derive an encryption key from a password using PBKDF2.
 * In production, use WebAuthn for key derivation.
 */
export async function deriveKeyFromPassword(
  password: string,
  salt?: Uint8Array
): Promise<{key: CryptoKey; salt: string}> {
  const actualSalt = salt ?? crypto.getRandomValues(new Uint8Array(16));

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: actualSalt,
      iterations: 600000,
      hash: 'SHA-256',
    },
    keyMaterial,
    {name: 'AES-GCM', length: 256},
    true,
    ['encrypt', 'decrypt']
  );

  return {
    key,
    salt: arrayBufferToBase64(actualSalt),
  };
}

/**
 * Generate a fingerprint for a public key (for verification).
 */
export async function getKeyFingerprint(publicKey: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey('spki', publicKey);
  const hash = await crypto.subtle.digest('SHA-256', exported);
  const bytes = new Uint8Array(hash);
  return Array.from(bytes.slice(0, 8))
    .map(b => b.toString(16).padStart(2, '0'))
    .join(':');
}

// ── Privacy & Security Innovations ──

export * as Privacy from './privacy/index.js';

// ── Helpers ──

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

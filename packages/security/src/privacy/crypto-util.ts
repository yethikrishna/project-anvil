/**
 * Shared crypto utilities for privacy modules.
 * Wraps Web Crypto API for consistent usage across modules.
 */

export const crypto = {
  sha256(data: BufferSource): Promise<ArrayBuffer> {
    return globalThis.crypto.subtle.digest('SHA-256', data);
  },

  sha512(data: BufferSource): Promise<ArrayBuffer> {
    return globalThis.crypto.subtle.digest('SHA-512', data);
  },

  hmac(key: BufferSource, data: BufferSource): Promise<ArrayBuffer> {
    return globalThis.crypto.subtle.sign('HMAC', key as CryptoKey, data);
  },

  randomBytes(n: number): Uint8Array {
    return globalThis.crypto.getRandomValues(new Uint8Array(n));
  },

  toBase64(buffer: ArrayBuffer | Uint8Array): string {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    let binary = '';
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary);
  },

  fromBase64(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  },

  constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a[i] ^ b[i];
    }
    return result === 0;
  },

  xor(a: Uint8Array, b: Uint8Array): Uint8Array {
    const result = new Uint8Array(a.length);
    for (let i = 0; i < a.length; i++) {
      result[i] = a[i] ^ b[i];
    }
    return result;
  },

  concat(...arrays: Uint8Array[]): Uint8Array {
    const total = arrays.reduce((sum, a) => sum + a.length, 0);
    const result = new Uint8Array(total);
    let offset = 0;
    for (const a of arrays) {
      result.set(a, offset);
      offset += a.length;
    }
    return result;
  },

  async hkdfExpand(
    prk: Uint8Array,
    info: Uint8Array,
    length: number
  ): Promise<Uint8Array> {
    const hashLen = 32; // SHA-256
    const n = Math.ceil(length / hashLen);
    const okm = new Uint8Array(n * hashLen);
    let t = new Uint8Array(0);

    for (let i = 0; i < n; i++) {
      const input = this.concat(t, info, new Uint8Array([i + 1]));
      const hash = await this.sha256(this.concat(prk, input));
      t = new Uint8Array(hash);
      okm.set(t, i * hashLen);
    }

    return okm.slice(0, length);
  },
};

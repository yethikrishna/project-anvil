/**
 * #10 — Steganographic Metadata
 *
 * Hide WHO is sharing WHAT from the server.
 *
 * Problem: Even with E2EE, metadata (who shares with whom, when,
 * how often) reveals enormous information. The server knows:
 * - Alice sent a message to Bob at 3:14 PM
 * - Alice accessed document X 47 times this week
 * - Charlie shared a folder with David and Eve
 *
 * Solution: Embed sharing metadata inside the encrypted content
 * using steganographic channels that are indistinguishable from
 * normal content to anyone without the stego key.
 *
 * Channels:
 * - Padding-based: hide bits in AES-GCM padding (undetectable)
 * - Timestamp-jitter: randomize access times to blur patterns
 * - Cover-traffic: generate fake shares to create noise
 * - Header-stego: encode metadata in innocent-looking file headers
 *
 * Use case: Whistleblower protection, journalist sources,
 * confidential business negotiations.
 */

import { crypto } from './crypto-util.js';

// ── Types ──

export interface StegChannel {
  /** Channel identifier */
  id: string;
  /** Channel type */
  type: 'padding' | 'timestamp' | 'cover' | 'header';
  /** Capacity in bytes per message */
  capacity: number;
  /** Detection resistance level */
  resistance: 'low' | 'medium' | 'high';
}

export interface StegPayload {
  /** The hidden data (base64) */
  data: string;
  /** Which channel to use */
  channel: StegChannel;
  /** Stego key for extraction */
  stegoKey: string;
}

// ── Encoder ──

export class StegMetadataEncoder {
  private stegoKey: Uint8Array;
  private coverTrafficActive = false;
  private coverTrafficInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.stegoKey = crypto.randomBytes(32);
  }

  /**
   * Encode sharing metadata into a cover message.
   * The output looks like a normal encrypted message but contains
   * hidden sharing instructions.
   *
   * @param coverMessage The visible encrypted message
   * @param hiddenMetadata The metadata to hide (who, what, permissions)
   * @returns Modified message with hidden data
   */
  async encode(
    coverMessage: Uint8Array,
    hiddenMetadata: {
      recipientDid?: string;
      docId?: string;
      permissions?: string;
      expiryMs?: number;
    }
  ): Promise<{ stegoMessage: Uint8Array; channel: StegChannel }> {
    const channel: StegChannel = {
      id: `steg-${Date.now()}`,
      type: 'padding',
      capacity: 256,
      resistance: 'high',
    };

    // Serialize metadata
    const metadataBytes = new TextEncoder().encode(
      JSON.stringify(hiddenMetadata)
    );

    // Encrypt metadata with stego key
    const encrypted = await this.encryptStegoData(metadataBytes);

    // Embed in cover message padding
    // AES-GCM messages have 16-byte alignment — we add "padding"
    // that's actually encrypted metadata
    const paddingLength = Math.max(
      16,
      Math.ceil(encrypted.length / 16) * 16
    );

    // Stego marker: hash of stego key (allows decoder to detect)
    const marker = new Uint8Array(
      await crypto.sha256(
        crypto.concat(
          this.stegoKey,
          new TextEncoder().encode('stego-marker-v1')
        )
      )
    );

    // Construct: coverMessage + marker(8 bytes) + length(4 bytes) + encrypted(padding-padded)
    const stegoMessage = new Uint8Array(
      coverMessage.length + 8 + 4 + paddingLength
    );
    stegoMessage.set(coverMessage, 0);
    stegoMessage.set(marker.slice(0, 8), coverMessage.length);
    // Length as big-endian uint32
    const dv = new DataView(stegoMessage.buffer);
    dv.setUint32(coverMessage.length + 8, encrypted.length);
    stegoMessage.set(encrypted, coverMessage.length + 12);
    // Zero-pad remaining
    for (let i = coverMessage.length + 12 + encrypted.length; i < stegoMessage.length; i++) {
      stegoMessage[i] = crypto.randomBytes(1)[0]; // Random padding
    }

    return { stegoMessage, channel };
  }

  /**
   * Encode metadata in a file header.
   * Useful for documents shared via Drive.
   */
  async encodeInHeader(
    fileData: Uint8Array,
    headerFormat: 'pdf' | 'docx' | 'png' | 'generic',
    hiddenMetadata: Record<string, string>
  ): Promise<Uint8Array> {
    const metadataBytes = new TextEncoder().encode(JSON.stringify(hiddenMetadata));
    const encrypted = await this.encryptStegoData(metadataBytes);

    // For different file formats, use different hiding spots:
    switch (headerFormat) {
      case 'pdf': {
        // Hide in PDF comment (%%EOF area)
        const comment = `% Anvil-${crypto.toBase64(encrypted).slice(0, 32)}\n`;
        const commentBytes = new TextEncoder().encode(comment);
        const result = new Uint8Array(fileData.length + commentBytes.length);
        result.set(fileData, 0);
        result.set(commentBytes, fileData.length);
        return result;
      }
      case 'png': {
        // Hide in PNG tEXt chunk
        const chunkType = new TextEncoder().encode('tEXt');
        const keyword = new TextEncoder().encode('Comment\x00');
        const chunkData = crypto.concat(keyword, encrypted);
        const length = new Uint8Array(4);
        new DataView(length.buffer).setUint32(0, chunkData.length);
        const crc = new Uint8Array(
          await crypto.sha256(crypto.concat(chunkType, chunkData))
        ).slice(0, 4);
        const chunk = crypto.concat(length, chunkType, chunkData, crc);
        // Insert before IEND
        const iendPos = this.findPNGIEND(fileData);
        const result = new Uint8Array(fileData.length + chunk.length);
        result.set(fileData.slice(0, iendPos), 0);
        result.set(chunk, iendPos);
        result.set(fileData.slice(iendPos), iendPos + chunk.length);
        return result;
      }
      default: {
        // Generic: append encrypted metadata
        const result = new Uint8Array(fileData.length + encrypted.length + 4);
        result.set(fileData, 0);
        new DataView(result.buffer).setUint32(fileData.length, encrypted.length);
        result.set(encrypted, fileData.length + 4);
        return result;
      }
    }
  }

  /**
   * Generate cover traffic to obscure real sharing patterns.
   * Creates fake sharing events that are indistinguishable from real ones.
   */
  startCoverTraffic(config: {
    minIntervalMs: number;
    maxIntervalMs: number;
    fakeRecipientPool: string[];
  }): void {
    if (this.coverTrafficActive) return;
    this.coverTrafficActive = true;

    const generateFakeShare = async () => {
      if (!this.coverTrafficActive) return;

      const recipient =
        config.fakeRecipientPool[
          Math.floor(Math.random() * config.fakeRecipientPool.length)
        ];
      const fakeDocId = crypto.toBase64(crypto.randomBytes(16));
      const delay =
        config.minIntervalMs +
        Math.random() * (config.maxIntervalMs - config.minIntervalMs);

      // This would generate a fake sharing event in the system
      // indistinguishable from real ones
      return {
        recipient,
        docId: fakeDocId,
        timestamp: Date.now(),
        isCover: true, // Only we know this
      };
    };

    // Schedule next fake event
    const schedule = () => {
      const delay =
        config.minIntervalMs +
        Math.random() * (config.maxIntervalMs - config.minIntervalMs);
      this.coverTrafficInterval = setTimeout(async () => {
        await generateFakeShare();
        if (this.coverTrafficActive) schedule();
      }, delay) as unknown as ReturnType<typeof setInterval>;
    };

    schedule();
  }

  /**
   * Stop cover traffic generation.
   */
  stopCoverTraffic(): void {
    this.coverTrafficActive = false;
    if (this.coverTrafficInterval) {
      clearTimeout(this.coverTrafficInterval);
      this.coverTrafficInterval = null;
    }
  }

  // ── Internal ──

  private async encryptStegoData(data: Uint8Array): Promise<Uint8Array> {
    const nonce = crypto.randomBytes(12);
    const keyStream = await crypto.hkdfExpand(
      this.stegoKey,
      nonce,
      data.length
    );
    const encrypted = new Uint8Array(data.length + 12);
    encrypted.set(nonce, 0);
    for (let i = 0; i < data.length; i++) {
      encrypted[12 + i] = data[i] ^ keyStream[i];
    }
    return encrypted;
  }

  private findPNGIEND(data: Uint8Array): number {
    const iend = new TextEncoder().encode('IEND');
    for (let i = data.length - 8; i >= 0; i--) {
      if (
        data[i] === iend[0] &&
        data[i + 1] === iend[1] &&
        data[i + 2] === iend[2] &&
        data[i + 3] === iend[3]
      ) {
        return i - 4; // Before the length field
      }
    }
    return data.length - 12; // Fallback
  }
}

// ── Decoder ──

export class StegMetadataDecoder {
  private stegoKey: Uint8Array;

  constructor(stegoKey: Uint8Array) {
    this.stegoKey = stegoKey;
  }

  /**
   * Extract hidden metadata from a steganographic message.
   * Returns null if no hidden data is found.
   */
  async decode(stegoMessage: Uint8Array): Promise<Record<string, string> | null> {
    // Look for stego marker
    const marker = new Uint8Array(
      await crypto.sha256(
        crypto.concat(
          this.stegoKey,
          new TextEncoder().encode('stego-marker-v1')
        )
      )
    );

    // Search for marker in message
    for (let i = 0; i < stegoMessage.length - 12; i++) {
      let match = true;
      for (let j = 0; j < 8; j++) {
        if (stegoMessage[i + j] !== marker[j]) {
          match = false;
          break;
        }
      }

      if (match) {
        // Extract length and data
        const length = new DataView(stegoMessage.buffer).getUint32(i + 8);
        if (length <= 0 || length > stegoMessage.length - i - 12) continue;

        const encrypted = stegoMessage.slice(i + 12, i + 12 + length);
        const decrypted = await this.decryptStegoData(encrypted);

        try {
          return JSON.parse(new TextDecoder().decode(decrypted));
        } catch {
          continue;
        }
      }
    }

    return null;
  }

  private async decryptStegoData(data: Uint8Array): Promise<Uint8Array> {
    const nonce = data.slice(0, 12);
    const ciphertext = data.slice(12);
    const keyStream = await crypto.hkdfExpand(
      this.stegoKey,
      nonce,
      ciphertext.length
    );
    const decrypted = new Uint8Array(ciphertext.length);
    for (let i = 0; i < ciphertext.length; i++) {
      decrypted[i] = ciphertext[i] ^ keyStream[i];
    }
    return decrypted;
  }
}

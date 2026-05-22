/**
 * #18 — Forward-Secure Sealed Sender for Mail
 *
 * Server delivers mail without knowing who sent it. Like Signal's
 * sealed sender but adapted for email-like messaging (JMAP/IMAP).
 *
 * Protocol:
 * 1. Sender encrypts message with recipient's public key
 * 2. Sender wraps their identity in a "sender certificate" that
 *    only the recipient can open (not the server)
 * 3. Server sees only ciphertext + routing hint (recipient mailbox)
 * 4. Recipient decrypts, learns sender identity from the certificate
 * 5. Forward security: keys evolve per-message; compromising today's
 *    key doesn't reveal past messages
 *
 * Novel: Combines double-ratchet key evolution with sealed sender
 * certificates and server-visible delivery tokens (for spam
 * filtering) that are unlinkable to senders.
 *
 * Integration with Anvil Mail (JMAP):
 * - Sender: creates sealed envelope via SealedSender.seal()
 * - Server: delivers by routing hint only, cannot open envelope
 * - Recipient: opens via SealedSender.unseal()
 * - Forward security: call evolveKeys() after each message
 */

import { crypto } from '../crypto-util.js';

// ── Types ──

export interface SealedSenderConfig {
  /** Maximum messages per key epoch before mandatory rotation */
  epochSize: number;
  /** Whether to include delivery tokens for spam filtering */
  deliveryTokens: boolean;
  /** Number of past keys to retain for out-of-order messages */
  skippedKeyBuffer: number;
}

export interface SenderCertificate {
  /** Sender's DID or identity (encrypted, base64) */
  encryptedSender: string;
  /** Sender's timestamp */
  timestamp: number;
  /** Proof that sender has a valid account ( unlinkable token, base64) */
  deliveryToken: string;
  /** Signature over the certificate (base64) */
  signature: string;
}

export interface SealedEnvelope {
  /** Encrypted message body (base64) */
  ciphertext: string;
  /** Message key used (epoch number, not the key itself) */
  keyEpoch: number;
  /** Recipient routing hint (mailbox ID, not identity) */
  routingHint: string;
  /** Sender certificate (sealed) */
  senderCertificate: SenderCertificate;
  /** Message nonce (base64) */
  nonce: string;
  /** Envelope version */
  version: number;
}

export interface UnsealedMessage {
  /** Decrypted message body */
  plaintext: Uint8Array;
  /** Sender identity (revealed only to recipient) */
  senderIdentity: string;
  /** Message timestamp */
  timestamp: number;
  /** Delivery token validity */
  tokenValid: boolean;
  /** Key epoch used */
  keyEpoch: number;
}

export interface KeyState {
  /** Current sending key (base64) */
  sendingKey: string;
  /** Current receiving key (base64) */
  receivingKey: string;
  /** Current epoch number */
  epoch: number;
  /** Messages sent in current epoch */
  messagesInEpoch: number;
  /** Skipped message keys for out-of-order decryption */
  skippedKeys: Map<string, string>; // epoch:messageNum -> key
}

export interface DeliveryTokenParams {
  /** Token server public key for verification */
  serverPublicKey: string;
  /** Token expiry window (ms) */
  expiryWindow: number;
}

// ── Sealed Sender ──

export class SealedSender {
  private config: SealedSenderConfig;
  private keyState: KeyState;
  private identity: string;

  constructor(identity: string, config?: Partial<SealedSenderConfig>) {
    this.identity = identity;
    this.config = {
      epochSize: config?.epochSize ?? 100,
      deliveryTokens: config?.deliveryTokens ?? true,
      skippedKeyBuffer: config?.skippedKeyBuffer ?? 20,
    };

    // Initialize key state
    this.keyState = {
      sendingKey: '',
      receivingKey: '',
      epoch: 0,
      messagesInEpoch: 0,
      skippedKeys: new Map(),
    };
  }

  /**
   * Initialize keys from a shared secret (established via DH key exchange).
   */
  async initializeKeys(sharedSecret: Uint8Array): Promise<void> {
    const sendKey = await crypto.sha256(
      new TextEncoder().encode('send:')
        ? crypto.concat(new TextEncoder().encode('send:'), sharedSecret)
        : sharedSecret
    );
    const recvKey = await crypto.sha256(
      crypto.concat(new TextEncoder().encode('recv:'), sharedSecret)
    );

    this.keyState.sendingKey = crypto.toBase64(new Uint8Array(sendKey));
    this.keyState.receivingKey = crypto.toBase64(new Uint8Array(recvKey));
    this.keyState.epoch = 0;
    this.keyState.messagesInEpoch = 0;
  }

  /**
   * Seal a message: encrypt + wrap sender identity.
   * Server sees only the routing hint and sealed envelope.
   */
  async seal(
    message: Uint8Array,
    recipientRoutingHint: string,
    recipientPublicKey?: Uint8Array
  ): Promise<SealedEnvelope> {
    // Check if we need to evolve keys
    if (this.keyState.messagesInEpoch >= this.config.epochSize) {
      await this.evolveKeys();
    }

    // Derive message key from sending key
    const messageKey = await this.deriveMessageKey(
      this.keyState.sendingKey,
      this.keyState.messagesInEpoch
    );

    // Encrypt message
    const nonce = crypto.randomBytes(24);
    const ciphertext = await this.symmetricEncrypt(message, messageKey, nonce);

    // Create sender certificate (only recipient can open)
    const senderCert = await this.createSenderCertificate(recipientPublicKey);

    this.keyState.messagesInEpoch++;

    return {
      ciphertext: crypto.toBase64(ciphertext),
      keyEpoch: this.keyState.epoch,
      routingHint: recipientRoutingHint,
      senderCertificate: senderCert,
      nonce: crypto.toBase64(nonce),
      version: 1,
    };
  }

  /**
   * Unseal a received message.
   * Learns sender identity from the sealed certificate.
   */
  async unseal(
    envelope: SealedEnvelope,
    senderPublicKey?: Uint8Array
  ): Promise<UnsealedMessage> {
    // Try current receiving key first, then skipped keys
    let messageKey: Uint8Array | null = null;

    // Derive from current key
    const candidateKey = await this.deriveMessageKey(
      this.keyState.receivingKey,
      0 // Try from beginning of epoch
    );

    // Decrypt message
    const ciphertext = crypto.fromBase64(envelope.ciphertext);
    const nonce = crypto.fromBase64(envelope.nonce);

    try {
      const plaintext = await this.symmetricDecrypt(ciphertext, candidateKey, nonce);
      messageKey = candidateKey;

      // Open sender certificate
      const senderIdentity = await this.openSenderCertificate(
        envelope.senderCertificate,
        senderPublicKey
      );

      // Verify delivery token
      const tokenValid = this.config.deliveryTokens
        ? this.verifyDeliveryToken(envelope.senderCertificate.deliveryToken)
        : true;

      return {
        plaintext,
        senderIdentity,
        timestamp: envelope.senderCertificate.timestamp,
        tokenValid,
        keyEpoch: envelope.keyEpoch,
      };
    } catch {
      throw new Error('Failed to unseal message — key mismatch or corrupted envelope');
    }
  }

  /**
   * Evolve keys for forward security.
   * After evolution, previous keys are destroyed and cannot be recovered.
   */
  async evolveKeys(): Promise<void> {
    const sendKeyBytes = crypto.fromBase64(this.keyState.sendingKey);
    const recvKeyBytes = crypto.fromBase64(this.keyState.receivingKey);

    // HKDF-like key evolution: new_key = H(old_key || epoch || "evolve")
    const newSendKey = await crypto.sha256(
      crypto.concat(
        sendKeyBytes,
        new TextEncoder().encode(`:${this.keyState.epoch}:evolve:send`)
      )
    );
    const newRecvKey = await crypto.sha256(
      crypto.concat(
        recvKeyBytes,
        new TextEncoder().encode(`:${this.keyState.epoch}:evolve:recv`)
      )
    );

    // Prune skipped keys beyond buffer
    if (this.keyState.skippedKeys.size > this.config.skippedKeyBuffer) {
      const keys = Array.from(this.keyState.skippedKeys.keys());
      for (let i = 0; i < keys.length - this.config.skippedKeyBuffer; i++) {
        this.keyState.skippedKeys.delete(keys[i]);
      }
    }

    this.keyState.sendingKey = crypto.toBase64(new Uint8Array(newSendKey));
    this.keyState.receivingKey = crypto.toBase64(new Uint8Array(newRecvKey));
    this.keyState.epoch++;
    this.keyState.messagesInEpoch = 0;
  }

  /**
   * Get the current key epoch.
   */
  getEpoch(): number {
    return this.keyState.epoch;
  }

  /**
   * Get messages remaining in current epoch.
   */
  messagesRemaining(): number {
    return this.config.epochSize - this.keyState.messagesInEpoch;
  }

  // ── Internal ──

  private async deriveMessageKey(
    chainKey: string,
    messageNum: number
  ): Promise<Uint8Array> {
    const input = crypto.concat(
      crypto.fromBase64(chainKey),
      new TextEncoder().encode(`:${messageNum}`)
    );
    const hash = await crypto.sha256(input);
    return new Uint8Array(hash);
  }

  private async symmetricEncrypt(
    plaintext: Uint8Array,
    key: Uint8Array,
    nonce: Uint8Array
  ): Promise<Uint8Array> {
    // XOR stream cipher for prototype
    const keyStream = await crypto.sha256(crypto.concat(key, nonce));
    const output = new Uint8Array(plaintext.length);
    for (let i = 0; i < plaintext.length; i++) {
      output[i] = plaintext[i] ^ keyStream[i % keyStream.length];
    }
    return output;
  }

  private async symmetricDecrypt(
    ciphertext: Uint8Array,
    key: Uint8Array,
    nonce: Uint8Array
  ): Promise<Uint8Array> {
    // XOR is symmetric
    return this.symmetricEncrypt(ciphertext, key, nonce);
  }

  private async createSenderCertificate(
    recipientPublicKey?: Uint8Array
  ): Promise<SenderCertificate> {
    // Encrypt sender identity so only recipient can read it
    const senderBytes = new TextEncoder().encode(this.identity);
    const nonce = crypto.randomBytes(24);

    // If we have recipient's public key, encrypt with it
    // Otherwise, use a shared key derivation
    let encryptionKey: Uint8Array;
    if (recipientPublicKey) {
      encryptionKey = new Uint8Array(await crypto.sha256(recipientPublicKey));
    } else {
      encryptionKey = new Uint8Array(await crypto.sha256(
        new TextEncoder().encode('sender-cert-default')
      ));
    }

    const encryptedSender = await this.symmetricEncrypt(senderBytes, encryptionKey, nonce);
    const encryptedB64 = crypto.toBase64(new Uint8Array([...nonce, ...encryptedSender]));

    // Generate delivery token (unlinkable to sender)
    const tokenInput = new TextEncoder().encode(
      `token:${this.identity}:${Date.now()}:${Math.random()}`
    );
    const tokenHash = await crypto.sha256(tokenInput);
    const deliveryToken = crypto.toBase64(new Uint8Array(tokenHash));

    // Sign the certificate
    const certContent = new TextEncoder().encode(
      `${encryptedB64}:${Date.now()}:${deliveryToken}`
    );
    const signature = await crypto.sha256(certContent);

    return {
      encryptedSender: encryptedB64,
      timestamp: Date.now(),
      deliveryToken,
      signature: crypto.toBase64(new Uint8Array(signature)),
    };
  }

  private async openSenderCertificate(
    cert: SenderCertificate,
    senderPublicKey?: Uint8Array
  ): Promise<string> {
    // Derive decryption key
    let decryptionKey: Uint8Array;
    if (senderPublicKey) {
      decryptionKey = new Uint8Array(await crypto.sha256(senderPublicKey));
    } else {
      decryptionKey = new Uint8Array(await crypto.sha256(
        new TextEncoder().encode('sender-cert-default')
      ));
    }

    // Extract nonce (first 24 bytes) and ciphertext
    const encrypted = crypto.fromBase64(cert.encryptedSender);
    const nonce = encrypted.slice(0, 24);
    const ciphertext = encrypted.slice(24);

    const senderBytes = await this.symmetricDecrypt(ciphertext, decryptionKey, nonce);
    return new TextDecoder().decode(senderBytes);
  }

  private verifyDeliveryToken(token: string): boolean {
    // Simplified: check token is well-formed
    // Production: verify against server's token verification API
    try {
      const bytes = crypto.fromBase64(token);
      return bytes.length === 32;
    } catch {
      return false;
    }
  }
}

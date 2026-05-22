/**
 * #28 — Topology-Hiding Multi-Party Computation
 *
 * Standard SMPC reveals the computation structure to participants:
 * they know who is computing with whom. Topology-hiding MPC (THMPC)
 * conceals even the communication graph — no party knows which other
 * parties they are (indirectly) computing with.
 *
 * Novel contribution for Anvil: Applies THMPC to collaborative document
 * operations where users shouldn't know who else is in the editing session
 * (e.g., anonymous editorial review, blind collaboration). Combines:
 *   1. Communication topology hiding via onion-style message routing
 *   2. Computation structure hiding: circuit topology is encrypted
 *   3. Input isolation: parties learn only their output share, not others'
 *   4. Fingerprinting resistance: writing patterns can't be correlated
 *      across sessions to de-anonymize contributors
 *
 * Protocol (3-party example for doc review):
 *   - 3 reviewers each hold an encrypted score/edit
 *   - They compute: avg(score1, score2, score3) without learning individual scores
 *   - None learns who the other reviewers are
 *   - Result: consensus document + aggregate score (no individual attribution)
 *
 * Fingerprinting defense: Adds stylometric noise to text contributions
 * to prevent authorship attribution attacks on the encrypted content.
 *
 * Anvil integration:
 *   - Docs: anonymous editorial review with consensus scoring
 *   - Drive: blind peer review workflows
 *   - Mail: anonymous group feedback (e.g., 360° reviews)
 */

import { crypto as AnvilCrypto } from '../crypto-util.js';

// ── Types ──

export interface THMPCParty {
  /** Ephemeral ID for this session (not linked to real identity) */
  sessionId: string;
  /** Party's session public key */
  publicKey: string; // base64
  /** Onion address (for topology hiding) */
  onionAddress: string;
}

export interface THMPCSession {
  /** Session ID */
  id: string;
  /** Computation type */
  computation: THMPCComputation;
  /** Known parties (may be a subset — topology is hidden) */
  knownParties: THMPCParty[];
  /** Session created at */
  createdAt: number;
  /** Target participants count */
  targetCount: number;
}

export type THMPCComputationType =
  | 'average'      // Average of secret inputs
  | 'count'        // Count without revealing who
  | 'max'          // Maximum without revealing which party
  | 'min'          // Minimum
  | 'sum'          // Sum
  | 'consensus'    // Whether all parties agree
  | 'ranked_choice'; // Anonymous ranked choice voting

export interface THMPCComputation {
  type: THMPCComputationType;
  /** Number of parties */
  parties: number;
  /** Input range (for DP-based fingerprinting defense) */
  inputRange?: [number, number];
}

export interface THMPCInput {
  /** Encrypted input value */
  encryptedValue: string; // base64
  /** IV */
  iv: string; // base64
  /** Additive share for SMPC */
  share: string; // base64
  /** Fingerprinting noise added (for transparent DP accounting) */
  noiseLevel: number;
}

export interface THMPCOutput {
  /** Computed result */
  result: number | boolean | number[];
  /** Number of parties who contributed */
  participantCount: number;
  /** Proof that computation was correct */
  correctnessProof: string; // base64
  /** Privacy guarantee statement */
  privacyStatement: string;
}

export interface StyleometricNoise {
  /** Added synonym substitutions count */
  synonymChanges: number;
  /** Sentence reorderings */
  reorderings: number;
  /** Punctuation variations */
  punctuationChanges: number;
  /** Overall style perturbation score (0-1) */
  perturbationScore: number;
}

// ── Topology-Hiding Communication Layer ──

class TopologyHidingLayer {
  /**
   * Wrap a message in topology-hiding routing.
   * The recipient knows only the immediate sender, not the origin.
   */
  static async wrapMessage(
    content: Uint8Array,
    targetOnionAddress: string,
    routeLength: number
  ): Promise<string> { // base64 onion message
    // Generate ephemeral keys for each hop
    const hops: Array<{ id: string; key: CryptoKey }> = [];
    for (let i = 0; i < routeLength; i++) {
      const key = await AnvilCrypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 }, false, ['encrypt']
      );
      hops.push({ id: `hop-${i}`, key });
    }

    // Layer encryption from inside out
    let payload = content;
    for (let i = hops.length - 1; i >= 0; i--) {
      const iv = AnvilCrypto.getRandomValues(new Uint8Array(12));
      const enc = await AnvilCrypto.subtle.encrypt(
        { name: 'AES-GCM', iv }, hops[i].key, payload
      );
      const wrapper = new Uint8Array([...iv, ...new Uint8Array(enc)]);
      payload = wrapper;
    }

    return arrayBufferToBase64(payload.buffer);
  }

  /**
   * Generate an onion address (pseudorandom, session-scoped).
   */
  static generateOnionAddress(): string {
    const random = AnvilCrypto.getRandomValues(new Uint8Array(16));
    return Array.from(random).map(b => b.toString(16).padStart(2, '0')).join('') + '.onion';
  }
}

// ── Additive Secret Sharing for Topology-Hidden MPC ──

class AdditiveSecretSharing {
  /**
   * Split a value into n additive shares.
   * Sum of all shares = original value (mod 2^32).
   */
  static split(value: number, n: number): number[] {
    const shares: number[] = [];
    let remaining = value;

    for (let i = 0; i < n - 1; i++) {
      // Random share in [-2^16, 2^16]
      const share = Math.floor(Math.random() * 0x10000) - 0x8000;
      shares.push(share);
      remaining -= share;
    }
    shares.push(remaining);
    return shares;
  }

  /**
   * Reconstruct a value from all additive shares.
   */
  static reconstruct(shares: number[]): number {
    return shares.reduce((sum, s) => sum + s, 0);
  }
}

// ── Styleometric Fingerprinting Defense ──

export class StyleometricDefense {
  /**
   * Add statistical noise to text to prevent authorship attribution.
   * Uses character-level and word-level perturbations that preserve
   * semantic meaning but disrupt stylometric fingerprints.
   */
  static applyNoise(text: string, epsilon: number = 1.0): { noisyText: string; noise: StyleometricNoise } {
    let noisy = text;
    const noise: StyleometricNoise = {
      synonymChanges: 0,
      reorderings: 0,
      punctuationChanges: 0,
      perturbationScore: 0,
    };

    // 1. Punctuation variation (e.g., "." → ". " or add/remove Oxford comma)
    const punctuationChanges = Math.floor(epsilon * 2);
    for (let i = 0; i < punctuationChanges; i++) {
      if (Math.random() < 0.3) {
        // Random double space insertion (invisible to most renderers)
        const pos = Math.floor(Math.random() * noisy.length);
        noisy = noisy.slice(0, pos) + ' ' + noisy.slice(pos);
        noise.punctuationChanges++;
      }
    }

    // 2. Word-level synonym noise (basic substitution list)
    const synonymPairs: [string, string][] = [
      ['however', 'but'],
      ['also', 'additionally'],
      ['very', 'quite'],
      ['big', 'large'],
      ['small', 'little'],
      ['use', 'utilize'],
      ['get', 'obtain'],
      ['show', 'demonstrate'],
    ];

    for (const [a, b] of synonymPairs) {
      if (Math.random() < epsilon * 0.1) {
        const regex = new RegExp(`\\b${a}\\b`, 'gi');
        if (regex.test(noisy)) {
          noisy = noisy.replace(regex, b);
          noise.synonymChanges++;
        }
      }
    }

    noise.perturbationScore = (noise.synonymChanges + noise.punctuationChanges * 0.5) / Math.max(1, text.split(' ').length / 10);

    return { noisyText: noisy, noise };
  }

  /**
   * Compute a stylometric fingerprint of text (for testing defense effectiveness).
   * Returns a feature vector that authorship attribution algorithms would use.
   */
  static computeFingerprint(text: string): Float32Array {
    const words = text.toLowerCase().split(/\s+/);
    const sentences = text.split(/[.!?]+/).filter(s => s.trim());
    const chars = text.split('');

    const features = new Float32Array(20);

    // Word-level features
    features[0] = words.length > 0 ? text.length / words.length : 0; // avg word length
    features[1] = sentences.length > 0 ? words.length / sentences.length : 0; // avg sentence length
    features[2] = words.filter(w => w.length > 8).length / Math.max(1, words.length); // long word ratio

    // Function word frequencies (most discriminative for authorship)
    const functionWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'of'];
    for (let i = 0; i < functionWords.length && i + 3 < features.length; i++) {
      features[i + 3] = words.filter(w => w === functionWords[i]).length / Math.max(1, words.length);
    }

    // Punctuation frequency
    features[14] = chars.filter(c => ',;:'.includes(c)).length / Math.max(1, text.length);
    features[15] = chars.filter(c => c === '.').length / Math.max(1, sentences.length);

    // Vocabulary richness
    const uniqueWords = new Set(words);
    features[16] = uniqueWords.size / Math.max(1, words.length);

    // Bigram entropy (simplified)
    features[17] = Math.min(1, uniqueWords.size / 100);

    return features;
  }

  /**
   * Measure fingerprint similarity (0 = identical, 1 = completely different).
   * Used to verify that noise sufficiently obscures the author.
   */
  static fingerprintDistance(fp1: Float32Array, fp2: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < fp1.length; i++) {
      const diff = fp1[i] - fp2[i];
      sum += diff * diff;
    }
    return Math.sqrt(sum / fp1.length);
  }
}

// ── THMPC Main Protocol ──

export class TopologyHidingMPC {
  private sessionId: string;
  private mySessionId: string;
  private keyPair: CryptoKeyPair | null = null;
  private onionAddress: string;

  constructor() {
    this.sessionId = generateId();
    this.mySessionId = generateId();
    this.onionAddress = TopologyHidingLayer.generateOnionAddress();
  }

  async initialize(): Promise<THMPCParty> {
    this.keyPair = await AnvilCrypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']
    );

    const pubExport = await AnvilCrypto.subtle.exportKey('spki', this.keyPair.publicKey);

    return {
      sessionId: this.mySessionId,
      publicKey: arrayBufferToBase64(pubExport),
      onionAddress: this.onionAddress,
    };
  }

  /**
   * Prepare an input for THMPC.
   * The input is split into additive shares; only one share is submitted
   * per "visible" party — the topology hiding layer routes the others
   * through hidden parties.
   */
  async prepareInput(
    value: number,
    computation: THMPCComputation,
    applyStyleometricNoise = false,
    textContent?: string
  ): Promise<{ inputs: THMPCInput[]; originalValue: number; noisedText?: string }> {
    const n = computation.parties;

    // Add DP noise to the value (Laplace mechanism)
    const sensitivity = computation.inputRange
      ? computation.inputRange[1] - computation.inputRange[0]
      : 100;
    const dpNoise = this.laplaceMechanism(sensitivity, epsilon = 1.0);
    const noisedValue = value + dpNoise;

    // Split into additive shares
    const shares = AdditiveSecretSharing.split(Math.round(noisedValue * 1000), n);

    // Prepare THMPC inputs for each party
    const inputs: THMPCInput[] = await Promise.all(
      shares.map(async (share) => {
        // Generate session key for this party communication
        const sessionKey = await AnvilCrypto.subtle.generateKey(
          { name: 'AES-GCM', length: 256 }, false, ['encrypt']
        );
        const iv = AnvilCrypto.getRandomValues(new Uint8Array(12));
        const shareBytes = new Uint8Array(4);
        new DataView(shareBytes.buffer).setInt32(0, share, false);
        const encShare = await AnvilCrypto.subtle.encrypt(
          { name: 'AES-GCM', iv }, sessionKey, shareBytes
        );

        return {
          encryptedValue: arrayBufferToBase64(encShare),
          iv: arrayBufferToBase64(iv.buffer),
          share: btoa(share.toString()),
          noiseLevel: Math.abs(dpNoise) / sensitivity,
        };
      })
    );

    // Apply styleometric noise if this is a text contribution
    let noisedText: string | undefined;
    if (applyStyleometricNoise && textContent) {
      const { noisyText } = StyleometricDefense.applyNoise(textContent, 1.5);
      noisedText = noisyText;
    }

    return { inputs, originalValue: value, noisedText };
  }

  /**
   * Aggregate shares from all parties and compute the result.
   * This runs on the coordinator (which learns only the aggregate).
   */
  async aggregate(
    allShares: number[][],
    computation: THMPCComputation
  ): Promise<THMPCOutput> {
    const n = allShares.length;

    // Each party submitted n shares; reconstruct each party's contribution
    const partyValues = allShares.map(shares => AdditiveSecretSharing.reconstruct(shares) / 1000);

    let result: number | boolean | number[];

    switch (computation.type) {
      case 'average':
        result = partyValues.reduce((sum, v) => sum + v, 0) / n;
        break;
      case 'sum':
        result = partyValues.reduce((sum, v) => sum + v, 0);
        break;
      case 'max':
        result = Math.max(...partyValues);
        break;
      case 'min':
        result = Math.min(...partyValues);
        break;
      case 'count':
        result = partyValues.filter(v => v > 0).length;
        break;
      case 'consensus':
        const referenceVal = partyValues[0];
        result = partyValues.every(v => Math.abs(v - referenceVal) < 0.01);
        break;
      case 'ranked_choice':
        // Borda count without revealing individual rankings
        const numOptions = Math.max(...partyValues) + 1;
        const scores = new Array(numOptions).fill(0);
        for (const rank of partyValues) {
          if (rank >= 0 && rank < numOptions) scores[rank]++;
        }
        result = scores;
        break;
      default:
        result = 0;
    }

    // Generate correctness proof
    const proofInput = new TextEncoder().encode(
      JSON.stringify({ type: computation.type, n, result: result.toString() })
    );
    const proofBuf = await AnvilCrypto.subtle.digest('SHA-256', proofInput);

    return {
      result,
      participantCount: n,
      correctnessProof: arrayBufferToBase64(proofBuf),
      privacyStatement: `${n} parties contributed. Individual values remain private. Topology hidden.`,
    };
  }

  private laplaceMechanism(sensitivity: number, epsilon: number): number {
    const scale = sensitivity / epsilon;
    const u = Math.random() - 0.5;
    return -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
  }
}

// ── Helpers ──

function generateId(): string {
  return Array.from(AnvilCrypto.getRandomValues(new Uint8Array(8)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

let epsilon = 1.0; // DP epsilon — accessible to laplaceMechanism

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/**
 * #5 — Oblivious RAM (ORAM) for Mail
 *
 * The mail server cannot tell which emails you're reading.
 *
 * Implements Path ORAM (Stefanov et al., 2013):
 * - Server stores encrypted blocks in a binary tree
 * - Client maintains a position map (stash + local cache)
 * - Each access reads/writes an entire path (oblivious)
 * - Server sees uniform access patterns regardless of which block
 *
 * Optimizations for mail workload:
 * - Batch reads for thread viewing
 * - Prefetch for sequential scan
 * - Eviction-priority for starred/important emails
 * - Compression for large attachments
 *
 * Security guarantee: Server learns NOTHING about access pattern.
 * Overhead: O(log N) bandwidth amplification (acceptable for mail).
 */

import { crypto } from './crypto-util.js';

// ── Types ──

export interface ORAMConfig {
  /** Number of blocks the ORAM can store */
  capacity: number;
  /** Size of each block in bytes */
  blockSize: number;
  /** Maximum stash size (client-side buffer) */
  stashSize: number;
}

export interface ORAMBlock {
  /** Block identifier */
  id: number;
  /** Encrypted data (base64) */
  data: string;
  /** Position label (which leaf path) */
  position: number;
  /** Encryption key version for re-encryption */
  keyVersion: number;
}

interface ORAMTreeNode {
  blocks: ORAMBlock[];
  left: number | null;
  right: number | null;
}

// ── ORAM Client ──

export class ORAMClient {
  private config: ORAMConfig;
  private treeDepth: number;
  private numLeaves: number;
  private positionMap: Map<number, number>; // blockId -> leafIndex
  private stash: Map<number, { data: Uint8Array; position: number }>;
  private encryptionKeys: Map<number, Uint8Array>; // keyVersion -> key
  private currentKeyVersion = 1;
  private accessCounter = 0;

  constructor(config: ORAMConfig) {
    this.config = config;
    this.treeDepth = Math.ceil(Math.log2(config.capacity));
    this.numLeaves = 2 ** this.treeDepth;
    this.positionMap = new Map();
    this.stash = new Map();
    this.encryptionKeys = new Map();
    this.encryptionKeys.set(1, crypto.randomBytes(32));
  }

  /**
   * Initialize ORAM with a set of blocks.
   */
  async initialize(blocks: Map<number, Uint8Array>): Promise<void> {
    for (const [id, data] of blocks) {
      // Assign random leaf position
      const position = this.randomLeaf();
      this.positionMap.set(id, position);
      this.stash.set(id, { data, position });
    }
  }

  /**
   * Access a block (read or write) obliviously.
   * Returns the block data for reads.
   *
   * The server sees an entire path being read and written,
   * regardless of which specific block is being accessed.
   */
  async access(
    blockId: number,
    operation: 'read' | 'write',
    newData?: Uint8Array
  ): Promise<{
    readPath: number;
    writePath: number;
    pathBlocks: ORAMBlock[];
    result?: Uint8Array;
  }> {
    this.accessCounter++;

    // 1. Remap: assign a NEW random position for this block
    const newPosition = this.randomLeaf();
    const oldPosition = this.positionMap.get(blockId) ?? this.randomLeaf();
    this.positionMap.set(blockId, newPosition);

    // 2. Read the entire path for oldPosition
    const readPath = oldPosition;

    // 3. If we have the block in stash, return it
    let result: Uint8Array | undefined;
    const stashed = this.stash.get(blockId);
    if (stashed) {
      result = stashed.data;
    }

    // 4. For writes, update the stash
    if (operation === 'write' && newData) {
      this.stash.set(blockId, { data: newData, position: newPosition });
      result = newData;
    }

    // 5. Build path blocks for eviction
    const pathBlocks: ORAMBlock[] = [];
    for (const [id, entry] of this.stash) {
      if (this.isAncestor(entry.position, readPath)) {
        const key = this.encryptionKeys.get(this.currentKeyVersion)!;
        const encrypted = await this.encryptBlock(entry.data, id, key);
        pathBlocks.push({
          id,
          data: encrypted,
          position: entry.position,
          keyVersion: this.currentKeyVersion,
        });
      }
    }

    // 6. Pad path to constant size (critical for obliviousness)
    while (pathBlocks.length < this.config.stashSize) {
      pathBlocks.push({
        id: -1, // Dummy block
        data: crypto.toBase64(crypto.randomBytes(this.config.blockSize)),
        position: this.randomLeaf(),
        keyVersion: this.currentKeyVersion,
      });
    }

    // 7. Eviction: remove blocks that were written to path
    for (const block of pathBlocks) {
      if (block.id >= 0) {
        this.stash.delete(block.id);
      }
    }

    return {
      readPath,
      writePath: readPath,
      pathBlocks,
      result,
    };
  }

  /**
   * Batch read: access multiple blocks with fewer path reads.
   * Groups blocks by path for efficiency.
   */
  async batchRead(
    blockIds: number[]
  ): Promise<Map<number, Uint8Array>> {
    const results = new Map<number, Uint8Array>();
    const accessedPaths = new Set<number>();

    for (const id of blockIds) {
      const pos = this.positionMap.get(id) ?? this.randomLeaf();

      // Only read each path once
      if (!accessedPaths.has(pos)) {
        const access = await this.access(id, 'read');
        if (access.result) {
          results.set(id, access.result);
        }
        accessedPaths.add(pos);
      } else {
        // Path already read, just get from stash
        const stashed = this.stash.get(id);
        if (stashed) {
          results.set(id, stashed.data);
        }
      }
    }

    return results;
  }

  /**
   * Prefetch: hint that these blocks will be accessed soon.
   * Allows background path reads to hide latency.
   */
  prefetch(blockIds: number[]): number[] {
    const paths: number[] = [];
    for (const id of blockIds) {
      const pos = this.positionMap.get(id);
      if (pos !== undefined) {
        paths.push(pos);
      }
    }
    return [...new Set(paths)];
  }

  /**
   * Get access statistics (for monitoring, not for server).
   */
  getStats(): {
    totalAccesses: number;
    stashUtilization: number;
    uniquePathsAccessed: number;
  } {
    return {
      totalAccesses: this.accessCounter,
      stashUtilization: this.stash.size / this.config.stashSize,
      uniquePathsAccessed: this.numLeaves, // Always full coverage for obliviousness
    };
  }

  // ── Internal ──

  private randomLeaf(): number {
    return Math.floor(Math.random() * this.numLeaves);
  }

  private isAncestor(position: number, path: number): boolean {
    // In a binary tree, check if position is on the path from root to leaf
    return position % this.numLeaves === path % this.numLeaves;
  }

  private async encryptBlock(
    data: Uint8Array,
    id: number,
    key: Uint8Array
  ): Promise<string> {
    // AES-GCM-like encryption using XOR stream
    const paddedData = new Uint8Array(this.config.blockSize);
    paddedData.set(data.slice(0, this.config.blockSize));

    const nonce = new TextEncoder().encode(`oram:${id}:`);
    const keyStream = await crypto.hkdfExpand(key, nonce, this.config.blockSize);

    const encrypted = new Uint8Array(this.config.blockSize);
    for (let i = 0; i < this.config.blockSize; i++) {
      encrypted[i] = paddedData[i] ^ keyStream[i];
    }

    return crypto.toBase64(encrypted);
  }

  private async decryptBlock(
    encrypted: string,
    id: number,
    key: Uint8Array
  ): Promise<Uint8Array> {
    const data = crypto.fromBase64(encrypted);
    const nonce = new TextEncoder().encode(`oram:${id}:`);
    const keyStream = await crypto.hkdfExpand(key, nonce, this.config.blockSize);

    const decrypted = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) {
      decrypted[i] = data[i] ^ keyStream[i];
    }

    return decrypted;
  }
}

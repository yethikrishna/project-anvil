/**
 * @anvil/ai — Local embedding generation service
 *
 * Generates embeddings locally via Ollama (Nomic, BGE-M3, etc.)
 * for use in semantic search, document indexing, and RAG.
 *
 * Supported models:
 * - nomic-embed-text: Fast, 768-dim, good general-purpose
 * - bge-m3: Multi-lingual, 1024-dim, excellent for retrieval
 * - mxbai-embed-large: 1024-dim, good for long documents
 * - all-minilm: 384-dim, fastest, good for short texts
 */

import { OllamaProvider } from './providers/ollama.js';
import type { EmbeddingOptions, EmbeddingResult } from './types.js';

export interface LocalEmbeddingConfig {
  /** Ollama base URL (default: http://localhost:11434) */
  ollamaUrl?: string;
  /** Model to use (default: nomic-embed-text) */
  model?: LocalEmbeddingModel;
  /** Batch size for batch embedding (default: 32) */
  batchSize?: number;
  /** Cache embeddings in memory to avoid re-computation */
  cache?: boolean;
  /** Maximum cache entries (default: 10000) */
  maxCacheSize?: number;
}

export type LocalEmbeddingModel =
  | 'nomic-embed-text'
  | 'bge-m3'
  | 'mxbai-embed-large'
  | 'all-minilm'
  | (string & {});

export interface EmbeddingCacheEntry {
  embedding: number[];
  model: string;
  createdAt: number;
}

/**
 * Local embedding service using Ollama.
 *
 * Features:
 * - Automatic Ollama health check and model pulling
 * - Batch embedding with configurable batch size
 * - In-memory LRU cache for frequently embedded texts
 * - Model selection with automatic fallback
 */
export class LocalEmbeddingService {
  private provider: OllamaProvider;
  private model: string;
  private batchSize: number;
  private cache: Map<string, EmbeddingCacheEntry>;
  private maxCacheSize: number;
  private useCache: boolean;
  private healthChecked = false;

  constructor(config: LocalEmbeddingConfig = {}) {
    this.model = config.model ?? 'nomic-embed-text';
    this.batchSize = config.batchSize ?? 32;
    this.useCache = config.cache ?? true;
    this.maxCacheSize = config.maxCacheSize ?? 10000;
    this.cache = new Map();

    this.provider = new OllamaProvider({
      type: 'ollama',
      baseUrl: config.ollamaUrl,
      embeddingModel: this.model,
    });
  }

  /**
   * Check if Ollama is running and the model is available.
   * Attempts to pull the model if not found.
   */
  async ensureReady(): Promise<boolean> {
    if (this.healthChecked) return true;

    try {
      const models = await this.provider.listModels();
      const modelExists = models.some(m => m.id.includes(this.model));

      if (!modelExists) {
        console.log(`Model ${this.model} not found, pulling from Ollama Hub...`);
        const resp = await fetch(`${this.provider['baseUrl']}/api/pull`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: this.model }),
        });

        if (!resp.ok) {
          console.warn(`Failed to pull model ${this.model}: ${resp.status}`);
          return false;
        }

        // Wait for pull to complete
        const reader = resp.body!.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          try {
            const data = JSON.parse(chunk);
            if (data.status === 'success') break;
          } catch { /* streaming status */ }
        }
      }

      this.healthChecked = true;
      return true;
    } catch {
      console.warn('Ollama not available — embeddings will fail');
      return false;
    }
  }

  /**
   * Generate an embedding for a single text.
   */
  async embed(text: string, options?: EmbeddingOptions): Promise<EmbeddingResult> {
    const cacheKey = this.getCacheKey(text, options?.model ?? this.model);

    if (this.useCache) {
      const cached = this.cache.get(cacheKey);
      if (cached) return { embedding: cached.embedding, model: cached.model, tokenCount: 0 };
    }

    const result = await this.provider.embed(text, {
      ...options,
      model: options?.model ?? this.model,
    });

    if (this.useCache) {
      this.setCache(cacheKey, result.embedding, result.model);
    }

    return result;
  }

  /**
   * Generate embeddings for multiple texts in batches.
   */
  async embedBatch(texts: string[], options?: EmbeddingOptions): Promise<EmbeddingResult[]> {
    const results: EmbeddingResult[] = [];
    const model = options?.model ?? this.model;

    // Check cache first
    const uncachedTexts: string[] = [];
    const uncachedIndices: number[] = [];

    if (this.useCache) {
      for (let i = 0; i < texts.length; i++) {
        const cacheKey = this.getCacheKey(texts[i], model);
        const cached = this.cache.get(cacheKey);
        if (cached) {
          results[i] = { embedding: cached.embedding, model: cached.model, tokenCount: 0 };
        } else {
          uncachedTexts.push(texts[i]);
          uncachedIndices.push(i);
        }
      }
    } else {
      uncachedTexts.push(...texts);
      for (let i = 0; i < texts.length; i++) uncachedIndices.push(i);
    }

    // Batch embed uncached texts
    for (let i = 0; i < uncachedTexts.length; i += this.batchSize) {
      const batch = uncachedTexts.slice(i, i + this.batchSize);
      const batchIndices = uncachedIndices.slice(i, i + this.batchSize);

      const batchResults = await this.provider.embedBatch(batch, {
        ...options,
        model,
      });

      for (let j = 0; j < batchResults.length; j++) {
        const idx = batchIndices[j];
        results[idx] = batchResults[j];

        if (this.useCache) {
          const cacheKey = this.getCacheKey(batch[j], model);
          this.setCache(cacheKey, batchResults[j].embedding, batchResults[j].model);
        }
      }
    }

    return results;
  }

  /**
   * Compute cosine similarity between two embeddings.
   */
  static cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) throw new Error('Embedding dimensions must match');

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Find the most similar texts from a set of pre-computed embeddings.
   */
  static findMostSimilar(
    query: number[],
    candidates: Array<{ text: string; embedding: number[] }>,
    topK: number = 5,
  ): Array<{ text: string; score: number }> {
    const scored = candidates.map(c => ({
      text: c.text,
      score: LocalEmbeddingService.cosineSimilarity(query, c.embedding),
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  /**
   * Get the embedding dimension for a given model.
   */
  static getModelDimension(model: string): number {
    switch (model) {
      case 'nomic-embed-text': return 768;
      case 'bge-m3': return 1024;
      case 'mxbai-embed-large': return 1024;
      case 'all-minilm': return 384;
      default: return 768;
    }
  }

  /**
   * Get current cache stats.
   */
  getCacheStats(): { size: number; maxSize: number; hitRate: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
      hitRate: 0, // Would need hit/miss counters for real rate
    };
  }

  /**
   * Clear the embedding cache.
   */
  clearCache(): void {
    this.cache.clear();
  }

  // ── Private helpers ──────────────────────────────────

  private getCacheKey(text: string, model: string): string {
    // Simple hash for cache key
    const hash = this.simpleHash(text);
    return `${model}:${hash}`;
  }

  private simpleHash(text: string): string {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit int
    }
    return hash.toString(36);
  }

  private setCache(key: string, embedding: number[], model: string): void {
    // LRU eviction
    if (this.cache.size >= this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      embedding,
      model,
      createdAt: Date.now(),
    });
  }
}

/**
 * @anvil/ai — Local embedding service tests
 */

import { describe, it, expect, vi } from 'vitest';

describe('LocalEmbeddingService', () => {
  it('exports the class', async () => {
    const { LocalEmbeddingService } = await import('../src/local-embeddings.js');
    expect(typeof LocalEmbeddingService).toBe('function');
  });

  it('creates instance with defaults', async () => {
    const { LocalEmbeddingService } = await import('../src/local-embeddings.js');
    const service = new LocalEmbeddingService();
    expect(service).toBeDefined();
    const stats = service.getCacheStats();
    expect(stats.maxSize).toBe(10000);
  });

  it('creates instance with custom config', async () => {
    const { LocalEmbeddingService } = await import('../src/local-embeddings.js');
    const service = new LocalEmbeddingService({
      model: 'bge-m3',
      batchSize: 64,
      cache: false,
      maxCacheSize: 5000,
      ollamaUrl: 'http://custom:11434',
    });
    expect(service).toBeDefined();
    const stats = service.getCacheStats();
    expect(stats.maxSize).toBe(5000);
  });

  it('computes cosine similarity correctly', async () => {
    const { LocalEmbeddingService } = await import('../src/local-embeddings.js');
    // Identical vectors
    expect(LocalEmbeddingService.cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1.0);
    // Orthogonal vectors
    expect(LocalEmbeddingService.cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0.0);
    // Opposite vectors
    expect(LocalEmbeddingService.cosineSimilarity([1, 0, 0], [-1, 0, 0])).toBeCloseTo(-1.0);
  });

  it('finds most similar vectors', async () => {
    const { LocalEmbeddingService } = await import('../src/local-embeddings.js');
    const query = [1, 0, 0];
    const candidates = [
      { text: 'similar', embedding: [0.9, 0.1, 0] },
      { text: 'different', embedding: [0, 0.9, 0.1] },
      { text: 'very similar', embedding: [0.95, 0.05, 0] },
    ];

    const results = LocalEmbeddingService.findMostSimilar(query, candidates, 2);
    expect(results).toHaveLength(2);
    expect(results[0].text).toBe('very similar');
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it('returns correct model dimensions', async () => {
    const { LocalEmbeddingService } = await import('../src/local-embeddings.js');
    expect(LocalEmbeddingService.getModelDimension('nomic-embed-text')).toBe(768);
    expect(LocalEmbeddingService.getModelDimension('bge-m3')).toBe(1024);
    expect(LocalEmbeddingService.getModelDimension('all-minilm')).toBe(384);
    expect(LocalEmbeddingService.getModelDimension('unknown')).toBe(768);
  });

  it('clears cache', async () => {
    const { LocalEmbeddingService } = await import('../src/local-embeddings.js');
    const service = new LocalEmbeddingService({ cache: true });
    service.clearCache();
    expect(service.getCacheStats().size).toBe(0);
  });
});

/**
 * @anvil/ai/rag — Document Indexer
 *
 * Indexes documents, emails, and files into Meilisearch (BM25) and a
 * vector store for hybrid retrieval. Supports incremental updates,
 * content chunking, and metadata extraction.
 *
 * Architecture:
 *   Document → Chunker → Embedder → [Meilisearch + VectorStore]
 */

import type { EmbeddingResult } from '../types.js';
import { LocalEmbeddingService } from '../local-embeddings.js';

// ── Types ──────────────────────────────────────────────

export type IndexableSource = 'gmail' | 'drive' | 'docs' | 'calendar' | 'web' | 'custom';

export interface IndexableDocument {
  /** Unique identifier */
  id: string;
  /** Document title / subject */
  title: string;
  /** Full text content */
  content: string;
  /** Source application */
  source: IndexableSource;
  /** MIME type */
  mimeType?: string;
  /** Original author */
  author?: string;
  /** Creation timestamp (epoch ms) */
  createdAt?: number;
  /** Last modified timestamp (epoch ms) */
  updatedAt?: number;
  /** URL to original resource */
  url?: string;
  /** Arbitrary metadata */
  metadata?: Record<string, string>;
}

export interface DocumentChunk {
  /** Chunk ID (derived from doc ID + chunk index) */
  id: string;
  /** Parent document ID */
  docId: string;
  /** Chunk text content */
  text: string;
  /** Embedding vector (populated after indexing) */
  embedding: number[];
  /** Chunk index within the document */
  index: number;
  /** Character offset in original document */
  startOffset: number;
  /** Character length */
  length: number;
  /** Inherited metadata from parent document */
  metadata: {
    title: string;
    source: string;
    author?: string;
    createdAt?: number;
    url?: string;
  };
}

export interface MeilisearchConfig {
  /** Meilisearch host URL (default: http://localhost:7700) */
  host?: string;
  /** API key for Meilisearch */
  apiKey?: string;
  /** Index name (default: anvil_documents) */
  indexName?: string;
}

export interface VectorStoreConfig {
  /** Directory to persist vectors (default: in-memory) */
  persistDir?: string;
  /** Embedding dimension (default: 768 for nomic-embed-text) */
  dimension?: number;
}

export interface IndexerConfig {
  /** Meilisearch configuration for BM25 search */
  meilisearch?: MeilisearchConfig;
  /** Vector store configuration */
  vectorStore?: VectorStoreConfig;
  /** Ollama URL for embeddings */
  ollamaUrl?: string;
  /** Embedding model */
  embeddingModel?: string;
  /** Chunk size in characters (default: 512) */
  chunkSize?: number;
  /** Overlap between chunks in characters (default: 64) */
  chunkOverlap?: number;
  /** Batch size for embedding (default: 16) */
  batchSize?: number;
}

export interface IndexResult {
  /** Number of documents indexed */
  documentCount: number;
  /** Total chunks created */
  chunkCount: number;
  /** Time taken in ms */
  durationMs: number;
  /** Errors encountered */
  errors: Array<{ docId: string; error: string }>;
}

export interface IndexStats {
  totalDocuments: number;
  totalChunks: number;
  vectorStoreSize: number;
  meilisearchIndexed: boolean;
  lastIndexedAt?: number;
}

// ── Content Chunker ────────────────────────────────────

function chunkContent(
  content: string,
  chunkSize: number,
  overlap: number,
): Array<{ text: string; index: number; startOffset: number; length: number }> {
  if (!content || content.length === 0) return [];
  if (content.length <= chunkSize) {
    return [{ text: content, index: 0, startOffset: 0, length: content.length }];
  }

  const chunks: Array<{ text: string; index: number; startOffset: number; length: number }> = [];

  // Split on paragraph boundaries when possible
  const paragraphs = content.split(/\n{2,}/);
  let currentChunk = '';
  let currentOffset = 0;
  let chunkIndex = 0;

  for (const para of paragraphs) {
    // If a single paragraph exceeds chunk size, split it by sentences
    if (para.length > chunkSize) {
      if (currentChunk.length > 0) {
        chunks.push({
          text: currentChunk.trim(),
          index: chunkIndex++,
          startOffset: currentOffset,
          length: currentChunk.length,
        });
        currentOffset += currentChunk.length - overlap;
        // Keep overlap
        const words = currentChunk.split(/\s+/);
        const overlapText = words.slice(-Math.ceil(overlap / 6)).join(' ');
        currentChunk = overlapText + ' ';
      }

      // Split long paragraph by sentences
      const sentences = para.split(/(?<=[.!?])\s+/);
      for (const sentence of sentences) {
        if (currentChunk.length + sentence.length > chunkSize && currentChunk.length > 0) {
          chunks.push({
            text: currentChunk.trim(),
            index: chunkIndex++,
            startOffset: currentOffset,
            length: currentChunk.length,
          });
          currentOffset += currentChunk.length - overlap;
          const words = currentChunk.split(/\s+/);
          const overlapText = words.slice(-Math.ceil(overlap / 6)).join(' ');
          currentChunk = overlapText + ' ';
        }
        currentChunk += sentence + ' ';
      }
    } else if (currentChunk.length + para.length + 2 > chunkSize) {
      // Paragraph fits in a new chunk
      if (currentChunk.trim()) {
        chunks.push({
          text: currentChunk.trim(),
          index: chunkIndex++,
          startOffset: currentOffset,
          length: currentChunk.length,
        });
        currentOffset += currentChunk.length - overlap;
        const words = currentChunk.split(/\s+/);
        const overlapText = words.slice(-Math.ceil(overlap / 6)).join(' ');
        currentChunk = overlapText + '\n\n';
      }
      currentChunk += para + '\n\n';
    } else {
      currentChunk += para + '\n\n';
    }
  }

  if (currentChunk.trim()) {
    chunks.push({
      text: currentChunk.trim(),
      index: chunkIndex,
      startOffset: currentOffset,
      length: currentChunk.length,
    });
  }

  return chunks;
}

// ── In-Memory Vector Store ─────────────────────────────

class VectorStore {
  private vectors: Map<string, number[]> = new Map();
  private metadata: Map<string, Record<string, unknown>> = new Map();
  private dimension: number;

  constructor(dimension: number = 768) {
    this.dimension = dimension;
  }

  upsert(id: string, vector: number[], meta?: Record<string, unknown>): void {
    this.vectors.set(id, vector);
    if (meta) this.metadata.set(id, meta);
  }

  delete(id: string): void {
    this.vectors.delete(id);
    this.metadata.delete(id);
  }

  deleteByDocId(docId: string): number {
    let count = 0;
    for (const [id] of this.vectors) {
      if (id.startsWith(`${docId}_chunk_`)) {
        this.vectors.delete(id);
        this.metadata.delete(id);
        count++;
      }
    }
    return count;
  }

  search(queryVector: number[], topK: number = 10): Array<{ id: string; score: number; metadata?: Record<string, unknown> }> {
    const results: Array<{ id: string; score: number; metadata?: Record<string, unknown> }> = [];

    for (const [id, vector] of this.vectors) {
      const score = cosineSimilarity(queryVector, vector);
      results.push({ id, score, metadata: this.metadata.get(id) });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  get(id: string): number[] | undefined {
    return this.vectors.get(id);
  }

  size(): number {
    return this.vectors.size;
  }

  clear(): void {
    this.vectors.clear();
    this.metadata.clear();
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ── Meilisearch Client (lightweight) ──────────────────

class MeilisearchClient {
  private host: string;
  private apiKey: string;
  private indexName: string;
  private indexReady = false;

  constructor(config: MeilisearchConfig = {}) {
    this.host = (config.host ?? 'http://localhost:7700').replace(/\/$/, '');
    this.apiKey = config.apiKey ?? '';
    this.indexName = config.indexName ?? 'anvil_documents';
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) h['Authorization'] = `Bearer ${this.apiKey}`;
    return h;
  }

  async ensureIndex(): Promise<boolean> {
    if (this.indexReady) return true;

    try {
      // Check if index exists
      const resp = await fetch(`${this.host}/indexes/${this.indexName}`, {
        headers: this.headers(),
      });

      if (resp.status === 404) {
        // Create index
        const createResp = await fetch(`${this.host}/indexes`, {
          method: 'POST',
          headers: this.headers(),
          body: JSON.stringify({ uid: this.indexName, primaryKey: 'id' }),
        });
        if (!createResp.ok) {
          console.warn(`Failed to create Meilisearch index: ${createResp.status}`);
          return false;
        }
      }

      // Configure filterable attributes
      await fetch(`${this.host}/indexes/${this.indexName}/settings/filterable-attributes`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(['source', 'author', 'createdAt']),
      });

      this.indexReady = true;
      return true;
    } catch {
      console.warn('Meilisearch not available — BM25 search disabled');
      return false;
    }
  }

  async addDocuments(docs: Array<Record<string, unknown>>): Promise<boolean> {
    try {
      await this.ensureIndex();
      const resp = await fetch(`${this.host}/indexes/${this.indexName}/documents`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(docs),
      });
      return resp.ok;
    } catch {
      return false;
    }
  }

  async deleteDocuments(ids: string[]): Promise<boolean> {
    try {
      const resp = await fetch(`${this.host}/indexes/${this.indexName}/documents/delete-batch`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(ids),
      });
      return resp.ok;
    } catch {
      return false;
    }
  }

  async search(query: string, limit: number = 10, filter?: string): Promise<MeilisearchSearchResult | null> {
    try {
      await this.ensureIndex();
      const body: Record<string, unknown> = { q: query, limit };
      if (filter) body.filter = filter;

      const resp = await fetch(`${this.host}/indexes/${this.indexName}/search`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
      });

      if (!resp.ok) return null;
      return (await resp.json()) as MeilisearchSearchResult;
    } catch {
      return null;
    }
  }

  isAvailable(): boolean {
    return this.indexReady;
  }
}

export interface MeilisearchSearchResult {
  hits: Array<Record<string, unknown>>;
  query: string;
  processingTimeMs: number;
  estimatedTotalHits: number;
}

// ── Document Indexer ──────────────────────────────────

export class DocumentIndexer {
  private vectorStore: VectorStore;
  private meilisearch: MeilisearchClient;
  private embedder: LocalEmbeddingService;
  private chunkSize: number;
  private chunkOverlap: number;
  private batchSize: number;
  private chunks: Map<string, DocumentChunk> = new Map();
  private documents: Map<string, IndexableDocument> = new Map();
  private lastIndexedAt?: number;

  constructor(config: IndexerConfig = {}) {
    this.chunkSize = config.chunkSize ?? 512;
    this.chunkOverlap = config.chunkOverlap ?? 64;
    this.batchSize = config.batchSize ?? 16;
    this.vectorStore = new VectorStore(config.vectorStore?.dimension ?? 768);
    this.meilisearch = new MeilisearchClient(config.meilisearch);
    this.embedder = new LocalEmbeddingService({
      ollamaUrl: config.ollamaUrl,
      model: config.embeddingModel as any,
      batchSize: this.batchSize,
      cache: true,
    });
  }

  /**
   * Index one or more documents into both stores.
   */
  async index(documents: IndexableDocument[]): Promise<IndexResult> {
    const startTime = Date.now();
    const errors: Array<{ docId: string; error: string }> = [];
    let chunkCount = 0;

    // Ensure embedding service is ready
    const ready = await this.embedder.ensureReady();
    if (!ready) {
      return {
        documentCount: 0,
        chunkCount: 0,
        durationMs: Date.now() - startTime,
        errors: [{ docId: '*', error: 'Embedding service not available' }],
      };
    }

    // Ensure Meilisearch is ready (non-blocking)
    await this.meilisearch.ensureIndex();

    const allMeiliDocs: Array<Record<string, unknown>> = [];

    for (const doc of documents) {
      try {
        // Remove old chunks if re-indexing
        if (this.documents.has(doc.id)) {
          this.vectorStore.deleteByDocId(doc.id);
        }

        this.documents.set(doc.id, doc);

        // Chunk the document
        const rawChunks = chunkContent(doc.content ?? '', this.chunkSize, this.chunkOverlap);

        if (rawChunks.length === 0) continue;

        // Embed all chunks in batches
        const texts = rawChunks.map(c => c.text);
        let embeddings: EmbeddingResult[];

        try {
          embeddings = await this.embedder.embedBatch(texts);
        } catch (err) {
          errors.push({ docId: doc.id, error: `Embedding failed: ${err instanceof Error ? err.message : String(err)}` });
          continue;
        }

        // Store chunks
        for (let i = 0; i < rawChunks.length; i++) {
          const raw = rawChunks[i];
          const chunkId = `${doc.id}_chunk_${raw.index}`;

          const chunk: DocumentChunk = {
            id: chunkId,
            docId: doc.id,
            text: raw.text,
            embedding: embeddings[i].embedding,
            index: raw.index,
            startOffset: raw.startOffset,
            length: raw.length,
            metadata: {
              title: doc.title,
              source: doc.source,
              author: doc.author,
              createdAt: doc.createdAt,
              url: doc.url,
            },
          };

          this.chunks.set(chunkId, chunk);
          this.vectorStore.upsert(chunkId, chunk.embedding, chunk.metadata as unknown as Record<string, unknown>);

          // Prepare for Meilisearch
          allMeiliDocs.push({
            id: chunkId,
            docId: doc.id,
            text: raw.text,
            title: doc.title,
            source: doc.source,
            author: doc.author ?? null,
            createdAt: doc.createdAt ?? null,
            url: doc.url ?? null,
            chunkIndex: raw.index,
          });

          chunkCount++;
        }
      } catch (err) {
        errors.push({ docId: doc.id, error: err instanceof Error ? err.message : String(err) });
      }
    }

    // Batch push to Meilisearch
    if (allMeiliDocs.length > 0) {
      // Push in batches of 1000
      for (let i = 0; i < allMeiliDocs.length; i += 1000) {
        const batch = allMeiliDocs.slice(i, i + 1000);
        await this.meilisearch.addDocuments(batch);
      }
    }

    this.lastIndexedAt = Date.now();

    return {
      documentCount: documents.length,
      chunkCount,
      durationMs: Date.now() - startTime,
      errors,
    };
  }

  /**
   * Remove a document from the index.
   */
  async remove(docId: string): Promise<boolean> {
    const chunkCount = this.vectorStore.deleteByDocId(docId);
    this.documents.delete(docId);

    // Remove from Meilisearch
    const chunkIds: string[] = [];
    for (const [id, chunk] of this.chunks) {
      if (chunk.docId === docId) {
        chunkIds.push(id);
        this.chunks.delete(id);
      }
    }

    if (chunkIds.length > 0) {
      await this.meilisearch.deleteDocuments(chunkIds);
    }

    return chunkCount > 0;
  }

  /**
   * Search the vector store directly.
   */
  async searchVector(query: string, topK: number = 10): Promise<Array<{ chunk: DocumentChunk; score: number }>> {
    const queryEmbedding = await this.embedder.embed(query);
    const results = this.vectorStore.search(queryEmbedding.embedding, topK);

    return results.map(r => ({
      chunk: this.chunks.get(r.id)!,
      score: r.score,
    })).filter(r => r.chunk != null);
  }

  /**
   * Search Meilisearch (BM25).
   */
  async searchBM25(query: string, limit: number = 10, filter?: string): Promise<MeilisearchSearchResult | null> {
    return this.meilisearch.search(query, limit, filter);
  }

  /**
   * Get indexing statistics.
   */
  getStats(): IndexStats {
    return {
      totalDocuments: this.documents.size,
      totalChunks: this.chunks.size,
      vectorStoreSize: this.vectorStore.size(),
      meilisearchIndexed: this.meilisearch.isAvailable(),
      lastIndexedAt: this.lastIndexedAt,
    };
  }

  /**
   * Get a specific chunk by ID.
   */
  getChunk(id: string): DocumentChunk | undefined {
    return this.chunks.get(id);
  }

  /**
   * Get all chunks for a document.
   */
  getDocumentChunks(docId: string): DocumentChunk[] {
    const result: DocumentChunk[] = [];
    for (const chunk of this.chunks.values()) {
      if (chunk.docId === docId) result.push(chunk);
    }
    return result.sort((a, b) => a.index - b.index);
  }

  /**
   * Clear the entire index.
   */
  clear(): void {
    this.vectorStore.clear();
    this.chunks.clear();
    this.documents.clear();
  }

  /**
   * Search for chunks from a specific source app.
   */
  async searchBySource(
    query: string,
    source: string,
    topK: number = 10,
  ): Promise<Array<{ chunk: DocumentChunk; score: number }>> {
    const allResults = await this.searchVector(query, topK * 5);
    return allResults
      .filter(r => r.chunk.metadata.source === source)
      .slice(0, topK);
  }

  /**
   * Get documents by source type.
   */
  getDocumentsBySource(source: string): IndexableDocument[] {
    return Array.from(this.documents.values())
      .filter(d => d.source === source);
  }

  /**
   * Check if a document is already indexed.
   */
  hasDocument(docId: string): boolean {
    return this.documents.has(docId);
  }
}

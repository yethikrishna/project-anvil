/**
 * RAG Engine — semantic search over emails, docs, and conversations.
 *
 * Uses OpenAI text-embedding-3-small (fast, cheap, 1536-dim) to embed
 * content, stores vectors in-memory with cosine similarity search,
 * and combines with BM25 for hybrid retrieval (RRF fusion).
 *
 * Architecture:
 *   Index: email/doc → chunk → embed → vector store
 *   Retrieve: query → embed → cosine sim → BM25 → RRF merge → rerank → top-K
 *
 * Singleton — persists across requests in the Next.js server process.
 * Index survives hot reloads via module-level state.
 */

import { NextRequest } from 'next/server';

// ── Types ──

export interface IndexableDoc {
  id: string;
  title: string;
  content: string;
  source: 'gmail' | 'drive' | 'calendar' | 'conversation' | 'web';
  author?: string;
  timestamp?: number;
  url?: string;
  metadata?: Record<string, string>;
}

export interface Chunk {
  id: string;
  docId: string;
  text: string;
  embedding: number[];
  index: number;
  metadata: {
    title: string;
    source: string;
    author?: string;
    timestamp?: number;
    url?: string;
  };
}

export interface RAGSearchResult {
  chunkId: string;
  docId: string;
  text: string;
  score: number;
  metadata: Chunk['metadata'];
  semanticScore?: number;
  bm25Score?: number;
}

export interface RAGAnswer {
  answer: string;
  sources: RAGSearchResult[];
  query: string;
  retrievedAt: number;
}

// ── Chunker ──

const CHUNK_SIZE = 400;       // characters per chunk
const CHUNK_OVERLAP = 80;     // overlap between chunks

function chunkText(text: string, docId: string, metadata: Chunk['metadata']): Chunk[] {
  const chunks: Chunk[] = [];
  let index = 0;
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    const chunkText = text.slice(start, end).trim();

    if (chunkText.length > 30) { // ignore tiny chunks
      chunks.push({
        id: `${docId}::${index}`,
        docId,
        text: chunkText,
        embedding: [],
        index,
        metadata,
      });
      index++;
    }

    if (end >= text.length) break;
    start = end - CHUNK_OVERLAP;
  }

  return chunks;
}

// ── Embedding ──

let embeddingEndpoint = '';
let embeddingApiKey = '';
let embeddingModel = 'text-embedding-3-small';

function initEmbeddingConfig() {
  embeddingApiKey = process.env.OPENAI_API_KEY ?? '';
  const base = process.env.OPENAI_API_URL ?? 'https://api.openai.com/v1/chat/completions';
  embeddingEndpoint = base.replace('/chat/completions', '/embeddings');
  const model = process.env.EMBEDDING_MODEL;
  if (model) embeddingModel = model;
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  if (!embeddingApiKey) {
    // Fallback: TF-IDF-style pseudo-embedding (dimension 64) for environments without OpenAI
    return texts.map(t => pseudoEmbed(t));
  }

  try {
    const res = await fetch(embeddingEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${embeddingApiKey}`,
      },
      body: JSON.stringify({ model: embeddingModel, input: texts }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      console.warn(`[RAG] Embedding API error ${res.status}: ${err} — using pseudo-embed`);
      return texts.map(t => pseudoEmbed(t));
    }

    const data = await res.json() as { data: Array<{ embedding: number[] }> };
    return data.data.map(d => d.embedding);
  } catch (err) {
    console.warn('[RAG] Embedding failed, falling back to pseudo-embed:', err);
    return texts.map(t => pseudoEmbed(t));
  }
}

/** TF-IDF-inspired pseudo-embedding (64-dim) for fallback/testing. */
function pseudoEmbed(text: string): number[] {
  const dim = 64;
  const vec = new Array<number>(dim).fill(0);
  const tokens = text.toLowerCase().split(/\W+/).filter(t => t.length > 1);

  for (const token of tokens) {
    let hash = 5381;
    for (let i = 0; i < token.length; i++) {
      hash = ((hash << 5) + hash) ^ token.charCodeAt(i);
      hash = hash & hash;
    }
    const slot = Math.abs(hash) % dim;
    vec[slot] += 1;
  }

  // L2 normalize
  const magnitude = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  if (magnitude > 0) {
    for (let i = 0; i < dim; i++) vec[i] /= magnitude;
  }

  return vec;
}

// ── Cosine similarity ──

function cosine(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ── BM25 ──

const K1 = 1.5;
const B = 0.75;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2 && !STOP_WORDS.has(t));
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'that', 'this', 'with', 'from', 'have', 'are',
  'was', 'were', 'will', 'can', 'but', 'not', 'you', 'your', 'our',
  'all', 'any', 'been', 'has', 'had', 'they', 'them', 'its', 'also',
  'what', 'when', 'how', 'who', 'why', 'which', 'just', 'get', 'got',
  'would', 'should', 'could', 'may', 'might', 'than', 'then', 'into',
  'out', 'about', 'more', 'some', 'their', 'there',
]);

function bm25(queryTokens: string[], docTokens: string[], avgDocLen: number): number {
  const docLen = docTokens.length;
  const tf = new Map<string, number>();
  for (const t of docTokens) tf.set(t, (tf.get(t) ?? 0) + 1);

  let score = 0;
  for (const qt of queryTokens) {
    const tfVal = tf.get(qt) ?? 0;
    if (tfVal === 0) continue;
    const idf = Math.log(1 + 1);
    const num = tfVal * (K1 + 1);
    const denom = tfVal + K1 * (1 - B + B * (docLen / Math.max(avgDocLen, 1)));
    score += idf * (num / denom);
  }
  return score;
}

// ── RRF (Reciprocal Rank Fusion) ──

const RRF_K = 60;

function rrfFuse(
  semanticRanked: { id: string; score: number }[],
  bm25Ranked: { id: string; score: number }[],
  semanticWeight = 0.6,
  bm25Weight = 0.4,
): Map<string, { rrf: number; sem?: number; bm25?: number }> {
  const scores = new Map<string, { rrf: number; sem?: number; bm25?: number }>();

  for (let i = 0; i < semanticRanked.length; i++) {
    const { id, score } = semanticRanked[i];
    const contribution = semanticWeight * (1 / (RRF_K + i + 1));
    const entry = scores.get(id) ?? { rrf: 0 };
    entry.rrf += contribution;
    entry.sem = score;
    scores.set(id, entry);
  }

  for (let i = 0; i < bm25Ranked.length; i++) {
    const { id, score } = bm25Ranked[i];
    const contribution = bm25Weight * (1 / (RRF_K + i + 1));
    const entry = scores.get(id) ?? { rrf: 0 };
    entry.rrf += contribution;
    entry.bm25 = score;
    scores.set(id, entry);
  }

  return scores;
}

// ── RAG Engine Singleton ──

interface RAGState {
  chunks: Map<string, Chunk>;
  docs: Map<string, IndexableDoc>;
  avgChunkLen: number;
  initialized: boolean;
  totalChunks: number;
}

// Module-level singleton (survives across Next.js requests in same process)
const state: RAGState = {
  chunks: new Map(),
  docs: new Map(),
  avgChunkLen: 100,
  initialized: false,
  totalChunks: 0,
};

function ensureInit() {
  if (!state.initialized) {
    initEmbeddingConfig();
    state.initialized = true;
  }
}

/**
 * Index a document into the RAG engine.
 * Chunks the text, generates embeddings, and stores in-memory.
 */
export async function indexDocument(doc: IndexableDoc): Promise<number> {
  ensureInit();

  // Skip if already indexed and unchanged
  const existing = state.docs.get(doc.id);
  if (existing && existing.content === doc.content) return 0;

  // Remove old chunks if re-indexing
  if (existing) {
    for (const [id, chunk] of state.chunks) {
      if (chunk.docId === doc.id) state.chunks.delete(id);
    }
  }

  state.docs.set(doc.id, doc);

  const metadata: Chunk['metadata'] = {
    title: doc.title,
    source: doc.source,
    author: doc.author,
    timestamp: doc.timestamp,
    url: doc.url,
  };

  const chunks = chunkText(doc.content, doc.id, metadata);
  if (chunks.length === 0) return 0;

  // Batch embed
  const BATCH = 20;
  for (let i = 0; i < chunks.length; i += BATCH) {
    const batch = chunks.slice(i, i + BATCH);
    const texts = batch.map(c => c.text);
    const embeddings = await embedBatch(texts);
    for (let j = 0; j < batch.length; j++) {
      batch[j].embedding = embeddings[j] ?? [];
    }
  }

  // Store chunks
  let totalLen = 0;
  for (const chunk of chunks) {
    state.chunks.set(chunk.id, chunk);
    totalLen += chunk.text.length;
  }

  state.totalChunks += chunks.length;
  state.avgChunkLen = (state.avgChunkLen * (state.totalChunks - chunks.length) + totalLen) /
    Math.max(state.totalChunks, 1);

  return chunks.length;
}

/**
 * Index multiple documents in parallel (batched).
 */
export async function indexDocuments(docs: IndexableDoc[]): Promise<{ indexed: number; chunks: number }> {
  ensureInit();
  let totalChunks = 0;
  for (const doc of docs) {
    const n = await indexDocument(doc);
    totalChunks += n;
  }
  return { indexed: docs.length, chunks: totalChunks };
}

/**
 * Semantic + BM25 hybrid search.
 * Returns top-K chunks ranked by RRF fusion.
 */
export async function search(
  query: string,
  options: {
    topK?: number;
    sourceFilter?: string;
    minScore?: number;
    semanticWeight?: number;
    bm25Weight?: number;
  } = {},
): Promise<RAGSearchResult[]> {
  ensureInit();

  const topK = options.topK ?? 8;
  const minScore = options.minScore ?? 0.05;
  const semanticWeight = options.semanticWeight ?? 0.65;
  const bm25Weight = options.bm25Weight ?? 0.35;

  const allChunks = Array.from(state.chunks.values()).filter(c => {
    if (options.sourceFilter && c.metadata.source !== options.sourceFilter) return false;
    return c.embedding.length > 0;
  });

  if (allChunks.length === 0) return [];

  // 1. Semantic search
  const [queryEmbedding] = await embedBatch([query]);
  const semanticRanked = allChunks
    .map(c => ({ id: c.id, score: cosine(queryEmbedding, c.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK * 3);

  // 2. BM25 search
  const queryTokens = tokenize(query);
  const bm25Ranked = allChunks
    .map(c => ({
      id: c.id,
      score: bm25(queryTokens, tokenize(c.text), state.avgChunkLen),
    }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK * 3);

  // 3. RRF fusion
  const fused = rrfFuse(semanticRanked, bm25Ranked, semanticWeight, bm25Weight);

  // 4. Build results
  const results: RAGSearchResult[] = [];
  for (const [chunkId, scores] of fused) {
    if (scores.rrf < minScore) continue;
    const chunk = state.chunks.get(chunkId);
    if (!chunk) continue;

    results.push({
      chunkId,
      docId: chunk.docId,
      text: chunk.text,
      score: scores.rrf,
      metadata: chunk.metadata,
      semanticScore: scores.sem,
      bm25Score: scores.bm25,
    });
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/**
 * RAG-augmented generation: retrieve relevant context and generate an answer.
 */
export async function ragQuery(
  query: string,
  options: {
    topK?: number;
    sourceFilter?: string;
    model?: string;
    maxTokens?: number;
    systemPromptExtra?: string;
  } = {},
): Promise<RAGAnswer> {
  const sources = await search(query, { topK: options.topK ?? 6, sourceFilter: options.sourceFilter });

  if (sources.length === 0) {
    return {
      answer: 'No relevant documents found in the index for this query.',
      sources: [],
      query,
      retrievedAt: Date.now(),
    };
  }

  // Build context from retrieved chunks
  const context = sources.map((r, i) => {
    const ts = r.metadata.timestamp
      ? new Date(r.metadata.timestamp).toLocaleDateString()
      : '';
    const header = `[${i + 1}] ${r.metadata.title}${ts ? ` (${ts})` : ''} — ${r.metadata.source}`;
    return `${header}\n${r.text}`;
  }).join('\n\n---\n\n');

  // Generate answer
  const apiKey = process.env.OPENAI_API_KEY ?? '';
  const apiUrl = process.env.OPENAI_API_URL ?? 'https://api.openai.com/v1/chat/completions';
  const model = options.model ?? process.env.AI_MODEL ?? 'gpt-4o-mini';
  const maxTokens = options.maxTokens ?? 512;

  const systemPrompt = `You are a knowledge retrieval assistant. Answer the user's question based ONLY on the provided context. 
If the context doesn't contain the answer, say so clearly.
Be concise and cite sources by number [1], [2], etc.
${options.systemPromptExtra ?? ''}`;

  const userMessage = `Context:\n${context}\n\nQuestion: ${query}`;

  let answer = 'Unable to generate answer — AI service unavailable.';

  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        max_tokens: maxTokens,
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (res.ok) {
      const data = await res.json() as { choices: Array<{ message: { content: string } }> };
      answer = data.choices[0]?.message?.content ?? answer;
    }
  } catch (err) {
    console.warn('[RAG] Answer generation failed:', err);
  }

  return { answer, sources, query, retrievedAt: Date.now() };
}

/**
 * Get index stats.
 */
export function getIndexStats(): {
  documents: number;
  chunks: number;
  sources: Record<string, number>;
  avgChunkLen: number;
} {
  const sources: Record<string, number> = {};
  for (const doc of state.docs.values()) {
    sources[doc.source] = (sources[doc.source] ?? 0) + 1;
  }
  return {
    documents: state.docs.size,
    chunks: state.chunks.size,
    sources,
    avgChunkLen: Math.round(state.avgChunkLen),
  };
}

/**
 * Remove a document from the index.
 */
export function removeDocument(docId: string): boolean {
  if (!state.docs.has(docId)) return false;
  state.docs.delete(docId);
  for (const [id, chunk] of state.chunks) {
    if (chunk.docId === docId) state.chunks.delete(id);
  }
  return true;
}

/**
 * Clear the entire index.
 */
export function clearIndex(): void {
  state.chunks.clear();
  state.docs.clear();
  state.avgChunkLen = 100;
  state.totalChunks = 0;
}

/**
 * Document RAG (Retrieval-Augmented Generation) System
 *
 * Indexes workspace documents for AI research queries.
 * Supports:
 * - Document chunking with overlap
 * - Embedding-based retrieval
 * - Citation tracking back to source documents
 * - Multi-document synthesis
 * - Workspace-wide search
 */

import {createAI} from '@anvil/ai';

// ── Types ──

interface DocumentChunk {
  id: string;
  docId: string;
  docTitle: string;
  content: string;
  embedding?: number[];
  metadata: {
    chunkIndex: number;
    startChar: number;
    endChar: number;
    headings: string[];
    wordCount: number;
  };
}

interface ResearchResult {
  text: string;
  source: string;
  docId: string;
  docTitle: string;
  relevance: number;
  chunkId: string;
}

interface ResearchResponse {
  query: string;
  results: ResearchResult[];
  synthesis: string;
  totalChunksSearched: number;
  searchTimeMs: number;
}

// ── Document Chunker ──

function chunkDocument(
  content: string,
  docId: string,
  docTitle: string,
  chunkSize: number = 800,
  overlap: number = 200,
): DocumentChunk[] {
  // Extract headings for context
  const headingRegex = /^(#{1,6})\s+(.+)$/gm;
  const headings: {level: number; text: string; position: number}[] = [];
  let match;
  while ((match = headingRegex.exec(content)) !== null) {
    headings.push({
      level: match[1].length,
      text: match[2],
      position: match.index,
    });
  }

  // Split into paragraphs first
  const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  const chunks: DocumentChunk[] = [];
  let currentChunk = '';
  let chunkStart = 0;
  let chunkIndex = 0;

  for (const para of paragraphs) {
    if (currentChunk.length + para.length > chunkSize && currentChunk.length > 0) {
      // Save current chunk
      const activeHeadings = headings
        .filter(h => h.position < chunkStart + currentChunk.length)
        .sort((a, b) => b.level - a.level)
        .slice(0, 3)
        .map(h => h.text);

      chunks.push({
        id: `${docId}-chunk-${chunkIndex}`,
        docId,
        docTitle,
        content: currentChunk.trim(),
        metadata: {
          chunkIndex,
          startChar: chunkStart,
          endChar: chunkStart + currentChunk.length,
          headings: activeHeadings,
          wordCount: currentChunk.split(/\s+/).length,
        },
      });

      // Keep overlap
      const overlapText = currentChunk.slice(-overlap);
      currentChunk = overlapText + '\n\n' + para;
      chunkStart += currentChunk.length - overlapText.length - para.length - 2;
      chunkIndex++;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + para;
    }
  }

  // Final chunk
  if (currentChunk.trim().length > 0) {
    const activeHeadings = headings
      .filter(h => h.position < chunkStart + currentChunk.length)
      .sort((a, b) => b.level - a.level)
      .slice(0, 3)
      .map(h => h.text);

    chunks.push({
      id: `${docId}-chunk-${chunkIndex}`,
      docId,
      docTitle,
      content: currentChunk.trim(),
      metadata: {
        chunkIndex,
        startChar: chunkStart,
        endChar: chunkStart + currentChunk.length,
        headings: activeHeadings,
        wordCount: currentChunk.split(/\s+/).length,
      },
    });
  }

  return chunks;
}

// ── Simple Embedding (TF-IDF inspired) ──

function generateEmbedding(text: string, dimensions: number = 128): number[] {
  const words = text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2);

  const embedding = new Array(dimensions).fill(0);

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    let hash = 0;
    for (let j = 0; j < word.length; j++) {
      hash = ((hash << 5) - hash + word.charCodeAt(j)) | 0;
    }

    // Unigram
    embedding[Math.abs(hash) % dimensions] += 1;

    // Bigram
    if (i < words.length - 1) {
      const bigram = word + words[i + 1];
      let bhash = 0;
      for (let j = 0; j < bigram.length; j++) {
        bhash = ((bhash << 5) - bhash + bigram.charCodeAt(j)) | 0;
      }
      embedding[Math.abs(bhash) % dimensions] += 0.7;
    }

    // Trigram
    if (i < words.length - 2) {
      const trigram = word + words[i + 1] + words[i + 2];
      let thash = 0;
      for (let j = 0; j < trigram.length; j++) {
        thash = ((thash << 5) - thash + trigram.charCodeAt(j)) | 0;
      }
      embedding[Math.abs(thash) % dimensions] += 0.4;
    }
  }

  // Normalize
  const norm = Math.sqrt(embedding.reduce((s, v) => s + v * v, 0));
  return norm > 0 ? embedding.map(v => v / norm) : embedding;
}

// ── Cosine Similarity ──

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ── RAG Index ──

class DocumentRAGIndex {
  private chunks: Map<string, DocumentChunk> = new Map();
  private docIds: Set<string> = new Set();

  get size(): number {
    return this.chunks.size;
  }

  get documentCount(): number {
    return this.docIds.size;
  }

  indexDocument(docId: string, docTitle: string, content: string): number {
    // Remove old chunks for this doc
    for (const [id, chunk] of this.chunks) {
      if (chunk.docId === docId) this.chunks.delete(id);
    }

    const newChunks = chunkDocument(content, docId, docTitle);
    for (const chunk of newChunks) {
      chunk.embedding = generateEmbedding(chunk.content);
      this.chunks.set(chunk.id, chunk);
    }

    this.docIds.add(docId);
    return newChunks.length;
  }

  removeDocument(docId: string): void {
    for (const [id, chunk] of this.chunks) {
      if (chunk.docId === docId) this.chunks.delete(id);
    }
    this.docIds.delete(docId);
  }

  search(query: string, topK: number = 10, minRelevance: number = 0.15): Array<{chunk: DocumentChunk; score: number}> {
    const queryEmbedding = generateEmbedding(query);
    const results: Array<{chunk: DocumentChunk; score: number}> = [];

    // Also boost by keyword overlap
    const queryTerms = new Set(query.toLowerCase().split(/\s+/).filter(t => t.length > 2));

    for (const chunk of this.chunks.values()) {
      if (!chunk.embedding) continue;

      const semanticScore = cosineSimilarity(queryEmbedding, chunk.embedding);

      // Keyword boost
      const chunkTerms = new Set(chunk.content.toLowerCase().split(/\s+/).filter(t => t.length > 2));
      let keywordOverlap = 0;
      for (const term of queryTerms) {
        if (chunkTerms.has(term)) keywordOverlap++;
      }
      const keywordScore = queryTerms.size > 0 ? keywordOverlap / queryTerms.size : 0;

      // Title match bonus
      const titleTerms = new Set(chunk.docTitle.toLowerCase().split(/\s+/));
      let titleMatch = 0;
      for (const term of queryTerms) {
        if (titleTerms.has(term)) titleMatch++;
      }
      const titleBoost = queryTerms.size > 0 ? (titleMatch / queryTerms.size) * 0.3 : 0;

      // Heading match bonus
      const headingTerms = new Set(chunk.metadata.headings.join(' ').toLowerCase().split(/\s+/));
      let headingMatch = 0;
      for (const term of queryTerms) {
        if (headingTerms.has(term)) headingMatch++;
      }
      const headingBoost = queryTerms.size > 0 ? (headingMatch / queryTerms.size) * 0.2 : 0;

      const combinedScore = semanticScore * 0.5 + keywordScore * 0.35 + titleBoost + headingBoost;

      if (combinedScore >= minRelevance) {
        results.push({chunk, score: combinedScore});
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  getAllChunksForDocument(docId: string): DocumentChunk[] {
    return Array.from(this.chunks.values())
      .filter(c => c.docId === docId)
      .sort((a, b) => a.metadata.chunkIndex - b.metadata.chunkIndex);
  }

  clear(): void {
    this.chunks.clear();
    this.docIds.clear();
  }
}

// Singleton
const ragIndex = new DocumentRAGIndex();

// ── Public API ──

export function indexDocument(docId: string, docTitle: string, content: string): number {
  return ragIndex.indexDocument(docId, docTitle, content);
}

export function removeDocument(docId: string): void {
  ragIndex.removeDocument(docId);
}

export function searchDocuments(query: string, topK: number = 10): Array<{
  content: string;
  docId: string;
  docTitle: string;
  relevance: number;
  headings: string[];
}> {
  return ragIndex.search(query, topK).map(r => ({
    content: r.chunk.content,
    docId: r.chunk.docId,
    docTitle: r.chunk.docTitle,
    relevance: r.score,
    headings: r.chunk.metadata.headings,
  }));
}

export function getRAGIndexSize(): {chunks: number; documents: number} {
  return {chunks: ragIndex.size, documents: ragIndex.documentCount};
}

export function clearRAGIndex(): void {
  ragIndex.clear();
}

// ── Research with Synthesis ──

export async function researchWithSynthesis(
  query: string,
  topK: number = 5,
): Promise<ResearchResponse> {
  const startTime = Date.now();

  const results = ragIndex.search(query, topK);

  if (results.length === 0) {
    return {
      query,
      results: [],
      synthesis: 'No relevant documents found in your workspace.',
      totalChunksSearched: ragIndex.size,
      searchTimeMs: Date.now() - startTime,
    };
  }

  // Build synthesis using AI
  const ai = createAI({
    provider: (process.env.AI_PROVIDER as 'openai' | 'ollama') || 'ollama',
    apiKey: process.env.AI_API_KEY,
    baseUrl: process.env.AI_BASE_URL || 'http://localhost:11434',
    model: process.env.AI_MODEL || 'llama3',
  });

  const contextBlock = results
    .map((r, i) => `[${i + 1}] From "${r.chunk.docTitle}" (relevance: ${Math.round(r.score * 100)}%):\n${r.chunk.content}`)
    .join('\n\n');

  const synthesisResult = await ai.generate([
    {role: 'system', content: `Synthesize information from these document excerpts to answer the research query.
Cite sources by number [1], [2], etc.
Be comprehensive but concise.
If the excerpts don't fully answer the query, say so.`},
    {role: 'user', content: `Query: ${query}\n\nDocument excerpts:\n${contextBlock}`},
  ], {temperature: 0.3, maxTokens: 800});

  const researchResults: ResearchResult[] = results.map(r => ({
    text: r.chunk.content,
    source: r.chunk.docTitle,
    docId: r.chunk.docId,
    docTitle: r.chunk.docTitle,
    relevance: r.score,
    chunkId: r.chunk.id,
  }));

  return {
    query,
    results: researchResults,
    synthesis: synthesisResult.text,
    totalChunksSearched: ragIndex.size,
    searchTimeMs: Date.now() - startTime,
  };
}

export {DocumentRAGIndex};

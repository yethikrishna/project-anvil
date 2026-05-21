/**
 * Local RAG pipeline for private document search.
 *
 * Runs entirely client-side — no data leaves the browser.
 * Uses TF-IDF + cosine similarity for retrieval (no external LLM needed).
 *
 * Flow:
 * 1. Ingest documents → chunk → compute TF-IDF vectors
 * 2. Query → compute TF-IDF → find top-k similar chunks
 * 3. Generate answer from retrieved chunks (template-based)
 */

// ── Types ──

export interface RAGDocument {
  id: string;
  title: string;
  content: string;
  source: string;
  app: string;
  metadata?: Record<string, string>;
}

export interface RAGChunk {
  id: string;
  docId: string;
  text: string;
  vector: number[];
}

export interface RAGResult {
  query: string;
  chunks: {chunk: RAGChunk; doc: RAGDocument; score: number}[];
  answer: string;
  processingTimeMs: number;
}

// ── TF-IDF Engine ──

class TFIDFEngine {
  private documents: string[][] = [];
  private idf: Map<string, number> = new Map();
  private vocab: string[] = [];

  /**
   * Tokenize text into terms.
   */
  private tokenize(text: string): string[] {
    return text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2)
      .filter(t => !STOP_WORDS.has(t));
  }

  /**
   * Build IDF from document corpus.
   */
  fit(documents: string[]): void {
    this.documents = documents.map(d => this.tokenize(d));
    const N = this.documents.length;
    const df = new Map<string, number>();

    for (const terms of this.documents) {
      const unique = new Set(terms);
      for (const term of unique) {
        df.set(term, (df.get(term) || 0) + 1);
      }
    }

    this.vocab = Array.from(df.keys());
    this.idf = new Map();
    for (const [term, freq] of df.entries()) {
      this.idf.set(term, Math.log((N + 1) / (freq + 1)) + 1); // Smoothed IDF
    }
  }

  /**
   * Compute TF-IDF vector for a text.
   */
  vectorize(text: string): number[] {
    const terms = this.tokenize(text);
    const tf = new Map<string, number>();
    for (const t of terms) {
      tf.set(t, (tf.get(t) || 0) + 1);
    }

    // Normalize TF
    const maxTf = Math.max(...tf.values(), 1);

    return this.vocab.map(term => {
      const termFreq = (tf.get(term) || 0) / maxTf;
      const inverseFreq = this.idf.get(term) || 1;
      return termFreq * inverseFreq;
    });
  }

  getVocabSize(): number {
    return this.vocab.length;
  }
}

// ── Similarity ──

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dotProduct = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dotProduct / denom;
}

// ── Text Chunking ──

function chunkText(text: string, maxChunkSize = 300, overlap = 50): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if (current.length + sentence.length > maxChunkSize && current.length > 0) {
      chunks.push(current.trim());
      // Keep overlap
      const words = current.split(/\s+/);
      current = words.slice(-overlap / 5).join(' ') + ' ';
    }
    current += sentence + ' ';
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

// ── RAG Pipeline ──

export class LocalRAGPipeline {
  private engine: TFIDFEngine;
  private documents: Map<string, RAGDocument> = new Map();
  private chunks: RAGChunk[] = [];
  private isIndexed = false;

  constructor() {
    this.engine = new TFIDFEngine();
  }

  /**
   * Ingest documents into the pipeline.
   */
  ingest(docs: RAGDocument[]): void {
    // Store documents
    for (const doc of docs) {
      this.documents.set(doc.id, doc);
    }

    // Create chunks
    this.chunks = [];
    const allTexts: string[] = [];

    for (const doc of docs) {
      const docChunks = chunkText(doc.content);
      for (let i = 0; i < docChunks.length; i++) {
        const chunkId = `${doc.id}_chunk_${i}`;
        allTexts.push(docChunks[i]);
        this.chunks.push({
          id: chunkId,
          docId: doc.id,
          text: docChunks[i],
          vector: [], // Will be computed after fit
        });
      }
    }

    // Fit TF-IDF on all chunks
    this.engine.fit(allTexts);

    // Compute vectors for all chunks
    for (const chunk of this.chunks) {
      chunk.vector = this.engine.vectorize(chunk.text);
    }

    this.isIndexed = true;
  }

  /**
   * Query the pipeline. Returns top-k relevant chunks + generated answer.
   */
  query(question: string, topK = 5): RAGResult {
    const startTime = performance.now();

    if (!this.isIndexed || this.chunks.length === 0) {
      return {
        query: question,
        chunks: [],
        answer: 'No documents indexed. Please add documents first.',
        processingTimeMs: performance.now() - startTime,
      };
    }

    // Vectorize query
    const queryVector = this.engine.vectorize(question);

    // Score all chunks
    const scored = this.chunks
      .map(chunk => ({
        chunk,
        doc: this.documents.get(chunk.docId)!,
        score: cosineSimilarity(queryVector, chunk.vector),
      }))
      .filter(r => r.score > 0.05)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    // Generate answer from top chunks
    const answer = this.generateAnswer(question, scored);

    return {
      query: question,
      chunks: scored,
      answer,
      processingTimeMs: Math.round((performance.now() - startTime) * 100) / 100,
    };
  }

  /**
   * Generate an answer from retrieved chunks.
   */
  private generateAnswer(
    question: string,
    results: {chunk: RAGChunk; doc: RAGDocument; score: number}[]
  ): string {
    if (results.length === 0) {
      return `I couldn't find any relevant information for "${question}" in the indexed documents.`;
    }

    const topChunks = results.slice(0, 3);
    const docNames = [...new Set(topChunks.map(r => r.doc.title))];

    let answer = `Based on ${docNames.length} document${docNames.length > 1 ? 's' : ''}`;

    // Detect question type
    const lower = question.toLowerCase();
    const isWhat = lower.startsWith('what');
    const isHow = lower.startsWith('how');
    const isWhy = lower.startsWith('why');
    const isWhen = lower.startsWith('when');
    const isList = lower.includes('list') || lower.includes('all');

    if (isWhat || isHow || isWhy || isWhen) {
      answer += `, here's what I found:\n\n`;
    } else if (isList) {
      answer += `, here are the relevant items:\n\n`;
    } else {
      answer += `:\n\n`;
    }

    for (let i = 0; i < topChunks.length; i++) {
      const {chunk, doc, score} = topChunks[i];
      answer += `[${i + 1}] **${doc.title}** (relevance: ${(score * 100).toFixed(0)}%)\n`;
      answer += `   ${chunk.text.slice(0, 200)}${chunk.text.length > 200 ? '...' : ''}\n\n`;
    }

    answer += `Sources: ${docNames.join(', ')}`;
    return answer;
  }

  /**
   * Get pipeline stats.
   */
  getStats(): {documents: number; chunks: number; vocabSize: number; indexed: boolean} {
    return {
      documents: this.documents.size,
      chunks: this.chunks.length,
      vocabSize: this.engine.getVocabSize(),
      indexed: this.isIndexed,
    };
  }
}

// ── On-device Document Summarization ──

export interface SummaryResult {
  summary: string;
  keyPoints: string[];
  wordCount: number;
  compressionRatio: number;
  processingTimeMs: number;
}

/**
 * Extractive summarization — picks the most important sentences.
 * Runs entirely on-device, no API calls.
 */
export function summarizeDocument(text: string, targetLength = 3): SummaryResult {
  const startTime = performance.now();

  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 20);

  if (sentences.length <= targetLength) {
    return {
      summary: sentences.join(' '),
      keyPoints: sentences,
      wordCount: text.split(/\s+/).length,
      compressionRatio: 1,
      processingTimeMs: performance.now() - startTime,
    };
  }

  // Score each sentence
  const wordFreq = new Map<string, number>();
  const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 3 && !STOP_WORDS.has(w));
  for (const w of words) {
    wordFreq.set(w, (wordFreq.get(w) || 0) + 1);
  }

  const maxFreq = Math.max(...wordFreq.values(), 1);

  const scored = sentences.map((sentence, idx) => {
    const sentWords = sentence.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    let score = 0;

    // Word importance
    for (const w of sentWords) {
      score += (wordFreq.get(w) || 0) / maxFreq;
    }
    score /= Math.max(sentWords.length, 1);

    // Position bonus (first and last sentences are important)
    if (idx === 0) score *= 1.5;
    if (idx === sentences.length - 1) score *= 1.2;

    // Length penalty (very short or very long sentences)
    if (sentWords.length < 5) score *= 0.5;
    if (sentWords.length > 40) score *= 0.8;

    // Keyword bonus
    const lower = sentence.toLowerCase();
    for (const kw of IMPORTANT_KEYWORDS) {
      if (lower.includes(kw)) score *= 1.3;
    }

    return {sentence, score, idx};
  });

  // Select top sentences in original order
  const topIndices = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, targetLength)
    .map(s => s.idx)
    .sort((a, b) => a - b);

  const summary = topIndices.map(i => sentences[i]).join(' ');
  const keyPoints = topIndices.map(i => sentences[i]);

  const originalWords = text.split(/\s+/).length;
  const summaryWords = summary.split(/\s+/).length;

  return {
    summary,
    keyPoints,
    wordCount: originalWords,
    compressionRatio: Math.round((summaryWords / originalWords) * 100) / 100,
    processingTimeMs: Math.round((performance.now() - startTime) * 100) / 100,
  };
}

// ── Constants ──

const STOP_WORDS = new Set([
  'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i',
  'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
  'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her',
  'she', 'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there',
  'their', 'what', 'so', 'up', 'out', 'if', 'about', 'who', 'get',
  'which', 'go', 'me', 'when', 'make', 'can', 'like', 'time', 'no',
  'just', 'him', 'know', 'take', 'people', 'into', 'year', 'your',
  'good', 'some', 'could', 'them', 'see', 'other', 'than', 'then',
  'now', 'look', 'only', 'come', 'its', 'over', 'think', 'also',
  'back', 'after', 'use', 'two', 'how', 'our', 'work', 'first',
  'well', 'way', 'even', 'new', 'want', 'because', 'any', 'these',
  'give', 'day', 'most', 'are', 'was', 'were', 'been', 'has', 'had',
]);

const IMPORTANT_KEYWORDS = [
  'important', 'critical', 'key', 'significant', 'result', 'conclusion',
  'summary', 'therefore', 'however', 'finally', 'overall', 'main',
  'primary', 'essential', 'required', 'goal', 'objective', 'outcome',
  'finding', 'recommendation', 'action', 'next', 'deadline', 'milestone',
];

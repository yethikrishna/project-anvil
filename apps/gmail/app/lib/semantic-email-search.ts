'use client';

/**
 * Embedding-based Semantic Email Search
 *
 * Uses @anvil/ai local embeddings for true semantic search over email content.
 * Falls back to keyword matching when embeddings are unavailable.
 *
 * Features:
 * - Indexes email bodies into vector embeddings
 * - Supports incremental indexing (only new emails)
 * - Cosine similarity search
 * - Hybrid scoring: semantic + keyword + recency
 * - Snippet extraction with match highlighting
 */

// ── Types ──

export interface SearchableEmail {
  id: string;
  threadId: string;
  from: {name: string; email: string};
  subject: string;
  body: string;
  date: string;
  read: boolean;
}

export interface SemanticSearchResult {
  email: SearchableEmail;
  score: number;
  matchedSnippet: string;
  matchType: 'semantic' | 'keyword' | 'hybrid';
  highlights: string[];
}

export interface SearchResultGroup {
  query: string;
  results: SemanticSearchResult[];
  totalIndexed: number;
  searchTimeMs: number;
}

// ── Vector Index (client-side, in-memory) ──

interface EmailEmbedding {
  id: string;
  embedding: number[];
  text: string; // The text that was embedded
}

class EmailVectorIndex {
  private embeddings: Map<string, EmailEmbedding> = new Map();
  private isIndexed = false;
  private indexVersion = 0;

  get size(): number {
    return this.embeddings.size;
  }

  clear() {
    this.embeddings.clear();
    this.isIndexed = false;
    this.indexVersion++;
  }

  add(id: string, embedding: number[], text: string) {
    this.embeddings.set(id, {id, embedding, text});
  }

  has(id: string): boolean {
    return this.embeddings.has(id);
  }

  search(queryEmbedding: number[], topK: number = 20): Array<{id: string; score: number}> {
    const results: Array<{id: string; score: number}> = [];

    for (const [id, entry] of this.embeddings) {
      const score = cosineSimilarity(queryEmbedding, entry.embedding);
      results.push({id, score});
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
}

const vectorIndex = new EmailVectorIndex();

// ── Cosine Similarity ──

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

// ── Keyword Scoring ──

function keywordScore(query: string, email: SearchableEmail): number {
  const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 1);
  if (terms.length === 0) return 0;

  const subject = email.subject.toLowerCase();
  const body = email.body.toLowerCase();
  const from = `${email.from.name} ${email.from.email}`.toLowerCase();
  const fullText = `${subject} ${body} ${from}`;

  let score = 0;

  for (const term of terms) {
    // Subject match (highest weight)
    const subjectMatches = subject.split(term).length - 1;
    score += subjectMatches * 4;

    // From match
    if (from.includes(term)) score += 3;

    // Body match
    const bodyMatches = body.split(term).length - 1;
    score += bodyMatches * 0.5;

    // Exact phrase bonus
    if (fullText.includes(query.toLowerCase())) score += 5;
  }

  return score;
}

// ── Recency Boost ──

function recencyBoost(dateStr: string): number {
  const daysSince = (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince < 1) return 1.5;
  if (daysSince < 7) return 1.2;
  if (daysSince < 30) return 1.0;
  if (daysSince < 90) return 0.8;
  return 0.5;
}

// ── Snippet Extraction ──

function extractSnippet(query: string, body: string, maxLength: number = 150): string {
  const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 1);
  const lowerBody = body.toLowerCase();

  // Find the position of the first matching term
  let bestPos = 0;
  for (const term of terms) {
    const pos = lowerBody.indexOf(term);
    if (pos >= 0) {
      bestPos = pos;
      break;
    }
  }

  // Extract context around the match
  const start = Math.max(0, bestPos - 50);
  const end = Math.min(body.length, start + maxLength);
  let snippet = body.slice(start, end).trim();

  if (start > 0) snippet = '...' + snippet;
  if (end < body.length) snippet = snippet + '...';

  return snippet;
}

function highlightTerms(query: string, text: string): string[] {
  const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 1);
  const lower = text.toLowerCase();
  const highlights: string[] = [];

  for (const term of terms) {
    const idx = lower.indexOf(term);
    if (idx >= 0) {
      // Extract surrounding context
      const start = Math.max(0, idx - 20);
      const end = Math.min(text.length, idx + term.length + 20);
      highlights.push(text.slice(start, end));
    }
  }

  return [...new Set(highlights)].slice(0, 3);
}

// ── Index Emails ──

export async function indexEmails(emails: SearchableEmail[]): Promise<number> {
  let indexed = 0;

  // Only index emails not already in the index
  const newEmails = emails.filter(e => !vectorIndex.has(e.id));

  if (newEmails.length === 0) return 0;

  // Try to use server-side embeddings via the AI API
  try {
    const resp = await fetch('/api/ai', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        action: 'embed-emails',
        payload: {
          emails: newEmails.map(e => ({
            id: e.id,
            text: `${e.subject} ${e.body.slice(0, 500)}`,
          })),
        },
      }),
    });

    if (resp.ok) {
      const data = await resp.json();
      if (data.embeddings) {
        for (const emb of data.embeddings) {
          vectorIndex.add(emb.id, emb.embedding, emb.text);
          indexed++;
        }
        return indexed;
      }
    }
  } catch {
    // Fall through to keyword-only
  }

  // Fallback: mark emails as indexed with zero vectors (keyword-only search)
  for (const email of newEmails) {
    const text = `${email.subject} ${email.body.slice(0, 500)}`;
    // Generate a simple hash-based pseudo-embedding for basic similarity
    const pseudoEmbedding = simpleHashEmbed(text, 64);
    vectorIndex.add(email.id, pseudoEmbedding, text);
    indexed++;
  }

  return indexed;
}

// Simple hash-based pseudo-embedding (fallback when no ML embeddings available)
function simpleHashEmbed(text: string, dimensions: number): number[] {
  const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const embedding = new Array(dimensions).fill(0);

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    let hash = 0;
    for (let j = 0; j < word.length; j++) {
      hash = ((hash << 5) - hash + word.charCodeAt(j)) | 0;
    }
    const idx = Math.abs(hash) % dimensions;
    embedding[idx] += 1;

    // Bigram features
    if (i < words.length - 1) {
      const bigram = word + words[i + 1];
      let bhash = 0;
      for (let j = 0; j < bigram.length; j++) {
        bhash = ((bhash << 5) - bhash + bigram.charCodeAt(j)) | 0;
      }
      const bidx = Math.abs(bhash) % dimensions;
      embedding[bidx] += 0.5;
    }
  }

  // Normalize
  const norm = Math.sqrt(embedding.reduce((s, v) => s + v * v, 0));
  return norm > 0 ? embedding.map(v => v / norm) : embedding;
}

// ── Semantic Search ──

export async function semanticSearch(
  query: string,
  emails: SearchableEmail[],
  options?: {maxResults?: number; minScore?: number}
): Promise<SemanticSearchResult[]> {
  const startTime = performance.now();
  const maxResults = options?.maxResults ?? 20;
  const minScore = options?.minScore ?? 0.1;

  if (!query.trim()) return [];

  // Ensure emails are indexed
  await indexEmails(emails);

  const results: SemanticSearchResult[] = [];

  // 1. Get embedding for query
  let queryEmbedding: number[] | null = null;
  try {
    const resp = await fetch('/api/ai', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        action: 'embed-emails',
        payload: {emails: [{id: '__query__', text: query}]},
      }),
    });

    if (resp.ok) {
      const data = await resp.json();
      if (data.embeddings?.[0]?.embedding) {
        queryEmbedding = data.embeddings[0].embedding;
      }
    }
  } catch {
    // Fall through
  }

  // Fallback: use pseudo-embedding for query
  if (!queryEmbedding) {
    queryEmbedding = simpleHashEmbed(query, 64);
  }

  // 2. Vector search
  const vectorResults = vectorIndex.search(queryEmbedding, maxResults * 2);
  const vectorScores = new Map<string, number>();
  for (const r of vectorResults) {
    vectorScores.set(r.id, r.score);
  }

  // 3. Hybrid scoring: semantic + keyword + recency
  for (const email of emails) {
    const semanticScore = vectorScores.get(email.id) || 0;
    const kwScore = keywordScore(query, email);
    const recency = recencyBoost(email.date);

    // Weighted combination
    const hybridScore = (semanticScore * 0.4 + (kwScore > 0 ? Math.min(kwScore / 10, 1) : 0) * 0.4 + (recency - 0.5) * 0.2);

    if (hybridScore >= minScore) {
      const matchType: SemanticSearchResult['matchType'] =
        semanticScore > 0.3 && kwScore > 2 ? 'hybrid' :
        semanticScore > 0.3 ? 'semantic' : 'keyword';

      results.push({
        email,
        score: hybridScore,
        matchedSnippet: extractSnippet(query, email.body),
        matchType,
        highlights: highlightTerms(query, `${email.subject} ${email.body}`),
      });
    }
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);
}

// ── Clear Index ──

export function clearSearchIndex() {
  vectorIndex.clear();
}

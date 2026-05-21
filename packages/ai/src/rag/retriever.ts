/**
 * @anvil/ai/rag — Hybrid Retriever
 *
 * Combines semantic (vector) search with BM25 (Meilisearch) for
 * hybrid retrieval. Uses Reciprocal Rank Fusion (RRF) to merge
 * results from both retrieval methods, with configurable weights.
 *
 * Flow:
 *   Query → [Vector Search + BM25 Search] → RRF Merge → Rerank → Top-K
 */

import { DocumentIndexer, type MeilisearchSearchResult } from './indexer.js';

// ── Types ──────────────────────────────────────────────

export interface RetrievalOptions {
  /** Number of results to return (default: 10) */
  topK?: number;
  /** Weight for semantic (vector) search results (default: 0.6) */
  semanticWeight?: number;
  /** Weight for BM25 search results (default: 0.4) */
  bm25Weight?: number;
  /** Filter by source app */
  sourceFilter?: string;
  /** Filter by author */
  authorFilter?: string;
  /** Date range filter */
  dateFrom?: number;
  /** DateTo filter */
  dateTo?: number;
  /** Minimum relevance score (default: 0.3) */
  minScore?: number;
  /** Enable reciprocal rank fusion (default: true) */
  enableRRF?: boolean;
  /** RRF constant k (default: 60) */
  rrfK?: number;
}

export interface RetrievalResult {
  /** Chunk ID */
  id: string;
  /** Parent document ID */
  docId: string;
  /** Chunk text */
  text: string;
  /** Combined relevance score (0-1) */
  score: number;
  /** Semantic search rank */
  semanticRank?: number;
  /** BM25 search rank */
  bm25Rank?: number;
  /** Semantic-only score */
  semanticScore?: number;
  /** BM25-only score */
  bm25Score?: number;
  /** Metadata */
  metadata: {
    title: string;
    source: string;
    author?: string;
    createdAt?: number;
    url?: string;
  };
}

export interface RetrievalResponse {
  /** The original query */
  query: string;
  /** Merged results */
  results: RetrievalResult[];
  /** Total candidates before filtering */
  totalCandidates: number;
  /** Time taken in ms */
  durationMs: number;
  /** Retrieval method breakdown */
  debug?: {
    semanticCount: number;
    bm25Count: number;
    mergedCount: number;
  };
}

// ── Reciprocal Rank Fusion ─────────────────────────────

interface RankedItem {
  id: string;
  rank: number;
  score: number;
}

/**
 * Merge ranked lists using Reciprocal Rank Fusion.
 * RRF(d) = Σ 1/(k + rank_i(d)) for each ranking list i.
 */
function reciprocalRankFusion(
  semanticResults: RankedItem[],
  bm25Results: RankedItem[],
  semanticWeight: number,
  bm25Weight: number,
  k: number = 60,
): Map<string, { fusedScore: number; semanticRank?: number; bm25Rank?: number; semanticScore?: number; bm25Score?: number }> {
  const scores = new Map<string, {
    fusedScore: number;
    semanticRank?: number;
    bm25Rank?: number;
    semanticScore?: number;
    bm25Score?: number;
  }>();

  // Add semantic search contributions
  for (const item of semanticResults) {
    const rrfScore = semanticWeight / (k + item.rank + 1);
    scores.set(item.id, {
      fusedScore: rrfScore,
      semanticRank: item.rank + 1,
      semanticScore: item.score,
    });
  }

  // Add BM25 search contributions
  for (const item of bm25Results) {
    const existing = scores.get(item.id);
    const rrfScore = bm25Weight / (k + item.rank + 1);

    if (existing) {
      existing.fusedScore += rrfScore;
      existing.bm25Rank = item.rank + 1;
      existing.bm25Score = item.score;
    } else {
      scores.set(item.id, {
        fusedScore: rrfScore,
        bm25Rank: item.rank + 1,
        bm25Score: item.score,
      });
    }
  }

  return scores;
}

// ── Hybrid Retriever ──────────────────────────────────

export class HybridRetriever {
  private indexer: DocumentIndexer;

  constructor(indexer: DocumentIndexer) {
    this.indexer = indexer;
  }

  /**
   * Perform hybrid retrieval combining semantic and BM25 search.
   */
  async retrieve(query: string, options: RetrievalOptions = {}): Promise<RetrievalResponse> {
    const startTime = Date.now();
    const topK = options.topK ?? 10;
    const semanticWeight = options.semanticWeight ?? 0.6;
    const bm25Weight = options.bm25Weight ?? 0.4;
    const minScore = options.minScore ?? 0.3;
    const enableRRF = options.enableRRF ?? true;
    const rrfK = options.rrfK ?? 60;

    // Build filter string for Meilisearch
    const filters: string[] = [];
    if (options.sourceFilter) {
      filters.push(`source = ${options.sourceFilter}`);
    }
    if (options.authorFilter) {
      filters.push(`author = ${options.authorFilter}`);
    }
    const filterStr = filters.length > 0 ? filters.join(' AND ') : undefined;

    // Run both searches in parallel
    const [semanticResults, bm25Results] = await Promise.allSettled([
      this.indexer.searchVector(query, topK * 3), // Over-fetch for better fusion
      this.indexer.searchBM25(query, topK * 3, filterStr),
    ]);

    const semantic = semanticResults.status === 'fulfilled' ? semanticResults.value : [];
    const bm25 = bm25Results.status === 'fulfilled' ? bm25Results.value : null;

    // Convert to ranked items
    const semanticRanked: RankedItem[] = semantic.map((r, i) => ({
      id: r.chunk.id,
      rank: i,
      score: r.score,
    }));

    const bm25Ranked: RankedItem[] = (bm25?.hits ?? []).map((hit, i) => ({
      id: String(hit.id),
      rank: i,
      score: 1 / (i + 1), // Normalize BM25 scores
    }));

    let results: RetrievalResult[];

    if (enableRRF && (semanticRanked.length > 0 || bm25Ranked.length > 0)) {
      // Merge via RRF
      const fused = reciprocalRankFusion(
        semanticRanked,
        bm25Ranked,
        semanticWeight,
        bm25Weight,
        rrfK,
      );

      // Normalize fused scores to 0-1 range
      const maxScore = Math.max(...Array.from(fused.values()).map(v => v.fusedScore), 0.001);

      results = Array.from(fused.entries())
        .map(([id, scores]) => {
          const chunk = this.indexer.getChunk(id);
          if (!chunk) return null;

          return {
            id,
            docId: chunk.docId,
            text: chunk.text,
            score: scores.fusedScore / maxScore,
            semanticRank: scores.semanticRank,
            bm25Rank: scores.bm25Rank,
            semanticScore: scores.semanticScore,
            bm25Score: scores.bm25Score,
            metadata: chunk.metadata,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null)
        .sort((a, b) => b.score - a.score);
    } else if (semanticRanked.length > 0) {
      // Semantic only
      results = semantic.map(r => ({
        id: r.chunk.id,
        docId: r.chunk.docId,
        text: r.chunk.text,
        score: r.score,
        semanticRank: r.score,
        metadata: r.chunk.metadata,
      }));
    } else {
      // BM25 only
      results = bm25Ranked.map(r => {
        const chunk = this.indexer.getChunk(r.id);
        if (!chunk) return null;
        return {
          id: r.id,
          docId: chunk.docId,
          text: chunk.text,
          score: r.score,
          bm25Rank: r.rank + 1,
          metadata: chunk.metadata,
        };
      }).filter((r): r is NonNullable<typeof r> => r !== null);
    }

    // Filter by minimum score
    const filtered = results.filter(r => r.score >= minScore).slice(0, topK);

    return {
      query,
      results: filtered,
      totalCandidates: semanticRanked.length + bm25Ranked.length,
      durationMs: Date.now() - startTime,
      debug: {
        semanticCount: semanticRanked.length,
        bm25Count: bm25Ranked.length,
        mergedCount: results.length,
      },
    };
  }

  /**
   * Retrieve and format as context for an LLM.
   */
  async retrieveAsContext(
    query: string,
    options: RetrievalOptions = {},
  ): Promise<{ context: string; sources: string[] }> {
    const response = await this.retrieve(query, options);

    if (response.results.length === 0) {
      return { context: '', sources: [] };
    }

    const parts = response.results.map((r, i) => {
      const source = `[${i + 1}] ${r.metadata.title} (${r.metadata.source})`;
      return `${source}\n${r.text}`;
    });

    const sources = [...new Set(response.results.map(r => r.metadata.title))];

    return {
      context: parts.join('\n\n---\n\n'),
      sources,
    };
  }
}

/**
 * @anvil/ai/rag — Full RAG Pipeline
 *
 * End-to-end Retrieval-Augmented Generation pipeline:
 *   Query → Retrieve (Hybrid) → Rerank → Generate
 *
 * Supports multiple generation backends (Ollama, OpenAI, custom)
 * and configurable retrieval strategies.
 */

import { DocumentIndexer } from './indexer.js';
import { HybridRetriever, type RetrievalOptions, type RetrievalResult } from './retriever.js';
import type { AIProvider, Message, GenerationOptions, GenerationResult } from '../types.js';

// ── Types ──────────────────────────────────────────────

export interface RAGPipelineConfig {
  /** Document indexer instance */
  indexer: DocumentIndexer;
  /** AI provider for generation */
  provider: AIProvider;
  /** Retrieval options */
  retrieval?: RetrievalOptions;
  /** Model to use for generation */
  generationModel?: string;
  /** System prompt template for RAG generation */
  systemPrompt?: string;
  /** Maximum context length from retrieved chunks (default: 4000 chars) */
  maxContextLength?: number;
  /** Enable reranking (default: true) */
  enableReranking?: boolean;
  /** Number of chunks to retrieve before reranking (default: 20) */
  retrievalDepth?: number;
  /** Number of chunks to keep after reranking (default: 5) */
  rerankTopK?: number;
}

export interface RAGQueryOptions {
  /** Override model */
  model?: string;
  /** Override temperature */
  temperature?: number;
  /** Override max tokens */
  maxTokens?: number;
  /** Retrieval options override */
  retrieval?: RetrievalOptions;
  /** Custom system prompt override */
  systemPrompt?: string;
  /** Include source citations in output */
  includeCitations?: boolean;
  /** Stream results */
  stream?: boolean;
  /** Stream callback */
  onChunk?: (text: string) => void;
}

export interface RAGResponse {
  /** The generated answer */
  answer: string;
  /** Source chunks used */
  sources: Array<{
    id: string;
    docId: string;
    title: string;
    source: string;
    text: string;
    score: number;
  }>;
  /** Model used for generation */
  model: string;
  /** Token usage */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** Pipeline timing */
  timing: {
    retrievalMs: number;
    rerankMs: number;
    generationMs: number;
    totalMs: number;
  };
}

// ── Default System Prompt ──────────────────────────────

const DEFAULT_SYSTEM_PROMPT = `You are an intelligent assistant with access to the user's documents, emails, and files. Answer questions based on the provided context.

Rules:
- Answer based ONLY on the provided context. If the context doesn't contain enough information, say so.
- Cite sources using [N] notation where N matches the source number.
- Be concise and direct.
- If multiple sources provide conflicting information, note the discrepancy.
- Do not fabricate information not present in the context.`;

// ── Reranker ───────────────────────────────────────────

/**
 * Simple relevance-based reranker using cross-attention scoring.
 * For production, replace with a dedicated reranking model (e.g., Cohere Rerank, BGE-Reranker).
 */
class SimpleReranker {
  /**
   * Rerank results by computing a relevance score based on:
   * - Query term overlap
   * - Query term proximity in chunk
   * - Chunk position (earlier chunks in a document are more important)
   */
  rerank(query: string, results: RetrievalResult[], topK: number = 5): RetrievalResult[] {
    const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);

    const scored = results.map(result => {
      const text = result.text.toLowerCase();
      let boost = result.score; // Start with retrieval score

      // Term overlap: how many query terms appear in the chunk
      let overlap = 0;
      for (const term of queryTerms) {
        if (text.includes(term)) overlap++;
      }
      boost *= 1 + (overlap / Math.max(queryTerms.length, 1)) * 0.3;

      // Term proximity: are query terms close together?
      if (queryTerms.length >= 2) {
        let minDist = Infinity;
        for (let i = 0; i < queryTerms.length; i++) {
          for (let j = i + 1; j < queryTerms.length; j++) {
            const idxA = text.indexOf(queryTerms[i]);
            const idxB = text.indexOf(queryTerms[j]);
            if (idxA >= 0 && idxB >= 0) {
              minDist = Math.min(minDist, Math.abs(idxA - idxB));
            }
          }
        }
        if (minDist < Infinity) {
          boost *= 1 + Math.max(0, 1 - minDist / 500) * 0.2;
        }
      }

      // Exact phrase match bonus
      if (text.includes(query.toLowerCase())) {
        boost *= 1.3;
      }

      // Length penalty for very short chunks (likely incomplete)
      if (result.text.length < 50) {
        boost *= 0.7;
      }

      return { result, rerankScore: boost };
    });

    scored.sort((a, b) => b.rerankScore - a.rerankScore);

    return scored.slice(0, topK).map(s => ({
      ...s.result,
      score: s.rerankScore,
    }));
  }
}

// ── RAG Pipeline ──────────────────────────────────────

export class RAGPipeline {
  private config: RAGPipelineConfig;
  private retriever: HybridRetriever;
  private reranker: SimpleReranker;

  constructor(config: RAGPipelineConfig) {
    this.config = config;
    this.retriever = new HybridRetriever(config.indexer);
    this.reranker = new SimpleReranker();
  }

  /**
   * Execute the full RAG pipeline: retrieve → rerank → generate.
   */
  async query(question: string, options: RAGQueryOptions = {}): Promise<RAGResponse> {
    const totalStart = Date.now();

    // 1. Retrieve
    const retrievalStart = Date.now();
    const retrievalOpts: RetrievalOptions = {
      ...this.config.retrieval,
      ...options.retrieval,
      topK: this.config.retrievalDepth ?? 20,
    };

    const retrieval = await this.retriever.retrieve(question, retrievalOpts);
    const retrievalMs = Date.now() - retrievalStart;

    if (retrieval.results.length === 0) {
      return {
        answer: 'I could not find any relevant information to answer your question. Please try rephrasing or indexing more documents.',
        sources: [],
        model: options.model ?? this.config.generationModel ?? 'unknown',
        timing: {
          retrievalMs,
          rerankMs: 0,
          generationMs: 0,
          totalMs: Date.now() - totalStart,
        },
      };
    }

    // 2. Rerank
    const rerankStart = Date.now();
    let ranked: RetrievalResult[];

    if (this.config.enableReranking !== false) {
      ranked = this.reranker.rerank(
        question,
        retrieval.results,
        this.config.rerankTopK ?? 5,
      );
    } else {
      ranked = retrieval.results.slice(0, this.config.rerankTopK ?? 5);
    }

    const rerankMs = Date.now() - rerankStart;

    // 3. Build context
    const maxLen = this.config.maxContextLength ?? 4000;
    let context = '';
    const contextParts: string[] = [];

    for (let i = 0; i < ranked.length; i++) {
      const entry = `<context source="${i + 1}" title="${ranked[i].metadata.title}">\n${ranked[i].text}\n</context>`;
      if (context.length + entry.length > maxLen) break;
      contextParts.push(entry);
      context += entry + '\n\n';
    }

    // 4. Generate
    const genStart = Date.now();
    const systemPrompt = options.systemPrompt ?? this.config.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;

    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Context:\n${context}\n\nQuestion: ${question}` },
    ];

    const genOptions: GenerationOptions = {
      model: options.model ?? this.config.generationModel,
      temperature: options.temperature ?? 0.3,
      maxTokens: options.maxTokens ?? 1024,
      systemPrompt,
    };

    let result: GenerationResult;

    if (options.stream && options.onChunk) {
      result = await this.config.provider.generateStream(messages, (chunk) => {
        if (chunk.delta) options.onChunk!(chunk.delta);
      }, genOptions);
    } else {
      result = await this.config.provider.generate(messages, genOptions);
    }

    const generationMs = Date.now() - genStart;

    // 5. Build response
    const sources = ranked.slice(0, contextParts.length).map(r => ({
      id: r.id,
      docId: r.docId,
      title: r.metadata.title,
      source: r.metadata.source,
      text: r.text.slice(0, 200) + (r.text.length > 200 ? '...' : ''),
      score: Math.round(r.score * 1000) / 1000,
    }));

    return {
      answer: result.text,
      sources,
      model: result.model,
      usage: result.usage,
      timing: {
        retrievalMs,
        rerankMs,
        generationMs,
        totalMs: Date.now() - totalStart,
      },
    };
  }

  /**
   * Quick retrieval only (no generation). Useful for providing context
   * to existing chat conversations.
   */
  async retrieveOnly(
    query: string,
    options: RetrievalOptions = {},
  ): Promise<{ context: string; sources: Array<{ title: string; source: string }> }> {
    const retrieval = await this.retriever.retrieve(query, {
      ...this.config.retrieval,
      ...options,
    });

    if (retrieval.results.length === 0) {
      return { context: '', sources: [] };
    }

    const maxLen = this.config.maxContextLength ?? 4000;
    let context = '';

    for (const r of retrieval.results) {
      const entry = `[${r.metadata.title}] ${r.text}\n`;
      if (context.length + entry.length > maxLen) break;
      context += entry;
    }

    const sources = [...new Map(
      retrieval.results.map(r => [r.metadata.title, { title: r.metadata.title, source: r.metadata.source }])
    ).values()];

    return { context, sources };
  }
}

/**
 * Semantic Memory Index — vector-free semantic search over past conversations.
 *
 * Uses BM25-style keyword scoring + recency weighting to find relevant
 * past conversations without needing a vector DB.
 *
 * The AI can call this to answer "when did we discuss X?" or
 * "what did I decide about Y?" from memory.
 *
 * Client-side only — runs against IndexedDB conversation store.
 */

'use client';

import { listConversations, getConversation } from './memory';
import type { Conversation, ChatMessage } from './types';

// ── Types ──

export interface MemorySearchResult {
  conversationId: string;
  conversationTitle: string;
  matchedMessages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
    snippet: string;
  }>;
  score: number;
  ago: string;
}

// ── Tokenizer ──

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

// ── BM25 parameters ──
const K1 = 1.5;
const B = 0.75;

function bm25Score(
  queryTokens: string[],
  docTokens: string[],
  avgDocLen: number,
): number {
  const docLen = docTokens.length;
  const tf = new Map<string, number>();
  for (const t of docTokens) tf.set(t, (tf.get(t) ?? 0) + 1);

  let score = 0;
  for (const qt of queryTokens) {
    const tfVal = tf.get(qt) ?? 0;
    if (tfVal === 0) continue;
    const idf = Math.log(1.5 + 1 / (1 + 0)); // simplified IDF
    const num = tfVal * (K1 + 1);
    const denom = tfVal + K1 * (1 - B + B * (docLen / avgDocLen));
    score += idf * (num / denom);
  }
  return score;
}

// ── Snippet extractor ──

function extractSnippet(text: string, queryTerms: string[], maxLen = 200): string {
  const lower = text.toLowerCase();
  let bestStart = 0;
  let bestScore = 0;

  // Find the region with the most query term hits
  for (let i = 0; i < text.length - 50; i += 30) {
    const window = lower.slice(i, i + 150);
    const score = queryTerms.filter(t => window.includes(t)).length;
    if (score > bestScore) {
      bestScore = score;
      bestStart = i;
    }
  }

  const raw = text.slice(bestStart, bestStart + maxLen);
  const trimmed = bestStart > 0 ? `…${raw}` : raw;
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) + '…' : trimmed;
}

// ── Time formatting ──

function getTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = diff / 60_000;
  const hours = mins / 60;
  const days = hours / 24;
  const weeks = days / 7;

  if (mins < 60) return `${Math.round(mins)}m ago`;
  if (hours < 24) return `${Math.round(hours)}h ago`;
  if (days < 7) return `${Math.round(days)}d ago`;
  if (weeks < 4) return `${Math.round(weeks)}w ago`;
  return new Date(timestamp).toLocaleDateString();
}

// ── Main search function ──

/**
 * Search past conversations semantically.
 * Returns top-K results sorted by relevance + recency.
 */
export async function searchMemory(
  query: string,
  maxResults = 5,
  options: {
    onlyAfter?: number;      // Only convos updated after this timestamp
    minScore?: number;       // Minimum relevance score (default 0.1)
    includeToolResults?: boolean;
  } = {},
): Promise<MemorySearchResult[]> {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  const minScore = options.minScore ?? 0.1;

  // Load all conversations (lightweight — just IDs + metadata)
  const convList = await listConversations();

  const results: MemorySearchResult[] = [];

  // Calculate average document length for BM25
  let totalTokens = 0;
  let docCount = 0;

  // Process each conversation
  for (const convMeta of convList) {
    if (options.onlyAfter && convMeta.updatedAt < options.onlyAfter) continue;

    let conv: Conversation | null = null;
    try {
      conv = await getConversation(convMeta.id);
    } catch {
      continue;
    }
    if (!conv) continue;

    const relevantMessages = conv.messages.filter(m =>
      (m.role === 'user' || m.role === 'assistant') &&
      m.content.length > 20
    );

    if (relevantMessages.length === 0) continue;

    // Concatenate all message content for BM25
    const docText = relevantMessages.map(m => m.content).join(' ');
    const docTokens = tokenize(docText);
    totalTokens += docTokens.length;
    docCount++;

    const avgDocLen = totalTokens / Math.max(docCount, 1);
    const baseScore = bm25Score(queryTokens, docTokens, Math.max(avgDocLen, 100));

    if (baseScore < minScore) continue;

    // Recency boost: conversations updated more recently get a boost
    const ageMs = Date.now() - (conv.updatedAt ?? 0);
    const ageDays = ageMs / (24 * 60 * 60 * 1000);
    const recencyBoost = Math.max(0, 1 - ageDays / 30) * 0.3; // up to 30% boost for last 30 days

    const finalScore = baseScore * (1 + recencyBoost);

    // Find matched messages
    const matchedMessages = relevantMessages
      .filter(m => {
        const msgTokens = tokenize(m.content);
        return queryTokens.some(qt => msgTokens.includes(qt));
      })
      .slice(-4) // last 4 matching messages
      .map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
        timestamp: m.timestamp,
        snippet: extractSnippet(m.content, queryTokens),
      }));

    if (matchedMessages.length === 0) continue;

    results.push({
      conversationId: conv.id,
      conversationTitle: conv.title ?? 'Untitled conversation',
      matchedMessages,
      score: finalScore,
      ago: getTimeAgo(conv.updatedAt ?? conv.messages[0]?.timestamp ?? 0),
    });
  }

  // Sort by score descending, take top K
  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);
}

// ── Format for AI injection ──

/**
 * Format memory search results into a compact string for injecting
 * into the AI system prompt or as a tool result.
 */
export function formatMemoryResults(results: MemorySearchResult[]): string {
  if (results.length === 0) return 'No relevant past conversations found.';

  return results.map((r, i) => {
    const msgs = r.matchedMessages.slice(0, 2).map(m =>
      `  [${m.role === 'user' ? 'User' : 'AI'}]: ${m.snippet}`
    ).join('\n');
    return `${i + 1}. "${r.conversationTitle}" (${r.ago})\n${msgs}`;
  }).join('\n\n');
}

// ── API endpoint handler (for server-side use) ──

/**
 * Server-compatible: extract key sentences for memory purposes.
 * Used when full IndexedDB access isn't available server-side.
 */
export function extractMemoryableContent(
  messages: ChatMessage[],
  maxItems = 5,
): string[] {
  const MEMORY_PATTERNS = [
    /(?:decided|agreed|will use|going with|chose|picked) (.+?)(?:\.|$)/i,
    /(?:I(?:'ll| will)) (send|draft|schedule|create|book|set up) (.+?)(?:\.|$)/i,
    /(?:deadline|due date|meeting) (?:is|on|at) (.+?)(?:\.|$)/i,
    /(?:remember|keep in mind|note that) (.+?)(?:\.|$)/i,
    /(?:prefer|want|like) (.+?)(?:\.|$)/i,
  ];

  const memorables: string[] = [];

  for (const msg of messages) {
    if (msg.role !== 'assistant' && msg.role !== 'user') continue;
    for (const pattern of MEMORY_PATTERNS) {
      const match = msg.content.match(pattern);
      if (match) {
        const item = match[0].slice(0, 100);
        if (!memorables.includes(item)) {
          memorables.push(item);
        }
      }
    }
    if (memorables.length >= maxItems) break;
  }

  return memorables;
}

/**
 * Search within conversation history.
 * Client-side full-text search with relevance scoring.
 */

import type { Conversation, ChatMessage } from './types';

export interface SearchResult {
  conversationId: string;
  conversationTitle: string;
  messageId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  /** Matched snippet with surrounding context */
  snippet: string;
  /** Relevance score 0-1 */
  score: number;
  timestamp: number;
}

/**
 * Search across all conversations for matching messages.
 */
export function searchConversations(
  conversations: Conversation[],
  query: string,
  limit = 20,
): SearchResult[] {
  if (!query.trim()) return [];

  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const results: SearchResult[] = [];

  for (const conv of conversations) {
    for (const msg of conv.messages) {
      const contentLower = msg.content.toLowerCase();

      // Calculate relevance score
      let score = 0;
      for (const term of terms) {
        const idx = contentLower.indexOf(term);
        if (idx === -1) continue;

        // Base score for matching
        score += 0.3;

        // Bonus for exact phrase match
        if (contentLower.includes(query.toLowerCase())) {
          score += 0.4;
        }

        // Bonus for matching in first 100 chars
        if (idx < 100) {
          score += 0.1;
        }

        // Bonus for user messages (user intent)
        if (msg.role === 'user') {
          score += 0.1;
        }

        // Bonus for recent messages
        const ageHours = (Date.now() - msg.timestamp) / (1000 * 60 * 60);
        if (ageHours < 24) score += 0.1;
        else if (ageHours < 168) score += 0.05;
      }

      if (score > 0) {
        results.push({
          conversationId: conv.id,
          conversationTitle: conv.title,
          messageId: msg.id,
          role: msg.role,
          content: msg.content,
          snippet: createSnippet(msg.content, terms[0], 100),
          score: Math.min(score, 1),
          timestamp: msg.timestamp,
        });
      }
    }
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function createSnippet(text: string, term: string, contextSize: number): string {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(term);
  if (idx === -1) return text.slice(0, contextSize * 2);

  const start = Math.max(0, idx - contextSize);
  const end = Math.min(text.length, idx + term.length + contextSize);
  let snippet = text.slice(start, end);

  if (start > 0) snippet = '...' + snippet;
  if (end < text.length) snippet += '...';

  return snippet;
}

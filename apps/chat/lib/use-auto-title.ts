/**
 * useAutoTitle — automatically generates conversation titles from context.
 *
 * After the first AI response in a new conversation, generates a short
 * descriptive title using local heuristics (no extra API call).
 *
 * Rules:
 * - Strip common prefixes ("can you", "please", "help me", etc.)
 * - Truncate to ~40 chars with ellipsis
 * - Capitalize first letter
 * - For slash commands, use the command name
 */

import { useCallback } from 'react';
import type { Conversation } from '@/lib/types';

const PREFIX_STRIP = /^(hey\s+(?:anvil|ai|assistant)[\s,.]*)?\s*(can\s+you|could\s+you|would\s+you|please|help\s+me|i\s+need|i\s+want|i'm\s+looking\s+for|i'd\s+like|let's|let\s+me)\s+/i;

const SLASH_TITLES: Record<string, string> = {
  '/attention': 'Attention Scan',
  '/draft': 'Draft Reply',
  '/find': 'Find File',
  '/share': 'Find & Share',
  '/schedule': 'Schedule Meeting',
  '/summary': 'Weekly Summary',
  '/compose': 'Compose Email',
  '/search': 'Web Search',
};

export function useAutoTitle() {
  const generateTitle = useCallback((message: string): string => {
    const trimmed = message.trim();

    // Check for slash commands
    const slashMatch = trimmed.match(/^(\/\w+)/);
    if (slashMatch && SLASH_TITLES[slashMatch[1]]) {
      const rest = trimmed.slice(slashMatch[1].length).trim();
      return rest
        ? `${SLASH_TITLES[slashMatch[1]]}: ${rest.slice(0, 25)}`
        : SLASH_TITLES[slashMatch[1]];
    }

    // Strip prefixes
    let cleaned = trimmed.replace(PREFIX_STRIP, '').trim();

    // Remove trailing punctuation
    cleaned = cleaned.replace(/[.!?]+$/, '');

    // Capitalize first letter
    if (cleaned.length > 0) {
      cleaned = cleaned[0].toUpperCase() + cleaned.slice(1);
    }

    // Truncate
    if (cleaned.length > 45) {
      cleaned = cleaned.slice(0, 42) + '...';
    }

    return cleaned || 'New Conversation';
  }, []);

  return { generateTitle };
}

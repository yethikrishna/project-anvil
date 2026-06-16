/**
 * SmartSuggestions — contextual follow-up action chips.
 *
 * Appears below the last AI message with smart suggestions
 * based on what was just discussed, tool results, and context.
 *
 * Features:
 * - Fast rule-based suggestions (instant)
 * - Progressive AI-enhanced suggestions (non-blocking fetch)
 * - Dismissable chips with category coloring
 * - Keyboard accessible
 */

'use client';

import { useEffect, useState, useRef } from 'react';
import { cn } from '@anvil/ui';
import type { ChatMessage, ConversationContext } from '@/lib/types';
import {
  generateSuggestions,
  fetchAISuggestions,
  type Suggestion,
} from '@/lib/suggestions-engine';

interface Props {
  lastMessage: ChatMessage;
  context: ConversationContext;
  onSelect: (text: string) => void;
  className?: string;
}

const CATEGORY_STYLES: Record<Suggestion['category'], string> = {
  action: 'bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/50 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300',
  'follow-up': 'bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300',
  explore: 'bg-gray-50 hover:bg-gray-100 dark:bg-gray-800/50 dark:hover:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300',
  quick: 'bg-purple-50 hover:bg-purple-100 dark:bg-purple-900/30 dark:hover:bg-purple-900/50 border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300',
};

export default function SmartSuggestions({ lastMessage, context, onSelect, className }: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [isEnhancing, setIsEnhancing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!lastMessage || lastMessage.role !== 'assistant') {
      setSuggestions([]);
      return;
    }

    // Immediately show rule-based suggestions
    const initial = generateSuggestions(lastMessage, context);
    setSuggestions(initial);
    setDismissed(new Set());

    // Async: fetch AI-enhanced suggestions (only for substantial responses)
    if (lastMessage.content.length > 50 || (lastMessage.toolCalls ?? []).length > 0) {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsEnhancing(true);
      fetchAISuggestions(lastMessage, context, controller.signal)
        .then(aiSuggestions => {
          if (!controller.signal.aborted && aiSuggestions.length > 0) {
            setSuggestions(aiSuggestions);
          }
        })
        .catch(() => { /* silent fail */ })
        .finally(() => {
          if (!controller.signal.aborted) setIsEnhancing(false);
        });
    }

    return () => {
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastMessage.id]);

  const visible = suggestions.filter(s => !dismissed.has(s.id));
  if (visible.length === 0) return null;

  return (
    <div className={cn('flex flex-wrap gap-1.5 px-4 pb-1', className)}>
      {visible.map(suggestion => (
        <button
          key={suggestion.id}
          onClick={() => onSelect(suggestion.text)}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
            'border transition-all duration-150',
            'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1',
            CATEGORY_STYLES[suggestion.category],
          )}
          title={`Ask: "${suggestion.text}"`}
        >
          <span className="text-sm leading-none">{suggestion.icon}</span>
          <span>{suggestion.text}</span>
        </button>
      ))}

      {isEnhancing && (
        <span className="flex items-center gap-1 px-2.5 py-1 text-xs text-gray-400 dark:text-gray-600">
          <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600 animate-pulse" />
          <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600 animate-pulse" style={{ animationDelay: '150ms' }} />
        </span>
      )}

      <button
        onClick={() => setDismissed(new Set(suggestions.map(s => s.id)))}
        className="px-2 py-1 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        title="Dismiss suggestions"
        aria-label="Dismiss suggestions"
      >
        ×
      </button>
    </div>
  );
}

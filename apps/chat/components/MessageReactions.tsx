/**
 * MessageReactions — emoji reactions for chat messages.
 *
 * Users can react to any message with quick emoji markers:
 * 👍 Helpful  ⭐ Important  💡 Insight  ❓ Question  🔄 Follow-up needed
 *
 * Reactions are:
 * 1. Stored per-message in localStorage
 * 2. Fed back into the AI context accumulator as signals
 * 3. Used to identify which messages matter most
 *
 * This trains the AI's attention: "User marks these types of responses as
 * important → give more detail on similar topics in future."
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import { cn } from '@anvil/ui';

export type ReactionType = '👍' | '⭐' | '💡' | '❓' | '🔄' | '❤️';

export interface MessageReaction {
  type: ReactionType;
  messageId: string;
  timestamp: number;
}

const REACTION_OPTIONS: Array<{ emoji: ReactionType; label: string }> = [
  { emoji: '👍', label: 'Helpful' },
  { emoji: '⭐', label: 'Important' },
  { emoji: '💡', label: 'Insight' },
  { emoji: '❓', label: 'Needs clarification' },
  { emoji: '🔄', label: 'Follow up' },
  { emoji: '❤️', label: 'Love this' },
];

const STORAGE_KEY = 'anvil:message-reactions';

function loadReactions(): Record<string, ReactionType[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as Record<string, ReactionType[]> : {};
  } catch {
    return {};
  }
}

function saveReactions(reactions: Record<string, ReactionType[]>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reactions));
  } catch {}
}

interface Props {
  messageId: string;
  /** Called when a reaction changes — lets parent feed it into context */
  onReaction?: (messageId: string, reactions: ReactionType[]) => void;
  className?: string;
}

export default function MessageReactions({ messageId, onReaction, className }: Props) {
  const [reactions, setReactions] = useState<ReactionType[]>([]);
  const [showPicker, setShowPicker] = useState(false);

  // Load stored reactions on mount
  useEffect(() => {
    const stored = loadReactions();
    setReactions(stored[messageId] ?? []);
  }, [messageId]);

  const toggleReaction = useCallback((emoji: ReactionType) => {
    setReactions(prev => {
      const next = prev.includes(emoji)
        ? prev.filter(r => r !== emoji)
        : [...prev, emoji];

      // Persist
      const all = loadReactions();
      if (next.length === 0) {
        delete all[messageId];
      } else {
        all[messageId] = next;
      }
      saveReactions(all);

      onReaction?.(messageId, next);
      return next;
    });
    setShowPicker(false);
  }, [messageId, onReaction]);

  return (
    <div className={cn('relative inline-flex items-center gap-0.5', className)}>
      {/* Active reactions */}
      {reactions.map(emoji => (
        <button
          key={emoji}
          onClick={() => toggleReaction(emoji)}
          className={cn(
            'text-[11px] px-1.5 py-0.5 rounded-full border transition-all',
            'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800',
            'hover:bg-red-50 dark:hover:bg-red-950/30 hover:border-red-200 dark:hover:border-red-800',
            'active:scale-95',
          )}
          title={`Remove ${REACTION_OPTIONS.find(r => r.emoji === emoji)?.label ?? emoji}`}
        >
          {emoji}
        </button>
      ))}

      {/* Add reaction button */}
      <div className="relative">
        <button
          onClick={() => setShowPicker(v => !v)}
          className={cn(
            'text-[11px] w-5 h-5 rounded-full flex items-center justify-center transition-all',
            showPicker
              ? 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
              : 'text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800',
          )}
          title="Add reaction"
        >
          {reactions.length > 0 ? '+' : '☺'}
        </button>

        {/* Reaction picker */}
        {showPicker && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-40"
              onClick={() => setShowPicker(false)}
            />
            <div className="absolute bottom-7 left-0 z-50 flex items-center gap-0.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl px-2 py-1.5">
              {REACTION_OPTIONS.map(({ emoji, label }) => (
                <button
                  key={emoji}
                  onClick={() => toggleReaction(emoji)}
                  className={cn(
                    'text-base w-8 h-8 rounded-xl flex items-center justify-center transition-all',
                    'hover:bg-gray-100 dark:hover:bg-gray-700 hover:scale-125',
                    reactions.includes(emoji)
                      ? 'bg-blue-100 dark:bg-blue-900/40 scale-110'
                      : '',
                  )}
                  title={label}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Load all reactions for a set of messages — use this to build
 * context for the AI (which messages the user found important).
 */
export function getReactionSummary(messageIds: string[]): string {
  const all = loadReactions();
  const lines: string[] = [];

  for (const id of messageIds) {
    const emojis = all[id];
    if (emojis && emojis.length > 0) {
      lines.push(`Message ${id.slice(-6)}: ${emojis.join(' ')}`);
    }
  }

  if (lines.length === 0) return '';

  const counts: Record<ReactionType, number> = {} as Record<ReactionType, number>;
  for (const emojis of Object.values(all)) {
    for (const e of emojis) counts[e] = (counts[e] ?? 0) + 1;
  }

  const summary = Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .map(([e, n]) => `${e}×${n}`)
    .join(' ');

  return `User reaction patterns: ${summary}. User marks ${counts['⭐'] ?? 0} messages as important and ${counts['🔄'] ?? 0} as needing follow-up.`;
}

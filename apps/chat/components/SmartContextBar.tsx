/**
 * SmartContextBar — proactively surfaces relevant context before the user sends.
 *
 * As the user types in the chat input, this bar watches the draft and
 * shows relevant context chips:
 * - "📧 3 emails about this topic"
 * - "📄 doc: Q3 Strategy.docx"
 * - "📅 meeting with Bob on Friday"
 *
 * Clicking a chip injects context into the AI's system prompt for the
 * next message — making responses dramatically more accurate.
 *
 * Uses debounced AI intent detection on the input draft.
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { cn } from '@anvil/ui';

export interface ContextChip {
  id: string;
  type: 'email' | 'file' | 'event' | 'person' | 'memory';
  label: string;
  detail?: string;
  ref?: string;        // threadId, fileId, eventId, etc.
  injectionText: string; // text to inject into the conversation
}

interface Props {
  draft: string;
  onInject: (chip: ContextChip) => void;
  className?: string;
}

const TYPE_ICONS: Record<ContextChip['type'], string> = {
  email: '📧',
  file: '📄',
  event: '📅',
  person: '👤',
  memory: '🧠',
};

const TYPE_COLORS: Record<ContextChip['type'], string> = {
  email: 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300',
  file: 'border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-300',
  event: 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300',
  person: 'border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300',
  memory: 'border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300',
};

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

async function fetchContextChips(draft: string): Promise<ContextChip[]> {
  if (!draft || draft.trim().length < 8) return [];

  try {
    const res = await fetch('/api/context/suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draft: draft.slice(0, 500) }),
    });
    if (!res.ok) return [];
    const data = await res.json() as { chips: ContextChip[] };
    return data.chips ?? [];
  } catch {
    return [];
  }
}

export default function SmartContextBar({ draft, onInject, className }: Props) {
  const [chips, setChips] = useState<ContextChip[]>([]);
  const [loading, setLoading] = useState(false);
  const [injected, setInjected] = useState<Set<string>>(new Set());
  const debouncedDraft = useDebounce(draft, 800);
  const lastDraftRef = useRef('');

  useEffect(() => {
    const trimmed = debouncedDraft.trim();
    if (trimmed === lastDraftRef.current) return;
    lastDraftRef.current = trimmed;

    if (trimmed.length < 8) {
      setChips([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetchContextChips(trimmed).then(newChips => {
      if (!cancelled) {
        setChips(newChips);
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [debouncedDraft]);

  const handleInject = useCallback((chip: ContextChip) => {
    setInjected(prev => new Set([...prev, chip.id]));
    onInject(chip);
  }, [onInject]);

  // Reset injected state when draft clears
  useEffect(() => {
    if (!draft.trim()) {
      setInjected(new Set());
      setChips([]);
    }
  }, [draft]);

  if (chips.length === 0 && !loading) return null;

  return (
    <div className={cn('flex items-center gap-1.5 px-3 py-1.5 flex-wrap', className)}>
      {loading && chips.length === 0 && (
        <span className="text-[10px] text-gray-400 dark:text-gray-500 animate-pulse">
          Finding relevant context…
        </span>
      )}

      {chips.map(chip => {
        const isInjected = injected.has(chip.id);
        return (
          <button
            key={chip.id}
            onClick={() => !isInjected && handleInject(chip)}
            disabled={isInjected}
            className={cn(
              'flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg border transition-all',
              isInjected
                ? 'opacity-50 cursor-default bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-400'
                : TYPE_COLORS[chip.type],
            )}
            title={chip.detail ?? chip.label}
          >
            <span>{TYPE_ICONS[chip.type]}</span>
            <span className="max-w-[140px] truncate font-medium">
              {isInjected ? '✓ ' : ''}{chip.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * ThinkingDisplay — Collapsible reasoning/thinking panel.
 *
 * Shows the AI's chain-of-thought reasoning process (like Claude extended
 * thinking or o1 reasoning) in a polished collapsible panel.
 *
 * Features:
 * - Animated typewriter reveal for streaming thinking
 * - Collapsed by default — click to expand
 * - Word count + estimated reasoning time
 * - Purple gradient styling to distinguish from response
 * - "Thinking..." shimmer animation while streaming
 */

'use client';

import { useState, useEffect, useRef } from 'react';
import { cn } from '@anvil/ui';

interface Props {
  thinking: string;
  isStreaming?: boolean;
  className?: string;
}

export default function ThinkingDisplay({ thinking, isStreaming = false, className }: Props) {
  const [expanded, setExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Auto-expand while streaming
  useEffect(() => {
    if (isStreaming) setExpanded(true);
    else if (!thinking) setExpanded(false);
  }, [isStreaming, thinking]);

  if (!thinking && !isStreaming) return null;

  const wordCount = thinking.trim().split(/\s+/).filter(Boolean).length;
  const estSeconds = Math.max(1, Math.round(wordCount / 150)); // ~150 wpm read speed

  return (
    <div
      className={cn(
        'rounded-xl border border-purple-200/60 dark:border-purple-800/40 overflow-hidden',
        'bg-gradient-to-br from-purple-50/80 to-indigo-50/40 dark:from-purple-950/20 dark:to-indigo-950/10',
        className,
      )}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(prev => !prev)}
        className={cn(
          'w-full flex items-center gap-2.5 px-4 py-2.5 text-left',
          'hover:bg-purple-100/50 dark:hover:bg-purple-900/20 transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400',
        )}
        aria-expanded={expanded}
      >
        {/* Brain icon */}
        <span className="text-base">🧠</span>

        {/* Label */}
        <span className="text-sm font-semibold text-purple-700 dark:text-purple-300 flex items-center gap-1.5">
          {isStreaming ? (
            <>
              <ThinkingShimmer />
              Thinking…
            </>
          ) : (
            'Reasoning'
          )}
        </span>

        {/* Stats */}
        {!isStreaming && wordCount > 0 && (
          <span className="ml-auto text-xs text-purple-500/70 dark:text-purple-400/60 tabular-nums">
            {wordCount} words · ~{estSeconds}s
          </span>
        )}

        {/* Chevron */}
        <ChevronIcon
          className={cn(
            'ml-auto w-4 h-4 text-purple-400 transition-transform duration-200',
            isStreaming && 'ml-0',
            expanded && 'rotate-180',
          )}
        />
      </button>

      {/* Expandable content */}
      <div
        className={cn(
          'overflow-hidden transition-all duration-300 ease-in-out',
          expanded ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0',
        )}
      >
        <div
          ref={contentRef}
          className={cn(
            'px-4 pb-4 pt-1',
            'text-sm text-purple-900/80 dark:text-purple-100/70 leading-relaxed',
            'font-mono whitespace-pre-wrap break-words',
            'max-h-96 overflow-y-auto',
            'scrollbar-thin scrollbar-thumb-purple-200 dark:scrollbar-thumb-purple-800',
          )}
        >
          {thinking || (isStreaming ? '...' : '')}
          {isStreaming && (
            <span className="inline-block w-1 h-4 bg-purple-400 animate-pulse ml-0.5 translate-y-0.5" />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ThinkingShimmer() {
  return (
    <span className="inline-flex gap-0.5 items-center">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="w-1 h-1 rounded-full bg-purple-400 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polyline points="4 6 8 10 12 6" />
    </svg>
  );
}

/**
 * AttentionBadge — live notification dot in the chat header showing
 * how many urgent items need the user's attention.
 *
 * Clicking opens an inline popover with the top items, each with
 * an "Ask AI" button that injects a prompt into the chat.
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@anvil/ui';
import type { AttentionItem } from '@/lib/use-attention-badge';

interface Props {
  badgeCount: number;
  urgentItems: AttentionItem[];
  isLoading: boolean;
  lastFetched: number | null;
  onAskAI: (prompt: string) => void;
  onRefresh: () => void;
}

const SOURCE_ICONS: Record<AttentionItem['source'], string> = {
  mail: '✉️',
  calendar: '📅',
  drive: '📄',
  other: '📌',
};

const PRIORITY_COLORS: Record<AttentionItem['priority'], string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-400',
  medium: 'bg-yellow-400',
};

export default function AttentionBadge({
  badgeCount,
  urgentItems,
  isLoading,
  lastFetched,
  onAskAI,
  onRefresh,
}: Props) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node) &&
          !buttonRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const topItems = urgentItems.slice(0, 6);
  const hasItems = topItems.length > 0;

  return (
    <div className="relative">
      {/* Badge button */}
      <button
        ref={buttonRef}
        onClick={() => setOpen(o => !o)}
        className={cn(
          'relative w-8 h-8 rounded-lg flex items-center justify-center text-base transition-all',
          open
            ? 'bg-orange-100 dark:bg-orange-950 text-orange-600'
            : badgeCount > 0
              ? 'text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-950/50'
              : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800',
        )}
        title="Attention items"
      >
        <span>⚡</span>
        {badgeCount > 0 && (
          <span className={cn(
            'absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 px-0.5',
            'text-[9px] font-bold text-white rounded-full flex items-center justify-center',
            badgeCount > 0 ? 'bg-red-500' : 'bg-gray-400',
          )}>
            {badgeCount > 9 ? '9+' : badgeCount}
          </span>
        )}
        {isLoading && badgeCount === 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-blue-400 rounded-full animate-pulse" />
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          ref={panelRef}
          className={cn(
            'absolute right-0 top-10 z-50 w-80',
            'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700',
            'rounded-xl shadow-xl overflow-hidden',
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">Attention</span>
              {badgeCount > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400 rounded-full font-medium">
                  {badgeCount} urgent
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {lastFetched && (
                <span className="text-[9px] text-gray-400">
                  {Math.round((Date.now() - lastFetched) / 60000)}m ago
                </span>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); onRefresh(); }}
                disabled={isLoading}
                className="w-6 h-6 rounded flex items-center justify-center text-xs text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50"
                title="Refresh"
              >
                {isLoading ? <span className="animate-spin">⟳</span> : '⟳'}
              </button>
            </div>
          </div>

          {/* Items */}
          {!hasItems && !isLoading && (
            <div className="px-3 py-6 text-center">
              <p className="text-2xl mb-1">✅</p>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">All clear!</p>
              <p className="text-xs text-gray-400 mt-0.5">No urgent items right now.</p>
            </div>
          )}

          {isLoading && !hasItems && (
            <div className="px-3 py-6 text-center">
              <div className="inline-flex gap-1 items-center text-xs text-gray-400">
                <span className="animate-pulse">Scanning Mail & Calendar...</span>
              </div>
            </div>
          )}

          {topItems.map((item) => (
            <div
              key={item.id}
              className="px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 border-b border-gray-50 dark:border-gray-800/50 last:border-0 transition-colors"
            >
              <div className="flex items-start gap-2">
                <span className="text-base shrink-0 mt-0.5">{SOURCE_ICONS[item.source]}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className={cn(
                      'w-1.5 h-1.5 rounded-full shrink-0',
                      PRIORITY_COLORS[item.priority],
                    )} />
                    <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">
                      {item.label}
                    </p>
                  </div>
                  {item.detail && (
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 line-clamp-2">
                      {item.detail}
                    </p>
                  )}
                  {item.actionPrompt && (
                    <button
                      onClick={() => {
                        onAskAI(item.actionPrompt!);
                        setOpen(false);
                      }}
                      className="mt-1 text-[10px] text-blue-600 dark:text-blue-400 hover:underline font-medium"
                    >
                      Ask AI →
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Footer CTA */}
          <div className="px-3 py-2 border-t border-gray-100 dark:border-gray-800">
            <button
              onClick={() => {
                onAskAI('What needs my attention right now? Give me a full priority digest of my unread emails and upcoming calendar events.');
                setOpen(false);
              }}
              className="w-full text-center text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 py-1"
            >
              Full attention scan →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

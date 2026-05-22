/**
 * AttentionPanel — priority digest sidebar showing what needs attention.
 *
 * Scans Mail + Calendar, AI-prioritizes, and returns ranked items
 * with suggested actions. Supports filtering by type and priority.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn } from '@anvil/ui';
import type { AttentionItem } from '@/lib/types';
import { PRIORITY_CONFIG } from '@/lib/types';

interface Props {
  onAction: (action: string, args: Record<string, unknown>) => void;
  onClose: () => void;
}

type FilterType = 'all' | 'email' | 'calendar' | 'action';
type FilterPriority = 'all' | 'urgent' | 'high' | 'medium' | 'low';

export default function AttentionPanel({ onAction, onClose }: Props) {
  const [items, setItems] = useState<AttentionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [filterPriority, setFilterPriority] = useState<FilterPriority>('all');
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchAttention = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/attention');
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = await res.json();
      setItems(data.items ?? []);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAttention(); }, [fetchAttention]);

  // Filter items
  const filtered = items.filter(item => {
    if (filterType !== 'all' && item.type !== filterType) return false;
    if (filterPriority !== 'all' && item.priority !== filterPriority) return false;
    return true;
  });

  // Priority counts
  const counts = {
    urgent: items.filter(i => i.priority === 'urgent').length,
    high: items.filter(i => i.priority === 'high').length,
    medium: items.filter(i => i.priority === 'medium').length,
    low: items.filter(i => i.priority === 'low').length,
  };

  const typeIcons: Record<string, string> = {
    email: '✉️',
    calendar: '📅',
    action: '📋',
  };

  return (
    <div className="w-80 border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 flex flex-col shrink-0">
      {/* Header */}
      <div className="p-3 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-sm flex items-center gap-1.5">
            <span>⚡</span> Needs Attention
          </h3>
          <div className="flex items-center gap-1">
            <button
              onClick={fetchAttention}
              disabled={loading}
              className={cn(
                'text-xs text-gray-400 hover:text-gray-600 px-1.5 py-0.5 rounded transition-colors',
                loading && 'animate-pulse',
              )}
              title="Refresh"
            >
              ⟳
            </button>
            <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-600 px-1">✕</button>
          </div>
        </div>

        {/* Priority summary */}
        {!loading && items.length > 0 && (
          <div className="flex gap-2 text-[10px] mb-2">
            {counts.urgent > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400 font-medium">
                {counts.urgent} urgent
              </span>
            )}
            {counts.high > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-orange-100 dark:bg-orange-950 text-orange-600 dark:text-orange-400 font-medium">
                {counts.high} high
              </span>
            )}
            <span className="text-gray-400">
              {items.length} total
            </span>
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-1">
          <div className="flex gap-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
            {(['all', 'email', 'calendar', 'action'] as FilterType[]).map(t => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={cn(
                  'text-[10px] px-2 py-0.5 rounded-md transition-colors',
                  filterType === t
                    ? 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700',
                )}
              >
                {t === 'all' ? 'All' : typeIcons[t]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto chat-scroll">
        {loading ? (
          <div className="p-6 text-center">
            <div className="flex justify-center gap-1 mb-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <p className="text-xs text-gray-400">Scanning inbox & calendar...</p>
          </div>
        ) : error ? (
          <div className="p-4 text-center">
            <p className="text-xs text-red-500 mb-2">{error}</p>
            <button
              onClick={fetchAttention}
              className="text-xs text-blue-500 hover:underline"
            >
              Try again
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-center">
            <span className="text-2xl">✨</span>
            <p className="text-sm text-gray-500 mt-2">
              {items.length === 0 ? 'All clear! Nothing needs your attention.' : 'No items match your filters.'}
            </p>
            {lastRefresh && (
              <p className="text-[10px] text-gray-400 mt-1">
                Last checked {lastRefresh.toLocaleTimeString()}
              </p>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {filtered.map((item) => {
              const config = PRIORITY_CONFIG[item.priority];
              return (
                <div
                  key={item.id}
                  className={cn(
                    'p-3 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors',
                    item.priority === 'urgent' && 'border-l-2 border-l-red-500',
                    item.priority === 'high' && 'border-l-2 border-l-orange-500',
                  )}
                >
                  {/* Header */}
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-xs">{typeIcons[item.type] ?? '📋'}</span>
                    <span className={cn(
                      'text-[9px] font-semibold uppercase px-1 py-0.5 rounded',
                      config.color,
                    )}>
                      {config.label}
                    </span>
                    {item.timestamp && (
                      <span className="text-[9px] text-gray-400 ml-auto">
                        {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>

                  {/* Content */}
                  <p className="text-xs font-medium text-gray-800 dark:text-gray-200 leading-snug">
                    {item.title}
                  </p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                    {item.summary}
                  </p>

                  {/* Actions */}
                  {item.actions && item.actions.length > 0 && (
                    <div className="flex gap-1.5 mt-2">
                      {item.actions.slice(0, 3).map((action, i) => (
                        <button
                          key={i}
                          onClick={() => onAction(action.tool, action.args)}
                          className={cn(
                            'text-[10px] px-2 py-1 rounded-md transition-colors font-medium',
                            i === 0
                              ? 'bg-blue-600 text-white hover:bg-blue-700'
                              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700',
                          )}
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      {lastRefresh && (
        <div className="p-2 border-t border-gray-100 dark:border-gray-800 text-[9px] text-gray-400 text-center">
          Auto-refreshes every 30 min · Last: {lastRefresh.toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}

/**
 * AttentionPanel — priority digest sidebar showing what needs attention.
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

export default function AttentionPanel({ onAction, onClose }: Props) {
  const [items, setItems] = useState<AttentionItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAttention = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/attention');
      const data = await res.json();
      setItems(data.items ?? []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAttention(); }, [fetchAttention]);

  return (
    <div className="w-80 border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 flex flex-col shrink-0">
      <div className="p-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
        <h3 className="font-semibold text-sm">⚡ Needs Attention</h3>
        <div className="flex items-center gap-1">
          <button onClick={fetchAttention} className="text-xs text-gray-400 hover:text-gray-600" title="Refresh">
            ⟳
          </button>
          <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto chat-scroll">
        {loading ? (
          <div className="p-4 text-center text-gray-400 text-sm animate-pulse">Scanning your inbox and calendar...</div>
        ) : items.length === 0 ? (
          <div className="p-4 text-center text-gray-400 text-sm">
            All clear! Nothing urgent right now.
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {items.map((item) => {
              const config = PRIORITY_CONFIG[item.priority];
              return (
                <div key={item.id} className={cn('p-3 hover:bg-gray-50 dark:hover:bg-gray-900', config.bg)}>
                  <div className="flex items-start gap-2">
                    <span className={cn('text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded', config.color)}>
                      {config.label}
                    </span>
                    <span className="text-[10px] text-gray-400">
                      {item.type === 'email' ? '✉️' : item.type === 'calendar' ? '📅' : '📋'}
                    </span>
                  </div>
                  <p className="text-sm font-medium mt-1">{item.title}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{item.summary}</p>
                  {item.actions && item.actions.length > 0 && (
                    <div className="flex gap-1.5 mt-2">
                      {item.actions.map((action, i) => (
                        <button
                          key={i}
                          onClick={() => onAction(action.tool, action.args)}
                          className="text-[10px] px-2 py-1 rounded-md bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors"
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
    </div>
  );
}

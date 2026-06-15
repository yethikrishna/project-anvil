/**
 * PinnedMessages — slide-in panel showing all pinned messages in a conversation.
 *
 * Features:
 * - Lists pinned messages sorted by time
 * - Click to scroll to message (parent passes ref map)
 * - Unpin from here
 * - Quick copy
 */

'use client';

import { useMemo } from 'react';
import type { ChatMessage } from '@/lib/types';

interface Props {
  messages: ChatMessage[];
  onClose: () => void;
  onUnpin: (id: string) => void;
  onScrollTo?: (id: string) => void;
}

function truncate(s: string, max: number) {
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

export default function PinnedMessages({ messages, onClose, onUnpin, onScrollTo }: Props) {
  const pinned = useMemo(
    () => messages.filter(m => m.pinned).sort((a, b) => a.timestamp - b.timestamp),
    [messages],
  );

  return (
    <div className="w-72 border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 flex flex-col shrink-0">
      {/* Header */}
      <div className="h-11 flex items-center justify-between px-4 border-b border-gray-200 dark:border-gray-800 shrink-0">
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
          📌 Pinned
          {pinned.length > 0 && (
            <span className="text-[10px] bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded-full font-medium">
              {pinned.length}
            </span>
          )}
        </span>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-sm"
        >
          ✕
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {pinned.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-2xl mb-2">📌</p>
            <p className="text-xs text-gray-400">No pinned messages</p>
            <p className="text-[10px] text-gray-400 mt-1">
              Hover a message and click the pin icon to save it here
            </p>
          </div>
        ) : (
          pinned.map(msg => (
            <div
              key={msg.id}
              className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 overflow-hidden hover:border-amber-300 dark:hover:border-amber-700 transition-colors cursor-pointer"
              onClick={() => onScrollTo?.(msg.id)}
            >
              <div className="px-3 py-2.5">
                {/* Role badge */}
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                    msg.role === 'user'
                      ? 'bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400'
                      : 'bg-purple-100 dark:bg-purple-950 text-purple-600 dark:text-purple-400'
                  }`}>
                    {msg.role === 'user' ? 'You' : 'Anvil'}
                  </span>
                  <span className="text-[10px] text-gray-400">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                {/* Content */}
                <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed line-clamp-3">
                  {truncate(msg.content, 180)}
                </p>

                {/* Actions */}
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard.writeText(msg.content);
                    }}
                    className="text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    Copy
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onUnpin(msg.id);
                    }}
                    className="text-[10px] text-gray-400 hover:text-red-500 ml-auto"
                  >
                    Unpin
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

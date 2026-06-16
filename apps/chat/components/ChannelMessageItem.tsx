'use client';

/**
 * ChannelMessage component — single message in a channel.
 *
 * Features:
 * - User avatar + name + timestamp
 * - Reaction bar with toggle
 * - Edit indicator
 * - Thread reply count
 * - Hover actions (react, reply, edit, delete)
 */

import { useState } from 'react';
import type { ChannelMessage } from '@/lib/channels-db';

function formatDistanceToNow(ts: number): string {
  const diffMs = Date.now() - ts;
  const diffMin = diffMs / 60_000;
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${Math.floor(diffMin)}m ago`;
  if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h ago`;
  return `${Math.floor(diffMin / 1440)}d ago`;
}

const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '😮', '😢'];

function formatTime(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = diffMs / 60_000;

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${Math.floor(diffMin)}m ago`;
  if (diffMin < 1440) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function getInitials(name: string) {
  return name
    .split(/[\s_-]/)
    .slice(0, 2)
    .map(p => p[0]?.toUpperCase() ?? '')
    .join('');
}

function avatarColor(userId: string) {
  const colors = [
    'bg-violet-500', 'bg-blue-500', 'bg-emerald-500', 'bg-orange-500',
    'bg-rose-500', 'bg-cyan-500', 'bg-amber-500', 'bg-pink-500',
  ];
  let hash = 0;
  for (const c of userId) hash = (hash * 31 + c.charCodeAt(0)) % colors.length;
  return colors[hash];
}

interface ChannelMessageItemProps {
  message: ChannelMessage;
  currentUserId: string;
  onReact: (messageId: string, emoji: string) => void;
  onReply: (message: ChannelMessage) => void;
  onEdit?: (message: ChannelMessage) => void;
  onDelete?: (messageId: string) => void;
  isCompact?: boolean; // Same user, consecutive — omit avatar
}

export default function ChannelMessageItem({
  message,
  currentUserId,
  onReact,
  onReply,
  onEdit,
  onDelete,
  isCompact = false,
}: ChannelMessageItemProps) {
  const [showActions, setShowActions] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);

  const isOwn = message.userId === currentUserId;
  const displayName = message.displayName ?? message.userId;

  const hasReactions = Object.keys(message.reactions ?? {}).length > 0;

  return (
    <div
      className={`group relative flex gap-3 px-4 hover:bg-white/5 transition-colors ${isCompact ? 'py-0.5' : 'pt-3 pb-1'}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => { setShowActions(false); setShowReactionPicker(false); }}
    >
      {/* Avatar */}
      <div className="w-8 flex-shrink-0 mt-0.5">
        {!isCompact && (
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white ${avatarColor(message.userId)}`}>
            {getInitials(displayName)}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {!isCompact && (
          <div className="flex items-baseline gap-2 mb-0.5">
            <span className="font-semibold text-sm text-gray-200">{displayName}</span>
            <span className="text-[11px] text-gray-500">{formatTime(message.createdAt)}</span>
            {message.editedAt && (
              <span className="text-[10px] text-gray-600 italic">(edited)</span>
            )}
          </div>
        )}

        {/* Message body */}
        {message.type === 'ai' ? (
          <div className="text-sm text-gray-200 leading-relaxed bg-violet-500/10 border border-violet-500/20 rounded-lg px-3 py-2">
            <span className="text-violet-400 text-xs font-medium mb-1 block">✦ Anvil AI</span>
            <span className="whitespace-pre-wrap">{message.content}</span>
          </div>
        ) : message.type === 'system' ? (
          <div className="text-xs text-gray-500 italic">{message.content}</div>
        ) : (
          <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap break-words">
            {message.content}
          </p>
        )}

        {/* Thread count */}
        {(message.threadCount ?? 0) > 0 && (
          <button
            onClick={() => onReply(message)}
            className="mt-1 text-xs text-blue-400 hover:text-blue-300 hover:underline"
          >
            {message.threadCount} {message.threadCount === 1 ? 'reply' : 'replies'}
          </button>
        )}

        {/* Reactions */}
        {hasReactions && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {Object.entries(message.reactions).map(([emoji, users]) => {
              const isMine = users.includes(currentUserId);
              return (
                <button
                  key={emoji}
                  onClick={() => onReact(message.id, emoji)}
                  className={`
                    flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-all
                    ${isMine
                      ? 'bg-violet-500/20 border-violet-500/50 text-violet-300'
                      : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'}
                  `}
                >
                  <span>{emoji}</span>
                  <span>{users.length}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Hover actions */}
      {showActions && (
        <div className="absolute right-4 top-1 flex items-center gap-1 bg-gray-800 border border-gray-700 rounded-lg px-1 py-0.5 shadow-lg z-10">
          {/* Quick reactions */}
          <div className="relative">
            <button
              onClick={() => setShowReactionPicker(p => !p)}
              className="p-1.5 hover:bg-gray-700 rounded text-sm"
              title="React"
            >
              😊
            </button>
            {showReactionPicker && (
              <div className="absolute right-0 bottom-full mb-1 flex gap-1 bg-gray-800 border border-gray-700 rounded-lg p-1 shadow-xl">
                {QUICK_REACTIONS.map(e => (
                  <button
                    key={e}
                    onClick={() => { onReact(message.id, e); setShowReactionPicker(false); }}
                    className="p-1 hover:bg-gray-700 rounded text-base"
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={() => onReply(message)}
            className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-gray-200"
            title="Reply in thread"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
          </button>

          {isOwn && onEdit && (
            <button
              onClick={() => onEdit(message)}
              className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-gray-200"
              title="Edit"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          )}

          {isOwn && onDelete && (
            <button
              onClick={() => onDelete(message.id)}
              className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-red-400"
              title="Delete"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

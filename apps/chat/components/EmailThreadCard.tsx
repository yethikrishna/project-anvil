/**
 * EmailThreadCard — renders an email thread inline in the chat.
 *
 * Displayed when the AI fetches email data, showing a rich card
 * with sender, subject, preview, and quick-action buttons.
 */

'use client';

import { useState } from 'react';
import { cn } from '@anvil/ui';

export interface EmailMessage {
  id: string;
  from: string;
  fromName?: string;
  to: string | string[];
  subject: string;
  snippet: string;
  body?: string;
  date: string;
  unread?: boolean;
  labels?: string[];
  attachments?: Array<{ name: string; size: string }>;
}

export interface EmailThread {
  threadId: string;
  subject: string;
  messages: EmailMessage[];
  unreadCount?: number;
}

interface Props {
  thread?: EmailThread;
  messages?: EmailMessage[];
  onReply?: (threadId: string) => void;
  onForward?: (threadId: string) => void;
  onArchive?: (threadId: string) => void;
  onScheduleFollowUp?: (threadId: string) => void;
  compact?: boolean;
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('');
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const hours = diff / (1000 * 60 * 60);
    const days = diff / (1000 * 60 * 60 * 24);

    if (hours < 1) return 'Just now';
    if (hours < 24) return `${Math.floor(hours)}h ago`;
    if (days < 7) return `${Math.floor(days)}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

const AVATAR_COLORS = [
  'from-blue-500 to-blue-700',
  'from-purple-500 to-purple-700',
  'from-emerald-500 to-emerald-700',
  'from-orange-500 to-orange-700',
  'from-rose-500 to-rose-700',
  'from-cyan-500 to-cyan-700',
];

function avatarColor(name: string): string {
  const hash = [...name].reduce((h, c) => h + c.charCodeAt(0), 0);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function EmailMessageCard({
  message,
  isExpanded,
  onToggle,
  isLast,
}: {
  message: EmailMessage;
  isExpanded: boolean;
  onToggle: () => void;
  isLast: boolean;
}) {
  const senderName = message.fromName ?? message.from.split('@')[0];
  const initials = getInitials(senderName);

  return (
    <div className={cn(
      'border-b border-gray-100 dark:border-gray-800 last:border-0',
      message.unread && !isExpanded && 'bg-blue-50/30 dark:bg-blue-950/10',
    )}>
      {/* Collapsed header */}
      <button
        onClick={onToggle}
        className="w-full flex items-start gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors text-left"
      >
        {/* Avatar */}
        <div className={cn(
          'w-8 h-8 rounded-full bg-gradient-to-br flex items-center justify-center text-white text-xs font-bold shrink-0',
          avatarColor(senderName),
        )}>
          {initials}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className={cn(
              'text-xs font-medium truncate',
              message.unread ? 'text-gray-900 dark:text-gray-100' : 'text-gray-600 dark:text-gray-400',
            )}>
              {senderName}
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              {message.attachments && message.attachments.length > 0 && (
                <span className="text-[10px] text-gray-400">📎</span>
              )}
              <span className="text-[10px] text-gray-400">{formatDate(message.date)}</span>
              {message.unread && (
                <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
              )}
            </div>
          </div>
          {!isExpanded && (
            <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate mt-0.5">
              {message.snippet}
            </p>
          )}
        </div>

        <svg
          className={cn('w-4 h-4 text-gray-400 shrink-0 transition-transform', isExpanded && 'rotate-180')}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Expanded body */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* Meta */}
          <div className="text-[10px] text-gray-400 space-y-0.5">
            <div><span className="font-medium text-gray-500">From:</span> {message.fromName ? `${message.fromName} <${message.from}>` : message.from}</div>
            <div><span className="font-medium text-gray-500">To:</span> {Array.isArray(message.to) ? message.to.join(', ') : message.to}</div>
            <div><span className="font-medium text-gray-500">Date:</span> {message.date}</div>
          </div>

          {/* Body */}
          {message.body ? (
            <div className="text-xs text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 rounded-lg p-3 max-h-60 overflow-y-auto leading-relaxed whitespace-pre-wrap font-[inherit]">
              {message.body}
            </div>
          ) : (
            <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">{message.snippet}</p>
          )}

          {/* Attachments */}
          {message.attachments && message.attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {message.attachments.map((att, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 text-[10px] text-gray-600 dark:text-gray-400"
                >
                  <span>📎</span>
                  <span className="max-w-[120px] truncate">{att.name}</span>
                  <span className="text-gray-400">{att.size}</span>
                </div>
              ))}
            </div>
          )}

          {/* Labels */}
          {message.labels && message.labels.filter(l => !['INBOX', 'UNREAD'].includes(l)).length > 0 && (
            <div className="flex gap-1">
              {message.labels
                .filter(l => !['INBOX', 'UNREAD'].includes(l))
                .slice(0, 3)
                .map(label => (
                  <span key={label} className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                    {label.replace('Category_', '')}
                  </span>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function EmailThreadCard({
  thread,
  messages,
  onReply,
  onForward,
  onArchive,
  onScheduleFollowUp,
  compact = false,
}: Props) {
  const allMessages = thread?.messages ?? messages ?? [];
  const subject = thread?.subject ?? allMessages[0]?.subject ?? 'Email Thread';
  const threadId = thread?.threadId ?? allMessages[0]?.id ?? '';
  const [expandedIdx, setExpandedIdx] = useState<Set<number>>(
    new Set(compact ? [] : [allMessages.length - 1])
  );
  const [allExpanded, setAllExpanded] = useState(!compact);

  if (allMessages.length === 0) return null;

  const toggleMsg = (idx: number) => {
    setExpandedIdx(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const toggleAll = () => {
    if (allExpanded) {
      setExpandedIdx(new Set());
      setAllExpanded(false);
    } else {
      setExpandedIdx(new Set(allMessages.map((_, i) => i)));
      setAllExpanded(true);
    }
  };

  const unreadCount = allMessages.filter(m => m.unread).length;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-900 shadow-sm my-2">
      {/* Thread header */}
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm">📧</span>
          <div className="min-w-0">
            <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">{subject}</h3>
            <p className="text-[10px] text-gray-500">
              {allMessages.length} message{allMessages.length !== 1 ? 's' : ''}
              {unreadCount > 0 && ` · ${unreadCount} unread`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={toggleAll}
            className="text-[10px] px-2 py-1 rounded-lg text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            {allExpanded ? 'Collapse' : 'Expand all'}
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {allMessages.map((msg, i) => (
          <EmailMessageCard
            key={msg.id}
            message={msg}
            isExpanded={expandedIdx.has(i)}
            onToggle={() => toggleMsg(i)}
            isLast={i === allMessages.length - 1}
          />
        ))}
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-1 px-3 py-2 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
        {onReply && (
          <button
            onClick={() => onReply(threadId)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors"
          >
            ↩ Reply
          </button>
        )}
        {onForward && (
          <button
            onClick={() => onForward(threadId)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            ↗ Forward
          </button>
        )}
        {onScheduleFollowUp && (
          <button
            onClick={() => onScheduleFollowUp(threadId)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            📅 Follow-up
          </button>
        )}
        {onArchive && (
          <button
            onClick={() => onArchive(threadId)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors ml-auto"
            title="Archive"
          >
            📦 Archive
          </button>
        )}
      </div>
    </div>
  );
}

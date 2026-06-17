/**
 * SmartReplyPanel — generates and shows 3 ready-to-send reply options
 * whenever the AI reads an email thread.
 *
 * Appears inline below email_read_thread tool result cards.
 * Each chip shows the label; clicking it opens a mini editor so the
 * user can review/tweak before sending.
 *
 * Features:
 * - Instant generation on mount (< 3s typical)
 * - 3 reply lengths: Quick / Standard / Detailed
 * - Sentiment indicator (positive, neutral, question, negative)
 * - Inline preview + edit before sending
 * - One-click "Draft it" → saves to Mail drafts via chat send
 * - Dismissable
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn } from '@anvil/ui';
import type { SmartReply } from '@/app/api/smart-reply/route';

const SENTIMENT_STYLES: Record<SmartReply['sentiment'], { icon: string; cls: string }> = {
  positive: { icon: '✅', cls: 'text-green-600 dark:text-green-400' },
  neutral: { icon: '↩️', cls: 'text-gray-500 dark:text-gray-400' },
  negative: { icon: '❌', cls: 'text-red-500 dark:text-red-400' },
  question: { icon: '❓', cls: 'text-blue-500 dark:text-blue-400' },
};

const LENGTH_BADGE: Record<SmartReply['length'], string> = {
  short: 'bg-gray-100 dark:bg-gray-800 text-gray-500',
  medium: 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
  long: 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400',
};

interface Props {
  /** Email subject for context */
  subject: string;
  /** Raw thread text (passed from tool result) */
  thread: string;
  /** Sender name for personalization */
  senderName?: string;
  /** User's preferred email tone */
  tone?: string;
  /** Called when user wants to draft/send a reply */
  onDraft: (replyBody: string, subject: string) => void;
  onClose: () => void;
  className?: string;
}

export default function SmartReplyPanel({
  subject,
  thread,
  senderName,
  tone,
  onDraft,
  onClose,
  className,
}: Props) {
  const [replies, setReplies] = useState<SmartReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch('/api/smart-reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, thread, tone, senderName }),
    })
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        if (data.replies && Array.isArray(data.replies)) {
          setReplies(data.replies);
        } else {
          setError('Could not generate replies');
        }
      })
      .catch(() => {
        if (!cancelled) setError('Failed to generate smart replies');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [subject, thread, tone, senderName]);

  const handleExpand = useCallback((reply: SmartReply) => {
    if (expanded === reply.id) {
      setExpanded(null);
      setEditText('');
    } else {
      setExpanded(reply.id);
      setEditText(reply.body);
    }
  }, [expanded]);

  const handleDraft = useCallback((replyId: string) => {
    const body = replyId === expanded ? editText : replies.find(r => r.id === replyId)?.body ?? '';
    if (!body) return;
    const replySubject = subject.toLowerCase().startsWith('re:') ? subject : `Re: ${subject}`;
    onDraft(body, replySubject);
  }, [expanded, editText, replies, subject, onDraft]);

  if (loading) {
    return (
      <div className={cn('rounded-xl border border-gray-200 dark:border-gray-800 p-3 bg-white dark:bg-gray-900', className)}>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <div className="flex gap-0.5">
            {[0, 1, 2].map(i => (
              <span key={i} className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600 animate-bounce" style={{ animationDelay: `${i * 120}ms` }} />
            ))}
          </div>
          Generating smart replies…
        </div>
      </div>
    );
  }

  if (error || replies.length === 0) {
    return null; // Silently fail — don't disrupt the chat
  }

  return (
    <div className={cn('rounded-xl border border-indigo-200/70 dark:border-indigo-800/50 bg-indigo-50/60 dark:bg-indigo-950/20 overflow-hidden', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-indigo-100 dark:border-indigo-900/50">
        <div className="flex items-center gap-1.5 text-xs font-medium text-indigo-700 dark:text-indigo-300">
          <span>✉️</span>
          <span>Smart Replies</span>
          <span className="text-indigo-400 dark:text-indigo-500 font-normal">— click to preview &amp; send</span>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xs transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Reply chips */}
      <div className="p-2 flex flex-col gap-1">
        {replies.map(reply => {
          const sentiment = SENTIMENT_STYLES[reply.sentiment ?? 'neutral'];
          const isOpen = expanded === reply.id;

          return (
            <div key={reply.id} className="rounded-lg overflow-hidden">
              {/* Chip row */}
              <button
                onClick={() => handleExpand(reply)}
                className={cn(
                  'w-full flex items-center justify-between gap-2 px-3 py-2 text-left transition-colors rounded-lg',
                  isOpen
                    ? 'bg-white dark:bg-gray-900 shadow-sm border border-indigo-200 dark:border-indigo-800'
                    : 'hover:bg-white/70 dark:hover:bg-gray-900/50',
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className={cn('text-sm shrink-0', sentiment.cls)}>{sentiment.icon}</span>
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                    {reply.label}
                  </span>
                  <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0', LENGTH_BADGE[reply.length])}>
                    {reply.length}
                  </span>
                </div>
                <span className={cn('text-xs text-gray-400 transition-transform shrink-0', isOpen && 'rotate-180')}>
                  ▾
                </span>
              </button>

              {/* Expanded editor */}
              {isOpen && (
                <div className="px-3 pb-3 pt-1 bg-white dark:bg-gray-900 border border-t-0 border-indigo-200 dark:border-indigo-800 rounded-b-lg">
                  <textarea
                    value={editText}
                    onChange={e => setEditText(e.target.value)}
                    rows={Math.min(8, editText.split('\n').length + 2)}
                    className="w-full text-sm text-gray-800 dark:text-gray-200 bg-transparent border border-gray-200 dark:border-gray-700 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  />
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      onClick={() => handleDraft(reply.id)}
                      className="flex-1 text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium transition-colors"
                    >
                      💾 Save Draft
                    </button>
                    <button
                      onClick={() => {
                        const replySubject = subject.toLowerCase().startsWith('re:') ? subject : `Re: ${subject}`;
                        onDraft(`Send this email reply to ${senderName ?? 'them'}:\n\nSubject: ${replySubject}\n\n${editText}`, replySubject);
                      }}
                      className="flex-1 text-xs px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium transition-colors"
                    >
                      📤 Send Reply
                    </button>
                    <button
                      onClick={() => setEditText(reply.body)}
                      className="text-xs px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-gray-700 transition-colors"
                      title="Reset to original"
                    >
                      ↩
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

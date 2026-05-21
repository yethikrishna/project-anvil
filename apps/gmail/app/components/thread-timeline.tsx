'use client';

/**
 * Email Thread Timeline
 *
 * Visual timeline of email thread conversation:
 * - Chronological message bubbles
 * - Sender avatars and colors
 * - Response time indicators
 * - Sentiment overlay per message
 * - Expand/collapse long messages
 * - Quick reply inline
 */

import {useState, useMemo, useCallback} from 'react';
import type {MailMessage} from '../lib/ai-mail';
import {useThreadSentiment, getSentimentColor, getTrajectoryLabel} from '../lib/thread-sentiment-tracker';

// ── Types ──

interface ThreadTimelineProps {
  messages: MailMessage[];
  onReply: (message: MailMessage) => void;
  onForward: (message: MailMessage) => void;
  currentUserEmail?: string;
}

// ── Helper: sender colors ──

const SENDER_COLORS = [
  'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500',
  'bg-pink-500', 'bg-teal-500', 'bg-indigo-500', 'bg-yellow-500',
];

function getSenderColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return SENDER_COLORS[Math.abs(hash) % SENDER_COLORS.length];
}

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function formatRelativeTime(date: string): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(date).toLocaleDateString();
}

function getResponseTime(msg: MailMessage, prevMsg: MailMessage | null): string | null {
  if (!prevMsg) return null;
  const diffMs = new Date(msg.date).getTime() - new Date(prevMsg.date).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 5) return 'Instant reply';
  if (diffMins < 60) return `Replied in ${diffMins}m`;
  if (diffHours < 24) return `Replied in ${diffHours}h`;
  return `Replied in ${diffDays}d`;
}

// ── Component ──

export function ThreadTimeline({messages, onReply, onForward, currentUserEmail}: ThreadTimelineProps) {
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set(messages.map(m => m.id)));
  const [showSentiment, setShowSentiment] = useState(false);

  const sentimentReport = useThreadSentiment(messages);
  const trajectory = getTrajectoryLabel(sentimentReport.trajectory);

  const sorted = useMemo(
    () => [...messages].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [messages]
  );

  const toggleExpand = useCallback((id: string) => {
    setExpandedMessages(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // Build sender color map
  const senderColors = useMemo(() => {
    const map = new Map<string, string>();
    const senders = [...new Set(messages.map(m => m.from.email))];
    senders.forEach(s => {
      const name = messages.find(m => m.from.email === s)?.from.name || s;
      map.set(s, getSenderColor(name));
    });
    return map;
  }, [messages]);

  return (
    <div className="space-y-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-700">{messages.length} messages</span>
          <div className="flex items-center gap-1 text-xs text-gray-500">
            {trajectory.icon} <span className={trajectory.color}>{trajectory.label}</span>
          </div>
        </div>
        <button
          onClick={() => setShowSentiment(!showSentiment)}
          className={`px-2 py-1 text-xs rounded ${showSentiment ? 'bg-purple-100 text-purple-700' : 'text-gray-500 hover:bg-gray-100'}`}
        >
          {showSentiment ? '🎭 Hide Sentiment' : '🎭 Show Sentiment'}
        </button>
      </div>

      {/* Timeline */}
      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-200" />

        {sorted.map((msg, i) => {
          const isMe = msg.from.email === currentUserEmail;
          const isExpanded = expandedMessages.has(msg.id);
          const color = senderColors.get(msg.from.email) || 'bg-gray-500';
          const prevMsg = i > 0 ? sorted[i - 1] : null;
          const responseTime = getResponseTime(msg, prevMsg);
          const sentiment = sentimentReport.messages[i];

          return (
            <div key={msg.id} className={`relative pl-14 pr-4 py-3 ${isMe ? 'bg-blue-50/30' : ''}`}>
              {/* Avatar */}
              <div className={`absolute left-3 top-4 w-7 h-7 rounded-full ${color} flex items-center justify-center text-white text-[10px] font-bold`}>
                {getInitials(msg.from.name)}
              </div>

              {/* Response time */}
              {responseTime && (
                <div className="flex items-center justify-center mb-1">
                  <span className="px-2 py-0.5 bg-gray-100 text-[10px] text-gray-500 rounded-full">
                    ⏱ {responseTime}
                  </span>
                </div>
              )}

              {/* Message bubble */}
              <div className={`rounded-lg border ${isMe ? 'border-blue-200 bg-white' : 'border-gray-200 bg-white'} shadow-sm`}>
                {/* Sender info */}
                <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{msg.from.name}</span>
                    {isMe && <span className="text-[10px] text-blue-500">(you)</span>}
                    <span className="text-[10px] text-gray-400">{formatRelativeTime(msg.date)}</span>
                  </div>
                  {showSentiment && sentiment && (
                    <span className={`text-[10px] ${getSentimentColor(sentiment.sentiment)}`}>
                      {sentiment.sentiment === 'positive' ? '😊' : sentiment.sentiment === 'negative' ? '😟' : sentiment.sentiment === 'mixed' ? '😐' : '🙂'}
                      {' '}{sentiment.score > 0 ? '+' : ''}{sentiment.score}
                    </span>
                  )}
                </div>

                {/* Body */}
                <div className="px-3 py-2">
                  {isExpanded ? (
                    <div
                      className="text-sm text-gray-700 prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{__html: msg.body}}
                    />
                  ) : (
                    <div className="text-sm text-gray-500 line-clamp-3">{msg.body.replace(/<[^>]+>/g, '')}</div>
                  )}
                  {!isExpanded && msg.body.length > 200 && (
                    <button
                      onClick={() => toggleExpand(msg.id)}
                      className="text-xs text-blue-500 hover:text-blue-700 mt-1"
                    >
                      Show more ↓
                    </button>
                  )}
                  {isExpanded && msg.body.length > 200 && (
                    <button
                      onClick={() => toggleExpand(msg.id)}
                      className="text-xs text-blue-500 hover:text-blue-700 mt-1"
                    >
                      Show less ↑
                    </button>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 px-3 py-1.5 border-t border-gray-100">
                  <button
                    onClick={() => onReply(msg)}
                    className="text-[10px] text-gray-500 hover:text-blue-600"
                  >
                    ↩ Reply
                  </button>
                  <button
                    onClick={() => onForward(msg)}
                    className="text-[10px] text-gray-500 hover:text-blue-600"
                  >
                    → Forward
                  </button>
                  {msg.hasAttachments && (
                    <span className="text-[10px] text-gray-400">📎 {msg.attachments?.length || 1}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

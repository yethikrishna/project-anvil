'use client';

/**
 * AI Response Time Intelligence — Anvil Mail
 *
 * Tracks how long you've been waiting for replies and surfaces context
 * when a snoozed email re-surfaces.
 *
 * Features:
 * - Response wait time indicator on unanswered sent threads
 * - "Waiting X days" badge with urgency coloring
 * - Re-brief: when you re-open an old email, summarizes what it was about
 * - "Send a gentle follow-up?" AI compose prompt
 * - Last-replied tracker
 */

import {useState, useMemo} from 'react';

// ── Types ──

export interface WaitingIndicatorInfo {
  daysSinceSent: number;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  lastSentDate: string;
  threadSubject: string;
  recipientName: string;
}

// ── Calculate wait time ──

export function calculateWaitTime(
  messages: Array<{from: {email: string}; date: string}>,
  selfEmail: string = 'me@anvil.local',
): WaitingIndicatorInfo | null {
  if (messages.length === 0) return null;

  const sorted = [...messages].sort((a, b) =>
    new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  // Check if last message was sent by us (no reply yet)
  const lastMsg = sorted[0];
  if (lastMsg.from.email !== selfEmail) return null; // they replied

  // Find the last message we sent
  const lastSentByUs = sorted.find(m => m.from.email === selfEmail);
  if (!lastSentByUs) return null;

  const sentDate = new Date(lastSentByUs.date);
  const now = new Date();
  const diffMs = now.getTime() - sentDate.getTime();
  const daysSinceSent = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  let urgency: WaitingIndicatorInfo['urgency'] = 'low';
  if (daysSinceSent >= 7) urgency = 'critical';
  else if (daysSinceSent >= 3) urgency = 'high';
  else if (daysSinceSent >= 1) urgency = 'medium';

  return {
    daysSinceSent,
    urgency,
    lastSentDate: sentDate.toLocaleDateString(),
    threadSubject: '',
    recipientName: '',
  };
}

// ── Urgency styles ──

const URGENCY_CONFIG = {
  low:      {color: 'text-gray-400', bg: 'bg-gray-50',  border: 'border-gray-100', label: 'Sent today'},
  medium:   {color: 'text-blue-500', bg: 'bg-blue-50',  border: 'border-blue-100', label: 'Waiting'},
  high:     {color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-100', label: 'No reply'},
  critical: {color: 'text-red-600',  bg: 'bg-red-50',   border: 'border-red-100',  label: 'Overdue'},
};

// ── Component ──

interface WaitingBadgeProps {
  info: WaitingIndicatorInfo;
  recipientName: string;
  subject: string;
  onFollowUp?: () => void;
}

export function WaitingReplyBadge({info, recipientName, subject, onFollowUp}: WaitingBadgeProps) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || info.urgency === 'low') return null;

  const cfg = URGENCY_CONFIG[info.urgency];

  const label = info.daysSinceSent === 1
    ? 'Waiting 1 day for a reply'
    : `Waiting ${info.daysSinceSent} days for a reply`;

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${cfg.bg} ${cfg.border}`}>
      <span className={`text-sm ${info.urgency === 'critical' ? 'animate-pulse' : ''}`}>
        {info.urgency === 'critical' ? '🔴' : info.urgency === 'high' ? '🟠' : '🔵'}
      </span>
      <span className={`font-medium ${cfg.color}`}>{label}</span>
      <span className="text-gray-400">from {recipientName}</span>
      <div className="flex-1" />
      {onFollowUp && (
        <button
          onClick={onFollowUp}
          className={`px-2 py-1 rounded-md text-[11px] font-medium ${cfg.color} hover:opacity-80 border ${cfg.border}`}
        >
          Follow up →
        </button>
      )}
      <button
        onClick={() => setDismissed(true)}
        className="text-gray-300 hover:text-gray-500"
      >
        ✕
      </button>
    </div>
  );
}

// ── Re-brief Component ──

interface RebriefProps {
  subject: string;
  lastBody: string;
  daysSinceLastView: number;
  onDismiss?: () => void;
}

export function ThreadRebrief({subject, lastBody, daysSinceLastView, onDismiss}: RebriefProps) {
  const [expanded, setExpanded] = useState(false);
  if (daysSinceLastView < 2) return null;

  // Extract 2-3 sentence summary from body (local)
  const sentences = lastBody
    .replace(/<[^>]+>/g, ' ')
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 30)
    .slice(0, 3);

  const preview = sentences.slice(0, 2).join('. ') + (sentences.length > 1 ? '.' : '');

  return (
    <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-100 rounded-lg text-xs">
      <span className="text-sm mt-0.5">💡</span>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-amber-800">
          You haven't seen this in {daysSinceLastView} days
        </div>
        {preview && (
          <p className="text-amber-700 mt-0.5 leading-relaxed">
            {expanded ? lastBody.replace(/<[^>]+>/g, ' ').slice(0, 500) : preview}
          </p>
        )}
        {preview.length > 100 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-amber-500 mt-0.5 hover:text-amber-700"
          >
            {expanded ? 'Show less' : 'Show more'}
          </button>
        )}
      </div>
      {onDismiss && (
        <button onClick={onDismiss} className="text-amber-300 hover:text-amber-500 flex-shrink-0">✕</button>
      )}
    </div>
  );
}

// ── Inbox-level follow-up list ──

export interface FollowUpThread {
  threadId: string;
  subject: string;
  recipientName: string;
  recipientEmail: string;
  daysSinceSent: number;
  urgency: WaitingIndicatorInfo['urgency'];
}

interface FollowUpListProps {
  threads: FollowUpThread[];
  onSelectThread?: (threadId: string) => void;
}

export function FollowUpList({threads, onSelectThread}: FollowUpListProps) {
  const sorted = useMemo(
    () => [...threads].sort((a, b) => b.daysSinceSent - a.daysSinceSent),
    [threads],
  );

  if (sorted.length === 0) return null;

  return (
    <div className="border border-orange-100 rounded-xl overflow-hidden">
      <div className="px-3 py-2 bg-orange-50 border-b border-orange-100 flex items-center gap-2">
        <span className="text-xs font-semibold text-orange-700">⏳ Awaiting Replies</span>
        <span className="text-[10px] text-orange-500">{sorted.length}</span>
      </div>
      <div className="divide-y divide-gray-50">
        {sorted.slice(0, 5).map(thread => {
          const cfg = URGENCY_CONFIG[thread.urgency];
          return (
            <button
              key={thread.threadId}
              onClick={() => onSelectThread?.(thread.threadId)}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-left"
            >
              <span className={`text-[10px] font-medium ${cfg.color}`}>
                {thread.daysSinceSent}d
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-gray-700 truncate">{thread.subject}</div>
                <div className="text-[10px] text-gray-400">to {thread.recipientName}</div>
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${cfg.bg} ${cfg.color} font-medium`}>
                {cfg.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

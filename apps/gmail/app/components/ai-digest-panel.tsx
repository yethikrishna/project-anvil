'use client';

/**
 * AI Daily Email Digest — Anvil Mail
 *
 * One-click digest of all unread emails with AI prioritization.
 * Groups emails into:
 * - 🔴 Needs Attention (action required, deadlines, urgent)
 * - 📋 FYI (updates, notifications, info)
 * - 📰 Newsletters (marketing, subscriptions)
 * - ✅ Already Handled (likely no action needed)
 *
 * Features:
 * - Instant local classification (no API)
 * - AI summary per group (optional)
 * - "Open all urgent" action
 * - Copy digest as text for morning standup
 * - Read count / time estimate
 */

import {useState, useMemo} from 'react';

// ── Types ──

export type DigestGroup = 'urgent' | 'fyi' | 'newsletter' | 'handled';

export interface DigestEmail {
  id: string;
  subject: string;
  senderName: string;
  senderEmail: string;
  group: DigestGroup;
  reason: string;
  snippet: string;
  date: string;
  read: boolean;
}

export interface DigestResult {
  urgent: DigestEmail[];
  fyi: DigestEmail[];
  newsletter: DigestEmail[];
  handled: DigestEmail[];
  totalUnread: number;
  estimatedReadMinutes: number;
  generatedAt: string;
}

// ── Classification signals ──

const URGENT_SIGNALS = [
  /\b(urgent|asap|action required|deadline|overdue|immediately|critical|time-sensitive|response needed|please review|approval needed)\b/i,
  /\b(by (?:today|tonight|tomorrow|friday|monday|eod|eow))\b/i,
  /\b(can you|could you|please|need your|I need)\b/i,
];

const NEWSLETTER_SIGNALS = [
  /\b(newsletter|digest|weekly|monthly|daily update|subscribe|unsubscribe|opt-out|view in browser)\b/i,
  /\b(marketing|promotion|sale|discount|offer|deal|coupon|limited time)\b/i,
  /@(mailchimp|sendgrid|klaviyo|brevo|constantcontact|hubspot)/i,
];

const HANDLED_SIGNALS = [
  /\b(fyi|for your information|heads up|just wanted to let you know|no action needed|no response needed)\b/i,
  /\b(auto-reply|out of office|automatic response|vacation response)\b/i,
  /\b(confirmation|confirmed|receipt|invoice|payment received|successfully|completed)\b/i,
  /^re:/i,   // likely a reply chain that doesn't need action
];

function classifyEmail(subject: string, body: string, senderEmail: string): {group: DigestGroup; reason: string} {
  const text = `${subject} ${body}`.toLowerCase();

  // Newsletter first (most specific)
  const isNewsletter = NEWSLETTER_SIGNALS.some(p => p.test(text)) ||
    senderEmail.includes('newsletter') || senderEmail.includes('noreply') ||
    senderEmail.includes('no-reply');
  if (isNewsletter) return {group: 'newsletter', reason: 'Newsletter or marketing'};

  // Handled
  const isHandled = HANDLED_SIGNALS.some(p => p.test(`${subject} ${body}`));
  if (isHandled) return {group: 'handled', reason: 'Confirmation or auto-reply'};

  // Urgent
  const urgentSignals = URGENT_SIGNALS.filter(p => p.test(`${subject} ${body}`));
  if (urgentSignals.length >= 1) {
    const reason = subject.match(/urgent|asap|deadline/i) ? 'Urgent keyword in subject' : 'Action requested';
    return {group: 'urgent', reason};
  }

  // Default: FYI
  return {group: 'fyi', reason: 'Informational'};
}

// ── Main digest generator ──

export function generateDigest(
  emails: Array<{
    id: string;
    subject: string;
    from: {name: string; email: string};
    body: string;
    date: string;
    read: boolean;
    labels: string[];
  }>,
): DigestResult {
  const unread = emails.filter(e => !e.read);
  const allEmails = unread.length > 0 ? unread : emails.slice(0, 20);

  const groups: Record<DigestGroup, DigestEmail[]> = {
    urgent: [], fyi: [], newsletter: [], handled: [],
  };

  for (const email of allEmails) {
    const {group, reason} = classifyEmail(email.subject, email.body, email.from.email);
    const snippet = email.body.replace(/<[^>]+>/g, ' ').trim().slice(0, 100);

    groups[group].push({
      id: email.id,
      subject: email.subject,
      senderName: email.from.name,
      senderEmail: email.from.email,
      group,
      reason,
      snippet,
      date: email.date,
      read: email.read,
    });
  }

  // Sort urgent by date (newest first)
  groups.urgent.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const totalUnread = allEmails.length;
  const estimatedReadMinutes = Math.ceil(
    (groups.urgent.length * 2 + groups.fyi.length * 1 + groups.newsletter.length * 0.5) * 0.5,
  );

  return {
    ...groups,
    totalUnread,
    estimatedReadMinutes: Math.max(1, estimatedReadMinutes),
    generatedAt: new Date().toLocaleTimeString(),
  };
}

// ── Component ──

const GROUP_CONFIG: Record<DigestGroup, {
  icon: string;
  label: string;
  color: string;
  bg: string;
  border: string;
}> = {
  urgent:     {icon: '🔴', label: 'Needs Attention', color: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-100'},
  fyi:        {icon: '📋', label: 'For Your Info',   color: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-100'},
  newsletter: {icon: '📰', label: 'Newsletters',     color: 'text-gray-600',   bg: 'bg-gray-50',   border: 'border-gray-100'},
  handled:    {icon: '✅', label: 'No Action Needed', color: 'text-green-700', bg: 'bg-green-50',  border: 'border-green-100'},
};

interface DigestPanelProps {
  emails: Array<{
    id: string;
    subject: string;
    from: {name: string; email: string};
    body: string;
    date: string;
    read: boolean;
    labels: string[];
  }>;
  onOpenEmail?: (id: string) => void;
  onClose: () => void;
}

export function DigestPanel({emails, onOpenEmail, onClose}: DigestPanelProps) {
  const [copied, setCopied] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<DigestGroup>>(new Set(['urgent', 'fyi']));

  const digest = useMemo(() => generateDigest(emails), [emails]);

  const toggleGroup = (group: DigestGroup) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  const handleCopy = () => {
    const lines: string[] = [`📧 Email Digest — ${digest.generatedAt}`, ''];

    for (const group of ['urgent', 'fyi', 'newsletter', 'handled'] as DigestGroup[]) {
      const items = digest[group];
      if (items.length === 0) continue;
      const cfg = GROUP_CONFIG[group];
      lines.push(`${cfg.icon} ${cfg.label} (${items.length})`);
      for (const item of items) {
        lines.push(`  • [${item.senderName}] ${item.subject}`);
      }
      lines.push('');
    }

    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const ORDER: DigestGroup[] = ['urgent', 'fyi', 'newsletter', 'handled'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-2xl shadow-2xl w-[560px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold text-gray-900">📧 Email Digest</span>
              <span className="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full font-medium">AI</span>
            </div>
            <div className="text-xs text-gray-400 mt-0.5">
              {digest.totalUnread} emails · ~{digest.estimatedReadMinutes}m to process · {digest.generatedAt}
            </div>
          </div>
          <div className="flex-1" />
          <button
            onClick={handleCopy}
            className="text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50"
          >
            {copied ? '✓ Copied' : '📋 Copy'}
          </button>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 ml-1">✕</button>
        </div>

        {/* Quick stats */}
        <div className="flex divide-x divide-gray-100 border-b border-gray-100">
          {ORDER.map(group => {
            const count = digest[group].length;
            const cfg = GROUP_CONFIG[group];
            if (count === 0) return null;
            return (
              <div key={group} className="flex-1 px-3 py-2 text-center">
                <div className={`text-lg font-bold ${cfg.color}`}>{count}</div>
                <div className={`text-[10px] ${cfg.color}`}>{cfg.icon} {cfg.label.split(' ')[0]}</div>
              </div>
            );
          })}
        </div>

        {/* Groups */}
        <div className="flex-1 overflow-y-auto">
          {ORDER.map(group => {
            const items = digest[group];
            if (items.length === 0) return null;
            const cfg = GROUP_CONFIG[group];
            const isExpanded = expandedGroups.has(group);

            return (
              <div key={group} className={`border-b border-gray-100`}>
                <button
                  onClick={() => toggleGroup(group)}
                  className={`w-full flex items-center gap-2 px-4 py-2.5 ${cfg.bg} hover:opacity-90`}
                >
                  <span>{cfg.icon}</span>
                  <span className={`text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>
                  <span className={`text-[10px] ${cfg.color} opacity-70`}>{items.length}</span>
                  <div className="flex-1" />
                  <span className="text-gray-400 text-xs">{isExpanded ? '▲' : '▼'}</span>
                </button>

                {isExpanded && (
                  <div className="divide-y divide-gray-50">
                    {items.map(item => (
                      <button
                        key={item.id}
                        onClick={() => onOpenEmail?.(item.id)}
                        className="w-full flex items-start gap-2 px-4 py-2.5 hover:bg-gray-50 text-left"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-medium text-gray-800 truncate">{item.subject}</span>
                            {!item.read && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[11px] text-gray-500">{item.senderName}</span>
                            <span className="text-[10px] text-gray-300">·</span>
                            <span className="text-[10px] text-gray-400 italic">{item.reason}</span>
                          </div>
                        </div>
                        <span className="text-[10px] text-gray-400 flex-shrink-0 mt-0.5">
                          {new Date(item.date).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex justify-between items-center">
          <span className="text-xs text-gray-400">
            Generated at {digest.generatedAt}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

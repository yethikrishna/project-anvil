'use client';

/**
 * AI Unsubscribe Intelligence — Anvil Mail
 *
 * Automatically detects marketing/newsletter emails and extracts
 * unsubscribe links — all local, zero API calls needed.
 *
 * Detects:
 * - List-Unsubscribe headers (RFC 2369)
 * - Unsubscribe links in email body
 * - Marketing/newsletter patterns
 *
 * UI:
 * - Subtle banner at top of marketing emails
 * - One-click unsubscribe (navigates to link)
 * - "Mark as marketing" to teach the filter
 * - Bulk unsubscribe panel for inbox
 */

import {useState, useMemo} from 'react';

// ── Types ──

export interface UnsubscribeInfo {
  type: 'newsletter' | 'marketing' | 'notification' | 'transactional';
  unsubscribeUrl?: string;
  unsubscribeEmail?: string;
  confidence: number;
  signals: string[];
}

// ── Detection signals ──

const MARKETING_HEADER_SIGNALS = [
  'list-unsubscribe',
  'list-id',
  'x-mailchimp',
  'x-campaign',
  'x-mailer: mailchimp',
  'x-mailer: sendgrid',
  'x-mailer: klaviyo',
  'precedence: bulk',
  'precedence: list',
];

const MARKETING_BODY_PATTERNS = [
  /\bunsubscribe\b/i,
  /\bopt[\s-]?out\b/i,
  /\bmanage\s+(your\s+)?preferences\b/i,
  /\bemail\s+preferences\b/i,
  /\bno\s+longer\s+(want|wish)\s+to\s+receive\b/i,
  /\byou(?:'re|\s+are)\s+receiving\s+this\s+(email|message)\b/i,
  /\bthis\s+(email\s+)?was\s+sent\s+to\b/i,
  /\bview\s+(in\s+)?browser\b/i,
  /\bprivacy\s+policy\b/i,
  /\b(?:weekly|monthly|daily)\s+(?:digest|newsletter|update)\b/i,
  /\bpromotional\s+email\b/i,
  /\bexclusive\s+offer\b/i,
];

const NEWSLETTER_SIGNALS = [
  /\bnewsletter\b/i,
  /\bsubscrib(?:er|ed)\b/i,
  /\bwelcome\s+to\s+our\b/i,
  /\bissue\s+#?\d+\b/i,
  /\bweek(?:ly)?\s+in\s+review\b/i,
  /\bdigest\b/i,
];

const UNSUBSCRIBE_URL_PATTERNS = [
  /href=["']([^"']*(?:unsubscribe|optout|opt-out|email-preferences|manage-preferences)[^"']*?)["']/gi,
  /https?:\/\/[^\s<>"']+(?:unsubscribe|optout|opt-out|email-preferences|manage-preferences)[^\s<>"']*/gi,
];

// ── Main detection ──

export function detectUnsubscribeInfo(
  subject: string,
  body: string,
  headers?: Record<string, string>,
): UnsubscribeInfo | null {
  const signals: string[] = [];
  let confidence = 0;
  let type: UnsubscribeInfo['type'] = 'marketing';

  // Check headers
  if (headers) {
    const headerStr = JSON.stringify(headers).toLowerCase();
    for (const sig of MARKETING_HEADER_SIGNALS) {
      if (headerStr.includes(sig)) {
        signals.push(`header:${sig}`);
        confidence += 0.25;
      }
    }
    // List-Unsubscribe header is definitive
    if (headers['list-unsubscribe'] || headers['List-Unsubscribe']) {
      confidence = Math.max(confidence, 0.9);
    }
  }

  // Check body patterns
  const bodySignalCount = MARKETING_BODY_PATTERNS.filter(p => p.test(body)).length;
  if (bodySignalCount > 0) {
    signals.push(`body:${bodySignalCount} marketing patterns`);
    confidence += bodySignalCount * 0.12;
  }

  // Newsletter signals
  const newsletterCount = NEWSLETTER_SIGNALS.filter(p => p.test(body) || p.test(subject)).length;
  if (newsletterCount > 0) {
    type = 'newsletter';
    signals.push(`newsletter:${newsletterCount} signals`);
    confidence += newsletterCount * 0.15;
  }

  confidence = Math.min(1, confidence);
  if (confidence < 0.3) return null;

  // Extract unsubscribe URL from body
  let unsubscribeUrl: string | undefined;
  let unsubscribeEmail: string | undefined;

  for (const pattern of UNSUBSCRIBE_URL_PATTERNS) {
    pattern.lastIndex = 0;
    const match = pattern.exec(body);
    if (match) {
      unsubscribeUrl = match[1] || match[0];
      break;
    }
  }

  // Check List-Unsubscribe header for mailto:
  if (headers) {
    const listUnsub = headers['list-unsubscribe'] || headers['List-Unsubscribe'] || '';
    const mailtoMatch = listUnsub.match(/<mailto:([^>]+)>/i);
    const urlMatch = listUnsub.match(/<(https?:\/\/[^>]+)>/i);
    if (mailtoMatch) unsubscribeEmail = mailtoMatch[1];
    if (urlMatch && !unsubscribeUrl) unsubscribeUrl = urlMatch[1];
  }

  return {
    type,
    unsubscribeUrl,
    unsubscribeEmail,
    confidence,
    signals,
  };
}

// ── Component ──

interface UnsubscribeBannerProps {
  info: UnsubscribeInfo;
  senderName: string;
  senderEmail: string;
  onUnsubscribe?: (method: 'url' | 'email', target: string) => void;
  onDismiss?: () => void;
  onMarkMarketing?: () => void;
}

export function UnsubscribeBanner({
  info, senderName, senderEmail, onUnsubscribe, onDismiss, onMarkMarketing,
}: UnsubscribeBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const [unsubscribed, setUnsubscribed] = useState(false);

  if (dismissed || unsubscribed) return null;

  const typeLabel = info.type === 'newsletter' ? 'Newsletter' : 'Marketing email';
  const typeIcon = info.type === 'newsletter' ? '📰' : '📣';

  const handleUnsubscribe = () => {
    if (info.unsubscribeUrl) {
      window.open(info.unsubscribeUrl, '_blank', 'noopener');
      onUnsubscribe?.('url', info.unsubscribeUrl);
    } else if (info.unsubscribeEmail) {
      window.open(`mailto:${info.unsubscribeEmail}?subject=Unsubscribe`, '_blank');
      onUnsubscribe?.('email', info.unsubscribeEmail);
    }
    setUnsubscribed(true);
  };

  const hasUnsubscribeOption = !!(info.unsubscribeUrl || info.unsubscribeEmail);

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-100 rounded-lg text-xs">
      <span>{typeIcon}</span>
      <span className="text-amber-700 font-medium">{typeLabel}</span>
      <span className="text-amber-600">from {senderName}</span>
      <div className="flex-1" />
      {hasUnsubscribeOption && (
        <button
          onClick={handleUnsubscribe}
          className="px-2 py-1 bg-amber-600 text-white rounded-md hover:bg-amber-700 font-medium"
        >
          Unsubscribe
        </button>
      )}
      {onMarkMarketing && !hasUnsubscribeOption && (
        <button
          onClick={() => { onMarkMarketing(); setDismissed(true); }}
          className="px-2 py-1 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
        >
          Mark as Marketing
        </button>
      )}
      <button
        onClick={() => setDismissed(true)}
        className="text-amber-400 hover:text-amber-600 ml-1"
        title="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}

// ── Bulk Unsubscribe Panel ──

export interface BulkUnsubscribeCandidate {
  id: string;
  senderName: string;
  senderEmail: string;
  subject: string;
  info: UnsubscribeInfo;
  selected: boolean;
}

interface BulkUnsubscribePanelProps {
  candidates: BulkUnsubscribeCandidate[];
  onClose: () => void;
  onUnsubscribeAll: (selected: BulkUnsubscribeCandidate[]) => void;
}

export function BulkUnsubscribePanel({candidates, onClose, onUnsubscribeAll}: BulkUnsubscribePanelProps) {
  const [items, setItems] = useState(candidates);
  const selectedCount = items.filter(i => i.selected).length;

  const toggleItem = (id: string) =>
    setItems(prev => prev.map(i => i.id === id ? {...i, selected: !i.selected} : i));

  const toggleAll = () => {
    const allSelected = items.every(i => i.selected);
    setItems(prev => prev.map(i => ({...i, selected: !allSelected})));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-2xl shadow-2xl w-[560px] max-h-[80vh] flex flex-col">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100">
          <span className="text-base font-semibold text-gray-900">🧹 Bulk Unsubscribe</span>
          <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full font-medium">
            {candidates.length} detected
          </span>
          <div className="flex-1" />
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div className="px-5 py-2.5 border-b border-gray-100 flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={items.every(i => i.selected)}
              onChange={toggleAll}
              className="rounded"
            />
            Select all ({items.length})
          </label>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
          {items.map(item => (
            <label key={item.id} className="flex items-start gap-3 px-5 py-3 hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={item.selected}
                onChange={() => toggleItem(item.id)}
                className="rounded mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-gray-900 truncate">{item.senderName}</span>
                  <span className="text-[10px] text-gray-400">{item.senderEmail}</span>
                </div>
                <div className="text-xs text-gray-500 truncate">{item.subject}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    item.info.type === 'newsletter' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'
                  }`}>
                    {item.info.type}
                  </span>
                  {item.info.unsubscribeUrl && (
                    <span className="text-[10px] text-green-600">✓ unsubscribe link found</span>
                  )}
                </div>
              </div>
            </label>
          ))}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
          <span className="text-xs text-gray-500">{selectedCount} selected</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded-lg">
              Cancel
            </button>
            <button
              onClick={() => onUnsubscribeAll(items.filter(i => i.selected))}
              disabled={selectedCount === 0}
              className="px-4 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-medium hover:bg-amber-700 disabled:opacity-50"
            >
              Unsubscribe {selectedCount > 0 ? `(${selectedCount})` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Hook ──

export function useUnsubscribeDetection(
  subject: string,
  body: string,
  headers?: Record<string, string>,
) {
  return useMemo(
    () => detectUnsubscribeInfo(subject, body, headers),
    [subject, body, headers],
  );
}

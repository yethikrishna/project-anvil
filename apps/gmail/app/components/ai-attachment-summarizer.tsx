'use client';

/**
 * AI Attachment Summarizer — Anvil Mail
 *
 * Provides inline AI-powered summaries for email attachments.
 *
 * Supported types:
 * - PDF / documents → extract text via /api/ai attachment-summary
 * - Spreadsheets / CSV → key stats summary
 * - Images → visual description
 * - Code files → language + purpose summary
 * - Unknown / binary → file metadata only
 *
 * UI: Expandable attachment card with "✨ Summarize" button
 * that streams the summary in real-time.
 */

import {useState, useCallback} from 'react';

// ── Types ──

export interface EmailAttachment {
  name: string;
  size: string;   // e.g., "2.3 MB"
  type: string;   // MIME type
  contentId?: string;
  url?: string;   // download URL if available
}

interface AttachmentSummaryResult {
  summary: string;
  keyPoints?: string[];
  fileType: string;
  language?: string;      // for code
  rowCount?: number;      // for spreadsheets
  pageCount?: number;     // for PDFs
  wordCount?: number;
}

// ── Attachment type detection ──

function classifyAttachment(attachment: EmailAttachment): {
  category: 'document' | 'spreadsheet' | 'image' | 'code' | 'archive' | 'other';
  icon: string;
  label: string;
} {
  const name = attachment.name.toLowerCase();
  const type = attachment.type.toLowerCase();

  if (type.includes('pdf') || name.endsWith('.pdf')) {
    return {category: 'document', icon: '📄', label: 'PDF'};
  }
  if (type.includes('word') || name.match(/\.(docx?|odt|rtf)$/)) {
    return {category: 'document', icon: '📝', label: 'Word Doc'};
  }
  if (type.includes('presentation') || name.match(/\.(pptx?|odp|key)$/)) {
    return {category: 'document', icon: '📊', label: 'Presentation'};
  }
  if (type.includes('spreadsheet') || name.match(/\.(xlsx?|ods|csv)$/)) {
    return {category: 'spreadsheet', icon: '📊', label: 'Spreadsheet'};
  }
  if (type.startsWith('image/') || name.match(/\.(png|jpg|jpeg|gif|webp|svg)$/)) {
    return {category: 'image', icon: '🖼️', label: 'Image'};
  }
  if (name.match(/\.(js|ts|py|java|go|rs|cpp|c|cs|rb|php|sh|sql)$/)) {
    return {category: 'code', icon: '💻', label: 'Code'};
  }
  if (type.includes('zip') || name.match(/\.(zip|tar|gz|rar|7z)$/)) {
    return {category: 'archive', icon: '📦', label: 'Archive'};
  }
  return {category: 'other', icon: '📎', label: 'File'};
}

// ── Local heuristic summarizer (no API needed for common patterns) ──

function localAttachmentSummary(attachment: EmailAttachment): string | null {
  const {category, label} = classifyAttachment(attachment);
  const name = attachment.name;
  const size = attachment.size;

  // Parse keywords from filename
  const keywords = name
    .replace(/\.[^.]+$/, '')           // remove extension
    .replace(/[-_]/g, ' ')             // normalize separators
    .replace(/([A-Z])/g, ' $1')        // split camelCase
    .trim();

  const dateMatch = name.match(/(20\d{2})[-_]?(\d{2})?[-_]?(\d{2})?/);
  const dateHint = dateMatch ? ` from ${dateMatch[0]}` : '';

  if (category === 'image') {
    return `Image attachment (${size}). Open to view visual content.`;
  }
  if (category === 'archive') {
    return `Compressed archive (${size}) containing multiple files. Download to extract.`;
  }
  if (category === 'code') {
    const ext = name.split('.').pop()?.toUpperCase() || 'Code';
    return `${ext} source file (${size}) — "${keywords}"${dateHint}. Use AI analysis for a full summary.`;
  }

  // For documents/spreadsheets, provide filename-based hint
  return `${label} (${size}) — "${keywords}"${dateHint}. Click ✨ to get an AI summary.`;
}

// ── API call for deep summarization ──

async function fetchAISummary(
  attachment: EmailAttachment,
  emailContext: string,
): Promise<AttachmentSummaryResult> {
  const resp = await fetch('/api/ai', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      action: 'attachment-summary',
      payload: {
        fileName: attachment.name,
        fileType: attachment.type,
        fileSize: attachment.size,
        emailContext,
      },
    }),
  });

  if (!resp.ok) throw new Error('Attachment summary failed');
  return resp.json();
}

// ── Component ──

interface AttachmentCardProps {
  attachment: EmailAttachment;
  emailContext?: string;  // subject + thread snippet for context
}

export function AIAttachmentCard({attachment, emailContext = ''}: AttachmentCardProps) {
  const [summaryState, setSummaryState] = useState<
    'idle' | 'loading' | 'done' | 'error'
  >('idle');
  const [summary, setSummary] = useState<AttachmentSummaryResult | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {icon, label} = classifyAttachment(attachment);
  const localHint = localAttachmentSummary(attachment);

  const handleSummarize = useCallback(async () => {
    if (summaryState === 'loading') return;
    setSummaryState('loading');
    setError(null);
    try {
      const result = await fetchAISummary(attachment, emailContext);
      setSummary(result);
      setSummaryState('done');
      setExpanded(true);
    } catch (err) {
      setError('Could not summarize — try again later');
      setSummaryState('error');
    }
  }, [attachment, emailContext, summaryState]);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white hover:shadow-sm transition-shadow">
      {/* Header row */}
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <span className="text-lg flex-shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-800 truncate">{attachment.name}</div>
          <div className="text-xs text-gray-400 flex items-center gap-1.5 mt-0.5">
            <span>{label}</span>
            <span>·</span>
            <span>{attachment.size}</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Summarize button */}
          {summaryState === 'idle' && (
            <button
              onClick={handleSummarize}
              className="text-xs px-2 py-1 bg-purple-50 text-purple-700 rounded-md hover:bg-purple-100 font-medium transition-colors flex items-center gap-1"
            >
              ✨ Summarize
            </button>
          )}
          {summaryState === 'loading' && (
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Reading...
            </span>
          )}
          {summaryState === 'done' && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded-md hover:bg-green-100 font-medium"
            >
              {expanded ? '▲ Hide' : '▼ Summary'}
            </button>
          )}
          {summaryState === 'error' && (
            <button
              onClick={handleSummarize}
              className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded-md hover:bg-red-100 font-medium"
            >
              ↺ Retry
            </button>
          )}

          {/* Download button */}
          {attachment.url && (
            <a
              href={attachment.url}
              download={attachment.name}
              className="text-xs px-2 py-1 border border-gray-200 text-gray-600 rounded-md hover:bg-gray-50 font-medium"
            >
              ↓
            </a>
          )}
        </div>
      </div>

      {/* Local hint */}
      {summaryState === 'idle' && localHint && (
        <div className="px-3 pb-2.5 text-xs text-gray-400 italic border-t border-gray-50">
          {localHint}
        </div>
      )}

      {/* Error */}
      {summaryState === 'error' && error && (
        <div className="px-3 pb-2.5 text-xs text-red-500 border-t border-red-50">
          {error}
        </div>
      )}

      {/* Summary panel */}
      {summaryState === 'done' && summary && expanded && (
        <div className="border-t border-gray-100 px-3 py-2.5 bg-purple-50 space-y-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-purple-700">✨ AI Summary</span>
            {summary.pageCount && (
              <span className="text-[10px] text-purple-400">{summary.pageCount} pages</span>
            )}
            {summary.wordCount && (
              <span className="text-[10px] text-purple-400">{summary.wordCount.toLocaleString()} words</span>
            )}
            {summary.rowCount && (
              <span className="text-[10px] text-purple-400">{summary.rowCount.toLocaleString()} rows</span>
            )}
          </div>
          <p className="text-xs text-gray-700 leading-relaxed">{summary.summary}</p>
          {summary.keyPoints && summary.keyPoints.length > 0 && (
            <ul className="space-y-0.5">
              {summary.keyPoints.map((p, i) => (
                <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                  <span className="text-purple-400 mt-0.5 flex-shrink-0">•</span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ── Attachment List ──

interface AIAttachmentListProps {
  attachments: EmailAttachment[];
  emailContext?: string;
}

export function AIAttachmentList({attachments, emailContext}: AIAttachmentListProps) {
  if (!attachments || attachments.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-gray-500 flex items-center gap-1.5">
        <span>📎</span>
        <span>{attachments.length} attachment{attachments.length !== 1 ? 's' : ''}</span>
      </div>
      {attachments.map((att, i) => (
        <AIAttachmentCard
          key={att.contentId || att.name + i}
          attachment={att}
          emailContext={emailContext}
        />
      ))}
    </div>
  );
}

/**
 * SmartPaste — AI-powered clipboard analysis.
 *
 * Detects what was pasted (email thread, URL, meeting invite, contract text,
 * code snippet, error log, etc.) and instantly suggests the most useful actions.
 *
 * Examples:
 * - Paste an email thread → "Summarize thread | Draft reply | Extract action items"
 * - Paste a URL → "Fetch and summarize | Add to research | Find related emails"
 * - Paste error text → "Explain error | Search for fix | Create GitHub issue"
 * - Paste contract text → "Summarize key clauses | Flag risks | Compare to previous"
 * - Paste meeting notes → "Extract action items | Schedule follow-ups | Save to Docs"
 *
 * This is the "Anthropic killer" feature: the AI understands ANY pasted content
 * and immediately knows what to do with it.
 */

'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { cn } from '@anvil/ui';

// ── Types ──

type ContentKind =
  | 'email_thread'
  | 'url'
  | 'meeting_notes'
  | 'error_log'
  | 'code'
  | 'contract_text'
  | 'calendar_invite'
  | 'phone_number'
  | 'address'
  | 'json_data'
  | 'table_data'
  | 'generic_text';

interface SmartPasteAction {
  label: string;
  icon: string;
  prompt: string;
  primary?: boolean;
}

interface ContentAnalysis {
  kind: ContentKind;
  confidence: number;
  summary: string;
  actions: SmartPasteAction[];
}

interface Props {
  pastedText: string;
  onAction: (prompt: string) => void;
  onDismiss: () => void;
  className?: string;
}

// ── Content Classifier ──

function classifyContent(text: string): ContentAnalysis {
  const lower = text.toLowerCase().trim();
  const lines = text.split('\n').filter(l => l.trim());

  // Email thread
  if (
    (lower.includes('from:') && lower.includes('to:') && lower.includes('subject:')) ||
    (lower.includes('sent:') && lower.includes('reply-to:')) ||
    /^\s*from:\s+\S+@\S+/m.test(lower)
  ) {
    const subjectMatch = text.match(/subject:\s*(.+)/i);
    const subject = subjectMatch?.[1]?.trim() ?? 'email thread';
    return {
      kind: 'email_thread',
      confidence: 0.95,
      summary: `Email thread: "${subject}"`,
      actions: [
        { label: 'Summarize', icon: '📋', prompt: `Summarize this email thread and extract the key decisions and action items:\n\n${text}`, primary: true },
        { label: 'Draft reply', icon: '✍️', prompt: `Based on this email thread, draft a professional reply:\n\n${text}` },
        { label: 'Action items', icon: '✅', prompt: `Extract all action items and tasks from this email thread:\n\n${text}` },
        { label: 'Schedule meeting', icon: '📅', prompt: `Based on this email thread, what meeting should we schedule? Check calendar availability and create an invite:\n\n${text}` },
      ],
    };
  }

  // URL
  if (/^https?:\/\/\S+$/.test(lower) || (lines.length === 1 && /^https?:\/\//.test(lower))) {
    const url = lines[0].trim();
    return {
      kind: 'url',
      confidence: 0.98,
      summary: `URL: ${url.slice(0, 60)}${url.length > 60 ? '…' : ''}`,
      actions: [
        { label: 'Fetch & summarize', icon: '🌐', prompt: `Search the web for this URL and give me a summary of the content: ${url}`, primary: true },
        { label: 'Find related emails', icon: '📧', prompt: `Search my emails for any discussions about this link or topic: ${url}` },
        { label: 'Save to notes', icon: '📝', prompt: `Create a note with a summary of this link: ${url}` },
      ],
    };
  }

  // Calendar invite / meeting details
  if (
    (lower.includes('invite') || lower.includes('when:') || lower.includes('where:') || lower.includes('organizer:')) &&
    (lower.includes('meeting') || lower.includes('call') || lower.includes('agenda'))
  ) {
    return {
      kind: 'calendar_invite',
      confidence: 0.85,
      summary: 'Meeting invite / calendar event',
      actions: [
        { label: 'Add to calendar', icon: '📅', prompt: `Extract the meeting details from this invite and create a calendar event:\n\n${text}`, primary: true },
        { label: 'Prep for meeting', icon: '🎯', prompt: `Prepare me for this meeting — find related emails, docs, and suggest talking points:\n\n${text}` },
        { label: 'Reply to invite', icon: '✍️', prompt: `Draft a response to this meeting invite:\n\n${text}` },
      ],
    };
  }

  // Error log / stack trace
  if (
    lower.includes('traceback') ||
    lower.includes('error:') ||
    lower.includes('exception') ||
    /at \w+\.\w+\s*\(/.test(lower) ||
    /^\s+at /.test(lower) ||
    lower.includes('stderr') ||
    lower.includes('syntax error')
  ) {
    return {
      kind: 'error_log',
      confidence: 0.9,
      summary: 'Error log / stack trace',
      actions: [
        { label: 'Explain error', icon: '🔍', prompt: `Explain this error and tell me exactly how to fix it:\n\n${text}`, primary: true },
        { label: 'Search for fix', icon: '🌐', prompt: `Search the web for a solution to this error:\n\n${text}` },
        { label: 'Debug approach', icon: '🐛', prompt: `Give me a step-by-step debugging approach for this error:\n\n${text}` },
      ],
    };
  }

  // Code snippet
  if (
    /^(import|export|function|class|const|let|var|def|async|await|return)\s/m.test(text) ||
    /^\s*(if|for|while|switch|try|catch)\s*[\(\{]/m.test(text) ||
    text.includes('```') ||
    lower.includes('npm run') ||
    lower.includes('pip install')
  ) {
    return {
      kind: 'code',
      confidence: 0.88,
      summary: 'Code snippet',
      actions: [
        { label: 'Review & improve', icon: '🔧', prompt: `Review this code for bugs, performance issues, and improvements. Be specific:\n\n${text}`, primary: true },
        { label: 'Explain code', icon: '💬', prompt: `Explain what this code does in plain English:\n\n${text}` },
        { label: 'Write tests', icon: '🧪', prompt: `Write unit tests for this code:\n\n${text}` },
        { label: 'Add comments', icon: '📝', prompt: `Add clear inline comments to this code:\n\n${text}` },
      ],
    };
  }

  // JSON / structured data
  if (lower.startsWith('{') || lower.startsWith('[')) {
    try {
      JSON.parse(text);
      return {
        kind: 'json_data',
        confidence: 0.97,
        summary: 'JSON data',
        actions: [
          { label: 'Explain structure', icon: '🗂️', prompt: `Explain the structure and purpose of this JSON data:\n\n${text}`, primary: true },
          { label: 'Summarize data', icon: '📊', prompt: `Summarize the key information in this data:\n\n${text}` },
          { label: 'Convert to table', icon: '📋', prompt: `Convert this JSON data into a readable Markdown table:\n\n${text}` },
        ],
      };
    } catch { /* not valid JSON */ }
  }

  // Table / CSV
  if (
    (text.includes('\t') && lines.length > 2) ||
    (text.includes(',') && lines.length > 3 && lines[0].includes(',') && lines[1].includes(','))
  ) {
    return {
      kind: 'table_data',
      confidence: 0.8,
      summary: `Table data (${lines.length} rows)`,
      actions: [
        { label: 'Analyze data', icon: '📊', prompt: `Analyze this data and give me key insights and trends:\n\n${text}`, primary: true },
        { label: 'Summarize', icon: '📋', prompt: `Summarize the key takeaways from this data:\n\n${text}` },
        { label: 'Create chart', icon: '📈', prompt: `What would be the best chart to visualize this data and why? Describe what the chart would show:\n\n${text}` },
      ],
    };
  }

  // Meeting notes (loose detection)
  if (
    (lower.includes('action item') || lower.includes('next step') || lower.includes('follow up') ||
     lower.includes('attendee') || lower.includes('discussed') || lower.includes('agreed')) &&
    lines.length > 3
  ) {
    return {
      kind: 'meeting_notes',
      confidence: 0.78,
      summary: `Meeting notes (${lines.length} lines)`,
      actions: [
        { label: 'Extract action items', icon: '✅', prompt: `Extract all action items and assign owners from these meeting notes:\n\n${text}`, primary: true },
        { label: 'Send summary email', icon: '📧', prompt: `Draft a "meeting summary" email from these notes to share with attendees:\n\n${text}` },
        { label: 'Schedule follow-ups', icon: '📅', prompt: `From these meeting notes, identify and schedule the necessary follow-up actions:\n\n${text}` },
        { label: 'Save to Docs', icon: '📝', prompt: `Save these meeting notes as a formatted Google Doc with action items highlighted:\n\n${text}` },
      ],
    };
  }

  // Contract / legal text
  if (
    lower.includes('whereas') || lower.includes('hereinafter') || lower.includes('indemnif') ||
    lower.includes('shall not') || lower.includes('party of the') || lower.includes('agreement') ||
    lower.includes('confidential') || lower.includes('governing law')
  ) {
    return {
      kind: 'contract_text',
      confidence: 0.85,
      summary: 'Contract / legal document',
      actions: [
        { label: 'Summarize key terms', icon: '📋', prompt: `Summarize the key terms, obligations, and rights in plain English:\n\n${text}`, primary: true },
        { label: 'Flag risks', icon: '⚠️', prompt: `Identify any unusual, risky, or one-sided clauses I should be aware of:\n\n${text}` },
        { label: 'Questions to ask', icon: '❓', prompt: `What questions should I ask the other party before signing?\n\n${text}` },
      ],
    };
  }

  // Default: generic text
  const wordCount = text.split(/\s+/).length;
  const isLong = wordCount > 100;

  return {
    kind: 'generic_text',
    confidence: 0.6,
    summary: `${wordCount} word${wordCount !== 1 ? 's' : ''}`,
    actions: [
      { label: 'Summarize', icon: '📋', prompt: `Summarize this text concisely:\n\n${text}`, primary: isLong },
      { label: 'Key points', icon: '🎯', prompt: `Extract the 3-5 most important points from this text:\n\n${text}` },
      { label: 'Ask about it', icon: '💬', prompt: `I want to ask about this text: ${text.slice(0, 200)}${text.length > 200 ? '…' : ''}` },
      ...(isLong ? [{ label: 'Rewrite shorter', icon: '✂️', prompt: `Rewrite this text more concisely while keeping all key information:\n\n${text}` }] : []),
    ],
  };
}

const KIND_CONFIG: Record<ContentKind, { icon: string; label: string; color: string }> = {
  email_thread:    { icon: '📧', label: 'Email thread',    color: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30' },
  url:             { icon: '🌐', label: 'URL',             color: 'text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950/30' },
  meeting_notes:   { icon: '📝', label: 'Meeting notes',   color: 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30' },
  error_log:       { icon: '🐛', label: 'Error log',       color: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30' },
  code:            { icon: '💻', label: 'Code',            color: 'text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/30' },
  contract_text:   { icon: '⚖️', label: 'Contract',        color: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30' },
  calendar_invite: { icon: '📅', label: 'Meeting invite',  color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30' },
  phone_number:    { icon: '📞', label: 'Phone number',    color: 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800' },
  address:         { icon: '📍', label: 'Address',         color: 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30' },
  json_data:       { icon: '🗂️', label: 'JSON data',       color: 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/30' },
  table_data:      { icon: '📊', label: 'Table / CSV',     color: 'text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/30' },
  generic_text:    { icon: '📄', label: 'Text',            color: 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800' },
};

// ── Component ──

export default function SmartPaste({ pastedText, onAction, onDismiss, className }: Props) {
  const [analysis, setAnalysis] = useState<ContentAnalysis | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pastedText.trim()) return;
    const result = classifyContent(pastedText.trim());
    setAnalysis(result);
    setDismissed(false);
  }, [pastedText]);

  const handleAction = useCallback((action: SmartPasteAction) => {
    onAction(action.prompt);
    setDismissed(true);
  }, [onAction]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    onDismiss();
  }, [onDismiss]);

  if (!analysis || dismissed) return null;

  const cfg = KIND_CONFIG[analysis.kind];

  return (
    <div
      ref={containerRef}
      className={cn(
        'rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg overflow-hidden',
        'animate-in fade-in slide-in-from-bottom-2 duration-200',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded-full', cfg.color)}>
            {cfg.icon} {cfg.label}
          </span>
          <span className="text-[11px] text-gray-400 truncate max-w-[180px]">
            {analysis.summary}
          </span>
        </div>
        <button
          onClick={handleDismiss}
          className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 ml-2"
        >
          ✕
        </button>
      </div>

      {/* Actions */}
      <div className="p-2 flex flex-wrap gap-1.5">
        {analysis.actions.map((action, i) => (
          <button
            key={i}
            onClick={() => handleAction(action)}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium transition-all',
              'border',
              action.primary
                ? 'bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-600 shadow-sm'
                : 'bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700'
            )}
          >
            <span>{action.icon}</span>
            <span>{action.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Hook: detect paste in textarea ──

export interface PasteEvent {
  text: string;
  timestamp: number;
}

export function useSmartPaste(
  minLength = 50,
): {
  pasteEvent: PasteEvent | null;
  clearPaste: () => void;
} {
  const [pasteEvent, setPasteEvent] = useState<PasteEvent | null>(null);

  const handlePaste = useCallback((e: ClipboardEvent) => {
    const text = e.clipboardData?.getData('text/plain') ?? '';
    if (text.length >= minLength) {
      setPasteEvent({ text, timestamp: Date.now() });
    }
  }, [minLength]);

  useEffect(() => {
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [handlePaste]);

  return {
    pasteEvent,
    clearPaste: () => setPasteEvent(null),
  };
}

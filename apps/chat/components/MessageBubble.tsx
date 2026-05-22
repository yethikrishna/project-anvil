/**
 * MessageBubble — renders a single chat message with:
 * - Rich markdown rendering (tables, code, links)
 * - Inline file/email/calendar cards
 * - Tool call visualization with status
 * - Voice input badge
 * - Message actions (copy, read aloud, bookmark)
 * - Streaming cursor during generation
 */

'use client';

import { useState, useMemo, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@anvil/ui';
import type { ChatMessage, ToolCallResult } from '@/lib/types';
import VoiceOutput from './VoiceOutput';

interface Props {
  message: ChatMessage;
  isStreaming?: boolean;
  isLast?: boolean;
}

// ── Tool Call Card ──

const TOOL_ICONS: Record<string, string> = {
  email_search: '✉️',
  email_send: '📤',
  email_read_thread: '📨',
  email_save_draft: '📝',
  file_search: '🔍',
  file_read: '📄',
  file_share: '🔗',
  document_write: '✏️',
  calendar_create_event: '📅',
  calendar_check_availability: '🕐',
  web_search: '🌐',
};

function ToolCallCard({ tc }: { tc: ToolCallResult }) {
  const [expanded, setExpanded] = useState(false);
  const toolName = tc.tool.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const icon = TOOL_ICONS[tc.tool] ?? '🔧';

  const statusStyles = {
    running: 'border-blue-200 bg-blue-50/80 dark:border-blue-800 dark:bg-blue-950/50',
    success: 'border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/30',
    error: 'border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/30',
  };

  const statusBadge = {
    running: { text: '⟳ Running...', cls: 'text-blue-500' },
    success: { text: `✓ ${tc.duration ?? 0}ms`, cls: 'text-green-600 dark:text-green-400' },
    error: { text: '✗ Failed', cls: 'text-red-600 dark:text-red-400' },
  };

  // Parse result for display
  let resultPreview = '';
  let resultData: unknown = null;
  try {
    resultData = JSON.parse(tc.result);
    resultPreview = JSON.stringify(resultData, null, 2);
    if (resultPreview.length > 200 && !expanded) {
      resultPreview = resultPreview.slice(0, 200) + '\n...';
    }
  } catch {
    resultPreview = tc.result.slice(0, 200);
  }

  // Extract summary from common tool results
  const resultSummary = useMemo(() => {
    if (!resultData || typeof resultData !== 'object') return null;
    const d = resultData as Record<string, unknown>;

    // Search results
    if (Array.isArray(d.results)) {
      return `${d.results.length} result${d.results.length !== 1 ? 's' : ''} found`;
    }
    // Success
    if (d.success) {
      if (d.messageId) return 'Email sent';
      if (d.draftId) return 'Draft saved';
      if (d.url || d.link) return 'Link created';
      return 'Done';
    }
    // Error
    if (d.error) return `Error: ${String(d.error)}`;
    return null;
  }, [resultData]);

  return (
    <div className={cn(
      'rounded-lg border text-xs overflow-hidden transition-all',
      statusStyles[tc.status],
    )}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
      >
        <span className="text-sm">{icon}</span>
        <span className="font-semibold text-gray-700 dark:text-gray-300">{toolName}</span>
        <span className={cn('text-[10px] font-medium ml-auto', statusBadge[tc.status].cls)}>
          {statusBadge[tc.status].text}
        </span>
        <span className="text-gray-400 text-[10px]">{expanded ? '▲' : '▼'}</span>
      </button>

      {/* Result summary */}
      {resultSummary && !expanded && (
        <div className="px-3 pb-2 text-[10px] text-gray-500 dark:text-gray-400">
          {resultSummary}
        </div>
      )}

      {/* Expanded result */}
      {expanded && (
        <div className="px-3 pb-2">
          {resultPreview && (
            <pre className="whitespace-pre-wrap text-[10px] font-mono text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-900 rounded p-2 max-h-48 overflow-auto">
              {resultPreview}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// ── Message Actions ──

function MessageActions({ message, isLast }: { message: ChatMessage; isLast: boolean }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [message.content]);

  return (
    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
      <button
        onClick={handleCopy}
        className="text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 px-1.5 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
        title="Copy message"
      >
        {copied ? '✓ Copied' : '📋 Copy'}
      </button>
      {message.role === 'assistant' && isLast && (
        <VoiceOutput text={message.content} />
      )}
    </div>
  );
}

// ── Main Component ──

export default function MessageBubble({ message, isStreaming, isLast }: Props) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  // System messages (summaries, context notes)
  if (isSystem) {
    return (
      <div className="px-4 py-2">
        <div className="text-[10px] text-gray-400 italic text-center max-w-md mx-auto">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      'group flex gap-3 px-4 py-2.5 transition-colors',
      isUser ? '' : '',
    )}>
      {/* Avatar */}
      {!isUser && (
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5 shadow-sm">
          A
        </div>
      )}

      <div className={cn('min-w-0', isUser ? 'max-w-[75%] ml-auto' : 'max-w-[75%]')}>
        {/* Bubble */}
        <div className={cn(
          'rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
          isUser
            ? 'bg-blue-600 text-white rounded-br-md'
            : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-md',
        )}>
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className={cn('prose-chat', isStreaming && 'streaming-cursor')}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  // Custom link rendering
                  a: ({ href, children }) => (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        'underline underline-offset-2',
                        isUser
                          ? 'text-blue-200 hover:text-white'
                          : 'text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300',
                      )}
                    >
                      {children}
                    </a>
                  ),
                  // Custom code rendering
                  code: ({ className, children }) => {
                    const isInline = !className;
                    if (isInline) {
                      return (
                        <code className={cn(
                          'px-1.5 py-0.5 rounded text-xs font-mono',
                          isUser
                            ? 'bg-blue-500/30 text-blue-100'
                            : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200',
                        )}>
                          {children}
                        </code>
                      );
                    }
                    return <code className={className}>{children}</code>;
                  },
                  // Table styling
                  table: ({ children }) => (
                    <div className="overflow-x-auto my-2">
                      <table className="w-full text-xs border-collapse">{children}</table>
                    </div>
                  ),
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {/* Tool calls */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {message.toolCalls.map(tc => (
              <ToolCallCard key={tc.id} tc={tc} />
            ))}
          </div>
        )}

        {/* Meta row */}
        <div className={cn(
          'flex items-center gap-2 mt-1',
          isUser ? 'justify-end' : 'justify-start',
        )}>
          <span className="text-[10px] text-gray-400">
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          {message.voiceInput && (
            <span className="text-[10px] text-gray-400" title="Voice input">🎤</span>
          )}
          <MessageActions message={message} isLast={isLast ?? false} />
        </div>
      </div>

      {/* User avatar */}
      {isUser && (
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-600 dark:to-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-300 text-xs font-bold shrink-0 mt-0.5 shadow-sm">
          U
        </div>
      )}
    </div>
  );
}

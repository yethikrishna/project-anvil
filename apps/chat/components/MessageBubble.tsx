/**
 * MessageBubble — renders a single chat message with:
 * - Rich markdown rendering (tables, code, links)
 * - Rich tool result cards (email previews, file cards, calendar, web results)
 * - Voice input badge
 * - Message actions (copy, read aloud, bookmark)
 * - Streaming cursor during generation
 * - Collapsible thinking/reasoning sections
 */

'use client';

import { useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@anvil/ui';
import type { ChatMessage } from '@/lib/types';
import VoiceOutput from './VoiceOutput';
import RichToolResults from './RichToolResults';
import WorkflowProgress, { type WorkflowStepResult } from './WorkflowProgress';

function toWorkflowStep(tc: import('@/lib/types').ToolCallResult): WorkflowStepResult {
  return {
    name: tc.tool.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    tool: tc.tool,
    success: tc.status === 'success',
    result: typeof tc.result === 'string' ? tc.result : JSON.stringify(tc.result),
    duration: tc.duration ?? 0,
  };
}

interface Props {
  message: ChatMessage;
  isStreaming?: boolean;
  isLast?: boolean;
  onSuggestionClick?: (text: string) => void;
  onRegenerate?: () => void;
}

// ── Follow-up suggestion generator ──

function generateFollowUpSuggestions(message: ChatMessage): string[] {
  const toolNames = message.toolCalls?.map(tc => tc.tool) ?? [];
  const content = message.content.toLowerCase();

  if (toolNames.includes('email_search') || content.includes('email') || content.includes('inbox')) {
    return ['Draft a reply to the most urgent one', 'Archive the low priority emails', 'Schedule a time to address these'];
  }
  if (toolNames.includes('file_search') || toolNames.includes('file_read')) {
    return ['Summarize the key points', 'Share this with the team', 'Create a doc from this content'];
  }
  if (toolNames.includes('calendar_check_availability') || toolNames.includes('calendar_create_event')) {
    return ['Send meeting invites', 'Add agenda to this event', 'Check next week\'s availability'];
  }
  if (toolNames.includes('email_save_draft')) {
    return ['Review the draft', 'Send it now', 'Adjust the tone to be more casual'];
  }
  if (toolNames.includes('web_search')) {
    return ['Tell me more about the top result', 'Save this to Drive', 'Find related articles'];
  }
  // Attention scan
  if (content.includes('attention') || content.includes('urgent') || content.includes('priority')) {
    return ['Draft replies for the urgent items', 'Mark the low-priority ones for later', 'Give me a summary of what to do today'];
  }
  return [];
}

// ── Message Actions ──

function MessageActions({ message, isLast, onRegenerate }: { message: ChatMessage; isLast: boolean; onRegenerate?: () => void }) {
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
        {copied ? '✓ Copied' : 'Copy'}
      </button>
      {message.role === 'assistant' && isLast && onRegenerate && (
        <button
          onClick={onRegenerate}
          className="text-[10px] text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 px-1.5 py-0.5 rounded hover:bg-indigo-50 dark:hover:bg-indigo-950/30"
          title="Regenerate response"
        >
          ↺ Retry
        </button>
      )}
      {message.role === 'assistant' && isLast && (
        <VoiceOutput text={message.content} />
      )}
    </div>
  );
}

// ── Main Component ──

export default function MessageBubble({ message, isStreaming, isLast, onSuggestionClick, onRegenerate }: Props) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const hasToolCalls = message.toolCalls && message.toolCalls.length > 0;
  const suggestions = isLast && !isUser && !isStreaming && onSuggestionClick
    ? generateFollowUpSuggestions(message)
    : [];

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
    )}>
      {/* Avatar */}
      {!isUser && (
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5 shadow-sm">
          A
        </div>
      )}

      <div className={cn('min-w-0', isUser ? 'max-w-[75%] ml-auto' : 'max-w-[85%]')}>
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
                    return (
                      <pre className="bg-[#1e1e2e] text-[#cdd6f4] rounded-lg p-3 overflow-x-auto my-2 text-xs leading-relaxed">
                        <code className={className}>{children}</code>
                      </pre>
                    );
                  },
                  table: ({ children }) => (
                    <div className="overflow-x-auto my-2">
                      <table className="w-full text-xs border-collapse">{children}</table>
                    </div>
                  ),
                  th: ({ children }) => (
                    <th className="border border-gray-200 dark:border-gray-700 px-3 py-1.5 bg-gray-50 dark:bg-gray-800 text-left text-[11px] font-semibold uppercase tracking-wide">
                      {children}
                    </th>
                  ),
                  td: ({ children }) => (
                    <td className="border border-gray-200 dark:border-gray-700 px-3 py-1.5">
                      {children}
                    </td>
                  ),
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {/* Rich tool results */}
        {hasToolCalls && !isUser && (
          message.toolCalls!.length > 1 ? (
            <WorkflowProgress
              steps={message.toolCalls!.map(toWorkflowStep)}
              isRunning={false}
              summary={`${message.toolCalls!.filter(tc => tc.status === 'success').length}/${message.toolCalls!.length} steps completed`}
              totalDurationMs={message.toolCalls!.reduce((sum, tc) => sum + (tc.duration ?? 0), 0)}
            />
          ) : (
            <RichToolResults toolCalls={message.toolCalls!} />
          )
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
          {hasToolCalls && (
            <span className="text-[10px] text-gray-400">
              {message.toolCalls!.length} tool{message.toolCalls!.length !== 1 ? 's' : ''}
            </span>
          )}
          <MessageActions message={message} isLast={isLast ?? false} onRegenerate={onRegenerate} />
        </div>
      </div>

      {/* Follow-up suggestion chips */}
        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => onSuggestionClick!(s)}
                className="text-[11px] px-2.5 py-1 rounded-full border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-blue-300 dark:hover:border-blue-700 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-950/30 transition-all"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      {isUser && (
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-600 dark:to-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-300 text-xs font-bold shrink-0 mt-0.5 shadow-sm">
          U
        </div>
      )}
    </div>
  );
}

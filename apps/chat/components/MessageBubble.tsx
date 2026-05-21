/**
 * MessageBubble — renders a single chat message with markdown,
 * tool call cards, and streaming cursor.
 */

'use client';

import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@anvil/ui';
import type { ChatMessage, ToolCallResult } from '@/lib/types';

interface Props {
  message: ChatMessage;
  isStreaming?: boolean;
}

function ToolCallCard({ tc }: { tc: ToolCallResult }) {
  const toolName = tc.tool.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const statusColors = {
    running: 'border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-950',
    success: 'border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-950',
    error: 'border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-950',
  };

  let displayResult = tc.result;
  try {
    const parsed = JSON.parse(tc.result);
    displayResult = JSON.stringify(parsed, null, 2);
    if (displayResult.length > 300) displayResult = displayResult.slice(0, 300) + '\n...';
  } catch {}

  return (
    <div className={cn(
      'rounded-lg border p-3 text-xs font-mono tool-card-enter',
      statusColors[tc.status]
    )}>
      <div className="flex items-center gap-2 mb-1">
        <span className="font-semibold text-gray-700 dark:text-gray-300">{toolName}</span>
        <span className={cn(
          'px-1.5 py-0.5 rounded text-[10px] font-medium uppercase',
          tc.status === 'running' && 'text-blue-600 dark:text-blue-400',
          tc.status === 'success' && 'text-green-600 dark:text-green-400',
          tc.status === 'error' && 'text-red-600 dark:text-red-400',
        )}>
          {tc.status === 'running' && '⟳ Running...'}
          {tc.status === 'success' && `✓ ${tc.duration}ms`}
          {tc.status === 'error' && '✗ Error'}
        </span>
      </div>
      {tc.status !== 'running' && (
        <pre className="whitespace-pre-wrap text-gray-600 dark:text-gray-400 max-h-32 overflow-auto">
          {displayResult}
        </pre>
      )}
    </div>
  );
}

export default function MessageBubble({ message, isStreaming }: Props) {
  const isUser = message.role === 'user';

  return (
    <div className={cn(
      'flex gap-3 px-4 py-3',
      isUser ? 'justify-end' : 'justify-start',
    )}>
      {/* AI avatar */}
      {!isUser && (
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold shrink-0 mt-0.5">
          A
        </div>
      )}

      <div className={cn(
        'max-w-[75%] min-w-0',
      )}>
        {/* Message bubble */}
        <div className={cn(
          'rounded-2xl px-4 py-2.5 text-sm',
          isUser
            ? 'bg-blue-600 text-white rounded-br-md'
            : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-md',
        )}>
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className={cn('prose-chat', isStreaming && 'streaming-cursor')}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {/* Tool calls */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mt-2 space-y-2">
            {message.toolCalls.map(tc => (
              <ToolCallCard key={tc.id} tc={tc} />
            ))}
          </div>
        )}

        {/* Timestamp */}
        <div className={cn(
          'text-[10px] text-gray-400 mt-1',
          isUser ? 'text-right' : 'text-left',
        )}>
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          {message.voiceInput && ' 🎤'}
        </div>
      </div>

      {/* User avatar */}
      {isUser && (
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-600 dark:to-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-300 text-sm font-bold shrink-0 mt-0.5">
          U
        </div>
      )}
    </div>
  );
}

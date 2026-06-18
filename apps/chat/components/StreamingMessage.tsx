/**
 * StreamingMessage — renders a live-streaming AI response with:
 * - Collapsible thinking/reasoning display (extended thinking)
 * - Progressive text rendering with markdown
 * - Live tool call cards appearing as they execute
 * - Multi-step workflow progress bar
 * - Cancel button
 */

'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@anvil/ui';
import type { ToolCallResult } from '@/lib/types';
import RichToolResults from './RichToolResults';
import WorkflowProgress, { type WorkflowStepResult } from './WorkflowProgress';
import ThinkingDisplay from './ThinkingDisplay';

interface Props {
  text: string;
  toolCalls: ToolCallResult[];
  onCancel: () => void;
  onAction?: (prompt: string) => void;
  /** Extended reasoning text (from o1/Claude extended thinking) */
  thinking?: string;
  isThinking?: boolean;
}

function toWorkflowStep(tc: ToolCallResult): WorkflowStepResult {
  return {
    name: tc.tool.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    tool: tc.tool,
    success: tc.status === 'success',
    result: typeof tc.result === 'string' ? tc.result : JSON.stringify(tc.result),
    duration: tc.duration ?? 0,
  };
}

export default function StreamingMessage({ text, toolCalls, onCancel, onAction, thinking, isThinking }: Props) {
  const completedTools = toolCalls.filter(tc => tc.status !== 'running');
  const runningTools = toolCalls.filter(tc => tc.status === 'running');
  const isMultiStep = toolCalls.length > 1;
  const currentStepIdx = completedTools.length;

  return (
    <div className="flex gap-3 px-4 py-2.5">
      {/* Avatar */}
      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5 shadow-sm">
        A
      </div>

      <div className="max-w-[85%] min-w-0 space-y-2">
        {/* Thinking display (extended reasoning) */}
        {(thinking || isThinking) && (
          <ThinkingDisplay
            thinking={thinking ?? ''}
            isStreaming={isThinking && !text}
          />
        )}
        {/* Streaming text */}
        {text && (
          <div className="rounded-2xl rounded-bl-md bg-gray-100 dark:bg-gray-800 px-4 py-2.5 text-sm">
            <div className="prose-chat streaming-cursor">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  a: ({ href, children }) => (
                    <a href={href} target="_blank" rel="noopener noreferrer"
                       className="text-blue-600 dark:text-blue-400 underline underline-offset-2">
                      {children}
                    </a>
                  ),
                  code: ({ className, children }) => {
                    if (!className) {
                      return (
                        <code className="px-1.5 py-0.5 rounded text-xs font-mono bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200">
                          {children}
                        </code>
                      );
                    }
                    return (
                      <pre className="bg-[#1e1e2e] text-[#cdd6f4] rounded-lg p-3 overflow-x-auto my-2 text-xs">
                        <code className={className}>{children}</code>
                      </pre>
                    );
                  },
                }}
              >
                {text}
              </ReactMarkdown>
            </div>
          </div>
        )}

        {/* Multi-step workflow progress — shown for chains of 2+ tools */}
        {isMultiStep ? (
          <div className="mt-2">
            <WorkflowProgress
              steps={toolCalls.map(toWorkflowStep)}
              isRunning={runningTools.length > 0}
              currentStep={currentStepIdx}
            />
          </div>
        ) : (
          <>
            {/* Completed tool results (single-tool) */}
            {completedTools.length > 0 && (
              <RichToolResults toolCalls={completedTools} onAction={onAction} />
            )}

            {/* Running tools indicator (single-tool) */}
            {runningTools.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {runningTools.map(tc => (
                  <div key={tc.id} className="tool-card-enter rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/30 px-3.5 py-2.5 flex items-center gap-2">
                    <span className="text-blue-500 animate-pulse text-xs">⟳</span>
                    <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
                      {tc.tool.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                    </span>
                    <span className="text-[10px] text-blue-400 ml-auto">Running...</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Cancel + status */}
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[10px] text-gray-400">
            {text ? `${text.split(/\s+/).length} words` : 'Thinking...'}
          </span>
          <button
            onClick={onCancel}
            className="text-[10px] text-gray-400 hover:text-red-500 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * useChatStream — React hook for SSE-based chat streaming with
 * tool call visualization, context tracking, approval gating,
 * and error recovery.
 *
 * Properly parses named SSE events:
 *   event: delta    → streaming text chunk
 *   event: tool     → tool call result
 *   event: pending_approval → approval needed
 *   event: done     → final message + context updates
 *   event: error    → server error
 */

'use client';

import { useState, useCallback, useRef } from 'react';
import type { ChatMessage, ToolCallResult, ConversationContext } from './types';
import { addMessage, updateContext, extractContextFromToolCall } from './memory';

interface UseChatStreamOptions {
  onError?: (error: Error) => void;
  onToolCall?: (tc: ToolCallResult) => void;
  onComplete?: (message: ChatMessage, toolCalls: ToolCallResult[]) => void;
  onPendingApproval?: (toolId: string, toolName: string, args: Record<string, unknown>) => void;
  userPatternSummary?: string;
  settings?: {
    requireApprovalForEmail?: boolean;
    requireApprovalForCalendar?: boolean;
    communicationStyle?: string;
    emailTone?: string;
  };
  approvedToolIds?: Set<string>;
}

interface UseChatStreamReturn {
  send: (convId: string, text: string, history: ChatMessage[], context: ConversationContext) => Promise<void>;
  streamingText: string;
  activeToolCalls: ToolCallResult[];
  isLoading: boolean;
  error: Error | null;
  cancel: () => void;
}

/** Parse SSE stream into { event, data } blocks */
function parseSseLine(buffer: string): Array<{ event: string; data: unknown }> {
  const results: Array<{ event: string; data: unknown }> = [];
  const blocks = buffer.split('\n\n');

  for (const block of blocks) {
    if (!block.trim()) continue;
    let eventName = 'message';
    let dataStr = '';

    for (const line of block.split('\n')) {
      if (line.startsWith('event: ')) {
        eventName = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        dataStr = line.slice(6);
      }
    }

    if (!dataStr.trim()) continue;

    try {
      results.push({ event: eventName, data: JSON.parse(dataStr) });
    } catch {
      // skip malformed
    }
  }

  return results;
}

export function useChatStream(options: UseChatStreamOptions = {}): UseChatStreamReturn {
  const [streamingText, setStreamingText] = useState('');
  const [activeToolCalls, setActiveToolCalls] = useState<ToolCallResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(async (
    convId: string,
    text: string,
    history: ChatMessage[],
    context: ConversationContext,
  ) => {
    setIsLoading(true);
    setStreamingText('');
    setActiveToolCalls([]);
    setError(null);

    const abortController = new AbortController();
    abortRef.current = abortController;

    let finalToolCalls: ToolCallResult[] = [];

    try {
      // Save user message to local DB
      await addMessage(convId, { role: 'user', content: text });

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortController.signal,
        body: JSON.stringify({
          conversationId: convId,
          message: text,
          history: history.map(m => ({ role: m.role, content: m.content })),
          context,
          userPatterns: options.userPatternSummary,
          settings: options.settings,
          approvedToolIds: options.approvedToolIds ? Array.from(options.approvedToolIds) : [],
        }),
      });

      if (!res.ok || !res.body) throw new Error(`Chat API error: ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let rawBuffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        rawBuffer += decoder.decode(value, { stream: true });

        // Process complete SSE blocks (separated by \n\n)
        const lastDoubleNewline = rawBuffer.lastIndexOf('\n\n');
        if (lastDoubleNewline === -1) continue;

        const toProcess = rawBuffer.slice(0, lastDoubleNewline + 2);
        rawBuffer = rawBuffer.slice(lastDoubleNewline + 2);

        const events = parseSseLine(toProcess);

        for (const { event, data } of events) {
          const d = data as Record<string, unknown>;

          switch (event) {
            case 'delta': {
              // Streaming text chunk
              const chunk = (d.content as string) ?? '';
              if (chunk) setStreamingText(prev => prev + chunk);
              break;
            }

            case 'tool': {
              // Tool call result
              const tc = d as unknown as ToolCallResult;
              finalToolCalls = [...finalToolCalls, tc];
              setActiveToolCalls(prev => {
                // Update existing or append
                const idx = prev.findIndex(x => x.id === tc.id);
                if (idx >= 0) {
                  const updated = [...prev];
                  updated[idx] = tc;
                  return updated;
                }
                return [...prev, tc];
              });
              options.onToolCall?.(tc);

              // Accumulate context from tool call
              const ctxUpdate = extractContextFromToolCall(tc.tool, tc.args, tc.result);
              await updateContext(convId, (ctx) => ({
                ...ctx,
                files: [...ctx.files, ...(ctxUpdate.files ?? [])].slice(-20),
                people: [...new Set([...ctx.people, ...(ctxUpdate.people ?? [])])].slice(-20),
                topics: [...new Set([...ctx.topics, ...(ctxUpdate.topics ?? [])])].slice(-20),
                actions: [
                  ...ctx.actions,
                  {
                    tool: tc.tool,
                    action: tc.tool,
                    timestamp: Date.now(),
                    success: tc.status === 'success',
                  },
                ].slice(-50),
              }));
              break;
            }

            case 'pending_approval': {
              const { toolId, toolName, args } = d as {
                toolId: string;
                toolName: string;
                args: Record<string, unknown>;
              };
              options.onPendingApproval?.(toolId, toolName, args);
              break;
            }

            case 'done': {
              // Final message + context updates
              const msg = d.message as ChatMessage | undefined;
              if (msg) {
                // Merge tool calls collected during streaming
                if (finalToolCalls.length > 0 && (!msg.toolCalls || msg.toolCalls.length === 0)) {
                  msg.toolCalls = finalToolCalls;
                }
                options.onComplete?.(msg, finalToolCalls);
              }

              // Apply any context updates from the engine
              if (d.contextUpdates) {
                const updates = d.contextUpdates as Partial<ConversationContext>;
                await updateContext(convId, (ctx) => ({
                  ...ctx,
                  ...updates,
                  files: [...ctx.files, ...(updates.files ?? [])].slice(-20),
                  people: [...new Set([...ctx.people, ...(updates.people ?? [])])].slice(-20),
                  topics: [...new Set([...ctx.topics, ...(updates.topics ?? [])])].slice(-20),
                  preferences: [...new Set([...ctx.preferences, ...(updates.preferences ?? [])])].slice(-20),
                }));
              }
              break;
            }

            case 'error': {
              throw new Error((d.message as string) ?? 'Stream error');
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      options.onError?.(error);
    } finally {
      setIsLoading(false);
      setStreamingText('');
      setActiveToolCalls([]);
    }
  }, [options]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setIsLoading(false);
    setStreamingText('');
    setActiveToolCalls([]);
  }, []);

  return { send, streamingText, activeToolCalls, isLoading, error, cancel };
}

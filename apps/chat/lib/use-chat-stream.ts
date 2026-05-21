/**
 * useChatStream — React hook for SSE-based chat streaming with
 * tool call visualization, context tracking, and error recovery.
 */

'use client';

import { useState, useCallback, useRef } from 'react';
import type { ChatMessage, ToolCallResult, ConversationContext } from './types';
import { addMessage, updateMessage, updateContext, extractContextFromToolCall } from './memory';

interface UseChatStreamOptions {
  onError?: (error: Error) => void;
  onToolCall?: (tc: ToolCallResult) => void;
  onComplete?: (message: ChatMessage, toolCalls: ToolCallResult[]) => void;
}

interface UseChatStreamReturn {
  send: (convId: string, text: string, history: ChatMessage[], context: ConversationContext) => Promise<void>;
  streamingText: string;
  activeToolCalls: ToolCallResult[];
  isLoading: boolean;
  error: Error | null;
  cancel: () => void;
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

    try {
      // Save user message
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
        }),
      });

      if (!res.ok || !res.body) throw new Error(`Chat API error: ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalToolCalls: ToolCallResult[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const dataStr = line.slice(6);
          if (!dataStr.trim()) continue;

          try {
            const data = JSON.parse(dataStr);

            if (data.content) {
              setStreamingText(prev => prev + data.content);
            }

            if (data.tool) {
              finalToolCalls.push(data.tool);
              setActiveToolCalls(prev => [...prev, data.tool]);
              options.onToolCall?.(data.tool);

              // Update context from tool call
              const ctxUpdate = extractContextFromToolCall(
                data.tool.tool, data.tool.args, data.tool.result
              );
              await updateContext(convId, (ctx) => ({
                ...ctx,
                files: [...ctx.files, ...(ctxUpdate.files ?? [])].slice(-20),
                people: [...new Set([...ctx.people, ...(ctxUpdate.people ?? [])])].slice(-20),
                topics: [...new Set([...ctx.topics, ...(ctxUpdate.topics ?? [])])].slice(-20),
                actions: [
                  ...ctx.actions,
                  {
                    tool: data.tool.tool,
                    action: data.tool.tool,
                    timestamp: Date.now(),
                    success: data.tool.status === 'success',
                  },
                ].slice(-50),
              }));
            }

            if (data.message) {
              const msg = data.message as ChatMessage;
              // Add tool calls from streaming if they weren't in the message
              if (finalToolCalls.length > 0 && (!msg.toolCalls || msg.toolCalls.length === 0)) {
                msg.toolCalls = finalToolCalls;
              }
              options.onComplete?.(msg, finalToolCalls);
            }
          } catch {
            // Skip malformed SSE data
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

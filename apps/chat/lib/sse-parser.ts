/**
 * Enhanced SSE Stream Parser — properly handles named SSE events.
 *
 * Parses `event: <type>\ndata: <json>\n\n` format.
 * Supports: start, delta, tool, done, error, progress events.
 */

export interface SSEEvent {
  event: string;
  data: unknown;
}

export type SSEEventHandler = (event: SSEEvent) => void;

/**
 * Parse an SSE stream from a Response object.
 * Handles buffering and partial chunks.
 */
export async function parseSSEStream(
  response: Response,
  handler: SSEEventHandler,
  signal?: AbortSignal,
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent = 'message';

  try {
    while (true) {
      if (signal?.aborted) {
        reader.cancel();
        break;
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();

        // Empty line = dispatch event
        if (trimmed === '') {
          continue;
        }

        // Event type
        if (trimmed.startsWith('event: ')) {
          currentEvent = trimmed.slice(7).trim();
          continue;
        }

        // Data line
        if (trimmed.startsWith('data: ')) {
          const dataStr = trimmed.slice(6);

          // [DONE] sentinel
          if (dataStr.trim() === '[DONE]') {
            handler({ event: 'done', data: null });
            return;
          }

          // Try JSON parse
          let data: unknown;
          try {
            data = JSON.parse(dataStr);
          } catch {
            data = dataStr;
          }

          handler({ event: currentEvent, data });
          // Reset event type after dispatch
          currentEvent = 'message';
          continue;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Chat-specific SSE event types.
 */
export interface ChatSSEEvents {
  onStart?: (data: { conversationId: string }) => void;
  onDelta?: (content: string) => void;
  onTool?: (toolCall: {
    id: string;
    tool: string;
    args: Record<string, unknown>;
    result: string;
    status: 'running' | 'success' | 'error';
    duration?: number;
  }) => void;
  onPendingApproval?: (data: { toolId: string; toolName: string; args: Record<string, unknown> }) => void;
  onDone?: (data: { message: unknown; toolCalls: unknown[]; contextUpdates?: unknown }) => void;
  onError?: (data: { message: string }) => void;
  onProgress?: (data: { step: number; message: string }) => void;
}

/**
 * Parse a chat SSE stream with typed handlers.
 */
export async function parseChatStream(
  response: Response,
  handlers: ChatSSEEvents,
  signal?: AbortSignal,
): Promise<void> {
  return parseSSEStream(response, (event) => {
    switch (event.event) {
      case 'start':
        handlers.onStart?.(event.data as { conversationId: string });
        break;
      case 'delta':
        if (typeof event.data === 'object' && event.data !== null) {
          const d = event.data as { content?: string };
          if (d.content) handlers.onDelta?.(d.content);
        }
        break;
      case 'tool':
        handlers.onTool?.(event.data as ChatSSEEvents['onTool'] extends (tc: infer T) => void ? T : never);
        break;
      case 'pending_approval':
        handlers.onPendingApproval?.(event.data as { toolId: string; toolName: string; args: Record<string, unknown> });
        break;
      case 'done':
        handlers.onDone?.(event.data as { message: unknown; toolCalls: unknown[]; contextUpdates?: unknown });
        break;
      case 'error':
        handlers.onError?.(event.data as { message: string });
        break;
      case 'progress':
        handlers.onProgress?.(event.data as { step: number; message: string });
        break;
    }
  }, signal);
}

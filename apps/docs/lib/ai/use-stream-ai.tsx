'use client';

/**
 * Streaming AI Client Hook
 *
 * Connects to /api/ai/streaming for real-time text generation.
 * Provides:
 * - Streaming text that appears character by character (Google Docs feel)
 * - Automatic insertion into the Tiptap editor
 * - Cancellation support
 * - Loading state management
 */

import {useState, useCallback, useRef} from 'react';
import type {Editor} from '@tiptap/react';

// ── Types ──

export type StreamStatus = 'idle' | 'loading' | 'streaming' | 'done' | 'error';

export interface StreamState {
  status: StreamStatus;
  text: string;
  error: string | null;
}

export interface UseStreamAIOptions {
  onChunk?: (text: string, accumulated: string) => void;
  onDone?: (fullText: string) => void;
  onError?: (error: string) => void;
}

// ── Hook ──

export function useStreamAI(editor: Editor | null, options?: UseStreamAIOptions) {
  const [state, setState] = useState<StreamState>({
    status: 'idle',
    text: '',
    error: null,
  });
  const abortRef = useRef<AbortController | null>(null);

  const stream = useCallback(async (
    action: string,
    payload: Record<string, unknown>,
    insertMode: 'replace-selection' | 'insert-at-cursor' | 'append' = 'insert-at-cursor',
  ) => {
    if (!editor) return;

    // Cancel any existing stream
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Save selection range for replacement
    const {from, to, empty} = editor.state.selection;
    const insertPos = empty ? editor.state.doc.content.size : from;

    setState({status: 'loading', text: '', error: null});

    let accumulated = '';

    try {
      const resp = await fetch('/api/ai/streaming', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({action, payload}),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({error: 'Stream failed'}));
        throw new Error(err.error || 'Stream failed');
      }

      setState(s => ({...s, status: 'streaming'}));

      const reader = resp.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const {done, value} = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, {stream: true});
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = JSON.parse(line.slice(6));

          if (data.type === 'delta' && data.text) {
            accumulated += data.text;
            setState(s => ({...s, text: accumulated}));

            // Live preview: update a temporary node in the editor
            // We use a custom approach: show text in a streaming decoration
            options?.onChunk?.(data.text, accumulated);
          } else if (data.type === 'done') {
            // Final insertion into editor
            if (accumulated) {
              const targetPos = insertMode === 'append'
                ? editor.state.doc.content.size
                : insertMode === 'replace-selection' && !empty
                  ? from
                  : editor.state.selection.from;

              const chain = editor.chain().focus();

              if (insertMode === 'replace-selection' && !empty) {
                chain.deleteRange({from, to}).insertContentAt(from, accumulated);
              } else {
                chain.insertContentAt(targetPos, accumulated);
              }
              chain.run();
            }

            setState(s => ({...s, status: 'done'}));
            options?.onDone?.(accumulated);
          } else if (data.type === 'error') {
            throw new Error(data.error);
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // User cancelled — still insert what we have so far
        if (accumulated) {
          const targetPos = insertMode === 'append'
            ? editor.state.doc.content.size
            : from;
          editor.chain().focus().insertContentAt(targetPos, accumulated).run();
        }
        setState({status: 'idle', text: accumulated, error: null});
        return;
      }
      const msg = err.message || 'Streaming failed';
      setState(s => ({...s, status: 'error', error: msg}));
      options?.onError?.(msg);
    } finally {
      abortRef.current = null;
    }
  }, [editor, options]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setState(s => ({...s, status: 'idle'}));
  }, []);

  return {state, stream, cancel};
}

// ── Streaming text display component ──

export function StreamingTextOverlay({state, position}: {
  state: StreamState;
  position?: {top: number; left: number};
}) {
  if (state.status === 'idle' || !state.text) return null;

  return (
    <div
      className="ai-streaming-overlay"
      style={position ? {top: position.top, left: position.left} : undefined}
    >
      <div className="ai-streaming-text">
        {state.text}
        {state.status === 'streaming' && (
          <span className="ai-streaming-cursor">▊</span>
        )}
      </div>
      {state.status === 'streaming' && (
        <button onClick={() => {}} className="ai-streaming-cancel">
          ✕ Stop
        </button>
      )}
    </div>
  );
}

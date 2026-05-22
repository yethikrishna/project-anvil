'use client';

/**
 * AI Compose with Streaming — Real-time text generation
 *
 * Enhanced compose modal that:
 * - Streams AI-generated text character by character
 * - Matches user's writing style from past emails
 * - Adjusts tone in real-time
 * - Suggests subject lines
 * - Shows word count and estimated read time
 */

import {useState, useCallback, useRef, useEffect} from 'react';

// ── Types ──

interface StreamingComposeState {
  to: string;
  subject: string;
  body: string;
  tone: 'professional' | 'friendly' | 'casual' | 'direct' | 'empathetic';
  length: 'brief' | 'medium' | 'detailed';
  isStreaming: boolean;
  isGeneratingSubject: boolean;
  wordCount: number;
  estimatedReadTime: string;
  streamProgress: number; // 0-1
}

// ── Hook ──

export function useStreamingCompose(
  threadContext?: Array<{from: {name: string; email: string}; body: string; date: string}>,
) {
  const [state, setState] = useState<StreamingComposeState>({
    to: '',
    subject: '',
    body: '',
    tone: 'professional',
    length: 'medium',
    isStreaming: false,
    isGeneratingSubject: false,
    wordCount: 0,
    estimatedReadTime: '0 min',
    streamProgress: 0,
  });

  const abortRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Update word count and read time when body changes
  useEffect(() => {
    const words = state.body.split(/\s+/).filter(w => w.length > 0).length;
    const readMinutes = Math.max(1, Math.ceil(words / 200));
    setState(prev => ({
      ...prev,
      wordCount: words,
      estimatedReadTime: words === 0 ? '0 min' : `~${readMinutes} min read`,
    }));
  }, [state.body]);

  // Pre-fill from thread context
  useEffect(() => {
    if (!threadContext || threadContext.length === 0) return;

    const lastEmail = threadContext[threadContext.length - 1];
    if (lastEmail.from.email !== 'me@anvil.local') {
      setState(prev => ({
        ...prev,
        to: lastEmail.from.email,
        subject: prev.subject || (lastEmail.body.startsWith('Re:') ? '' : `Re: `),
      }));
    }
  }, [threadContext]);

  // Stream compose
  const generateWithStreaming = useCallback(async (
    description?: string,
  ) => {
    abortRef.current = new AbortController();
    setState(prev => ({...prev, isStreaming: true, body: '', streamProgress: 0}));

    try {
      const threadMessages = threadContext?.slice(-5).map(m => ({
        from: m.from.email,
        body: m.body,
        date: m.date,
      })) || [];

      // Get writing style
      let writingStyle = 'professional, moderate length';
      try {
        const stored = localStorage.getItem('anvil-mail-writing-style');
        if (stored) {
          const profile = JSON.parse(stored);
          writingStyle = `${profile.tone || 'professional'}, ${profile.vocabularyLevel || 'moderate'} vocabulary`;
        }
      } catch {}

      const resp = await fetch('/api/ai/streaming', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          action: 'compose',
          payload: {
            threadMessages,
            subject: state.subject,
            to: state.to,
            intent: threadMessages.length > 0 ? 'reply' : 'new',
            writingStyle,
            tone: state.tone,
            length: state.length,
            description,
          },
        }),
        signal: abortRef.current.signal,
      });

      if (!resp.ok) throw new Error('Compose failed');

      const reader = resp.body?.getReader();
      if (!reader) throw new Error('No stream');

      const decoder = new TextDecoder();
      let fullText = '';
      let chunkCount = 0;
      const estimatedChunks = 50; // Rough estimate for progress

      while (true) {
        const {done, value} = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, {stream: true});
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'delta') {
              fullText += data.text;
              chunkCount++;
              setState(prev => ({
                ...prev,
                body: fullText,
                streamProgress: Math.min(1, chunkCount / estimatedChunks),
              }));
            } else if (data.type === 'error') {
              throw new Error(data.error);
            }
          } catch (e) {
            if (e instanceof Error && !e.message.startsWith('Unexpected')) throw e;
          }
        }
      }

      setState(prev => ({...prev, isStreaming: false, streamProgress: 1}));
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        console.error('Streaming compose failed:', err);
      }
      setState(prev => ({...prev, isStreaming: false}));
    } finally {
      abortRef.current = null;
    }
  }, [state.subject, state.to, state.tone, state.length, threadContext]);

  // Generate subject suggestions
  const generateSubject = useCallback(async () => {
    if (!state.body) return;

    setState(prev => ({...prev, isGeneratingSubject: true}));

    try {
      const resp = await fetch('/api/ai', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          action: 'compose',
          payload: {
            threadMessages: [],
            subject: '',
            intent: 'subject',
            body: state.body.slice(0, 500),
          },
        }),
      });

      if (resp.ok) {
        const data = await resp.json();
        if (data.subjectSuggestion) {
          setState(prev => ({...prev, subject: data.subjectSuggestion}));
        }
      }
    } catch {}
    finally {
      setState(prev => ({...prev, isGeneratingSubject: false}));
    }
  }, [state.body]);

  // Adjust tone with streaming
  const adjustTone = useCallback(async (targetTone: StreamingComposeState['tone']) => {
    if (!state.body) return;

    abortRef.current = new AbortController();
    setState(prev => ({...prev, isStreaming: true, tone: targetTone}));

    try {
      const resp = await fetch('/api/ai/streaming', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          action: 'compose',
          payload: {
            threadMessages: [],
            subject: state.subject,
            intent: 'new',
            tone: targetTone,
            length: state.length,
            body: state.body,
          },
        }),
        signal: abortRef.current.signal,
      });

      if (!resp.ok) throw new Error('Tone adjustment failed');

      const reader = resp.body?.getReader();
      if (!reader) throw new Error('No stream');

      const decoder = new TextDecoder();
      let fullText = '';

      while (true) {
        const {done, value} = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, {stream: true});
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'delta') {
              fullText += data.text;
              setState(prev => ({...prev, body: fullText}));
            }
          } catch {}
        }
      }

      setState(prev => ({...prev, isStreaming: false}));
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        console.error('Tone adjustment failed:', err);
      }
      setState(prev => ({...prev, isStreaming: false}));
    } finally {
      abortRef.current = null;
    }
  }, [state.body, state.subject, state.length]);

  // Cancel streaming
  const cancelStreaming = useCallback(() => {
    abortRef.current?.abort();
    setState(prev => ({...prev, isStreaming: false}));
  }, []);

  return {
    state,
    setTo: (to: string) => setState(prev => ({...prev, to})),
    setSubject: (subject: string) => setState(prev => ({...prev, subject})),
    setBody: (body: string) => setState(prev => ({...prev, body})),
    setTone: (tone: StreamingComposeState['tone']) => setState(prev => ({...prev, tone})),
    setLength: (length: StreamingComposeState['length']) => setState(prev => ({...prev, length})),
    generateWithStreaming,
    generateSubject,
    adjustTone,
    cancelStreaming,
    textareaRef,
  };
}

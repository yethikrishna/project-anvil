/**
 * React hooks for @anvil/ai — useChat, useCompletion, useEmbedding
 */

import {useState, useCallback, useRef} from 'react';
import type {Message, GenerationOptions, GenerationResult, AIProvider} from '../types.js';

// ── useChat ──

export interface UseChatOptions {
  provider: AIProvider;
  initialMessages?: Message[];
  generationOptions?: GenerationOptions;
  onError?: (error: Error) => void;
  onFinish?: (result: GenerationResult) => void;
}

export interface UseChatReturn {
  messages: Message[];
  input: string;
  setInput: (input: string) => void;
  append: (message: Message) => void;
  submit: () => Promise<void>;
  isLoading: boolean;
  error: Error | null;
  stop: () => void;
  reload: () => Promise<void>;
  setMessages: (messages: Message[]) => void;
}

export function useChat(options: UseChatOptions): UseChatReturn {
  const {provider, initialMessages = [], generationOptions, onError, onFinish} = options;
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const append = useCallback((message: Message) => {
    setMessages(prev => [...prev, message]);
  }, []);

  const submit = useCallback(async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {role: 'user', content: input.trim()};
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);
    setError(null);

    try {
      const result = await provider.generate(newMessages, {
        ...generationOptions,
        systemPrompt: generationOptions?.systemPrompt ?? 'You are a helpful AI assistant within the Anvil productivity suite. Be concise and helpful.',
      });

      const assistantMessage: Message = {
        role: 'assistant',
        content: result.text,
        ...(result.toolCalls ? {toolCalls: result.toolCalls} : {}),
      };

      setMessages(prev => [...prev, assistantMessage]);
      onFinish?.(result);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      onError?.(error);
    } finally {
      setIsLoading(false);
    }
  }, [input, messages, isLoading, provider, generationOptions, onFinish, onError]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setIsLoading(false);
  }, []);

  const reload = useCallback(async () => {
    // Remove last assistant message and regenerate
    setMessages(prev => {
      const lastAssistant = [...prev].reverse().findIndex(m => m.role === 'assistant');
      if (lastAssistant >= 0) {
        return prev.slice(0, prev.length - lastAssistant - 1);
      }
      return prev;
    });
  }, []);

  return {
    messages,
    input,
    setInput,
    append,
    submit,
    isLoading,
    error,
    stop,
    reload,
    setMessages,
  };
}

// ── useCompletion ──

export interface UseCompletionOptions {
  provider: AIProvider;
  generationOptions?: GenerationOptions;
  onError?: (error: Error) => void;
}

export interface UseCompletionReturn {
  completion: string;
  isLoading: boolean;
  error: Error | null;
  complete: (prompt: string) => Promise<string>;
  stop: () => void;
  setCompletion: (completion: string) => void;
}

export function useCompletion(options: UseCompletionOptions): UseCompletionReturn {
  const {provider, generationOptions, onError} = options;
  const [completion, setCompletion] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const complete = useCallback(async (prompt: string): Promise<string> => {
    setIsLoading(true);
    setError(null);
    setCompletion('');

    try {
      let fullText = '';

      const result = await provider.generateStream(
        [{role: 'user', content: prompt}],
        chunk => {
          if (chunk.delta) {
            fullText += chunk.delta;
            setCompletion(fullText);
          }
        },
        generationOptions
      );

      setCompletion(result.text);
      return result.text;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      onError?.(error);
      return '';
    } finally {
      setIsLoading(false);
    }
  }, [provider, generationOptions, onError]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setIsLoading(false);
  }, []);

  return {completion, isLoading, error, complete, stop, setCompletion};
}

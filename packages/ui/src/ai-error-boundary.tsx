'use client';

/**
 * AI Error Boundary for Anvil Apps
 *
 * Graceful degradation when AI features fail:
 * - Shows inline fallback UI instead of crashes
 * - Auto-retries with exponential backoff
 * - Queues failed requests for later retry
 * - Provides manual retry buttons
 */

import {Component, type ReactNode, type ErrorInfo} from 'react';

// ── Types ──

interface AIErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  featureName: string;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  enableRetry?: boolean;
  maxRetries?: number;
}

interface AIErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  retryCount: number;
  isRetrying: boolean;
}

// ── Error Queue ──

interface QueuedRequest {
  id: string;
  timestamp: number;
  action: string;
  payload: Record<string, unknown>;
  retryCount: number;
}

const ERROR_QUEUE_KEY = 'anvil-ai-error-queue';
const MAX_QUEUE_SIZE = 50;

function loadQueue(): QueuedRequest[] {
  try {
    const stored = localStorage.getItem(ERROR_QUEUE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveQueue(queue: QueuedRequest[]): void {
  try {
    const trimmed = queue.slice(-MAX_QUEUE_SIZE);
    localStorage.setItem(ERROR_QUEUE_KEY, JSON.stringify(trimmed));
  } catch {
    // Storage full — clear old entries
    localStorage.removeItem(ERROR_QUEUE_KEY);
  }
}

export function queueFailedRequest(action: string, payload: Record<string, unknown>): void {
  const queue = loadQueue();
  queue.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    action,
    payload,
    retryCount: 0,
  });
  saveQueue(queue);
}

export function getQueuedRequests(): QueuedRequest[] {
  return loadQueue();
}

export function clearQueue(): void {
  localStorage.removeItem(ERROR_QUEUE_KEY);
}

// ── Boundary Component ──

export class AIErrorBoundary extends Component<AIErrorBoundaryProps, AIErrorBoundaryState> {
  private retryTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(props: AIErrorBoundaryProps) {
    super(props);
    this.state = {hasError: false, error: null, retryCount: 0, isRetrying: false};
  }

  static getDerivedStateFromError(error: Error): Partial<AIErrorBoundaryState> {
    return {hasError: true, error};
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[AI Error Boundary: ${this.props.featureName}]`, error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  componentWillUnmount() {
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
    }
  }

  handleRetry = () => {
    const maxRetries = this.props.maxRetries ?? 3;
    if (this.state.retryCount >= maxRetries) return;

    this.setState({isRetrying: true});

    // Exponential backoff: 1s, 2s, 4s
    const delay = Math.pow(2, this.state.retryCount) * 1000;
    this.retryTimeout = setTimeout(() => {
      this.setState(prev => ({
        hasError: false,
        error: null,
        retryCount: prev.retryCount + 1,
        isRetrying: false,
      }));
    }, delay);
  };

  handleDismiss = () => {
    this.setState({hasError: false, error: null, retryCount: 0});
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const maxRetries = this.props.maxRetries ?? 3;
      const canRetry = this.state.retryCount < maxRetries;

      return (
        <div className="ai-error-boundary rounded-lg border border-amber-200 bg-amber-50 p-3 my-2">
          <div className="flex items-start gap-2">
            <span className="text-amber-500 text-lg">⚠️</span>
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800">
                {this.props.featureName} temporarily unavailable
              </p>
              <p className="text-xs text-amber-600 mt-0.5">
                {this.state.error?.message || 'An unexpected error occurred'}
              </p>
              {this.state.retryCount > 0 && (
                <p className="text-xs text-amber-500 mt-0.5">
                  Retry {this.state.retryCount}/{maxRetries}
                </p>
              )}
            </div>
            <div className="flex gap-1.5">
              {this.props.enableRetry !== false && canRetry && (
                <button
                  onClick={this.handleRetry}
                  disabled={this.state.isRetrying}
                  className="text-xs px-2.5 py-1 rounded-md bg-amber-100 text-amber-700 hover:bg-amber-200 disabled:opacity-50 transition-colors"
                >
                  {this.state.isRetrying ? 'Retrying...' : 'Retry'}
                </button>
              )}
              <button
                onClick={this.handleDismiss}
                className="text-xs px-2.5 py-1 rounded-md bg-white text-gray-500 hover:bg-gray-100 transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// ── Hook for AI calls with auto-retry ──

export function useAIWithErrorHandling() {
  const callWithRetry = async (
    action: string,
    payload: Record<string, unknown>,
    maxRetries: number = 2,
  ): Promise<{data: any | null; error: Error | null}> => {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const resp = await fetch('/api/ai', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({action, payload}),
        });

        if (!resp.ok) {
          const err = await resp.json().catch(() => ({error: 'Request failed'}));
          throw new Error(err.error || `HTTP ${resp.status}`);
        }

        const data = await resp.json();
        return {data, error: null};
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        if (attempt < maxRetries) {
          // Wait before retry (exponential backoff)
          await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 500));
        }
      }
    }

    // All retries exhausted — queue for later
    queueFailedRequest(action, payload);
    return {data: null, error: lastError};
  };

  const streamWithRetry = async (
    action: string,
    payload: Record<string, unknown>,
    onChunk: (delta: string) => void,
    maxRetries: number = 1,
  ): Promise<{text: string; error: Error | null}> => {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const resp = await fetch('/api/ai/streaming', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({action, payload}),
        });

        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

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
                onChunk(data.text);
              } else if (data.type === 'error') {
                throw new Error(data.error);
              }
            } catch (e) {
              if (e instanceof Error && !e.message.startsWith('Unexpected')) throw e;
            }
          }
        }

        return {text: fullText, error: null};
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 500));
        }
      }
    }

    return {text: '', error: lastError};
  };

  return {callWithRetry, streamWithRetry};
}

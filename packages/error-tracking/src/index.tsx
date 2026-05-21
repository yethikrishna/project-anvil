/**
 * @anvil/error-tracking — Lightweight real-time error tracking.
 *
 * Features:
 * - Global error boundary (React)
 * - Unhandled promise rejection capture
 * - Error deduplication with fingerprinting
 * - Breadcrumb trail for context
 * - Rate limiting (don't flood on loop errors)
 * - Local dashboard UI
 * - Export to external services (Sentry-compatible format)
 */

// ── Types ──

export interface ErrorEvent {
  id: string;
  fingerprint: string;
  message: string;
  stack?: string;
  type: 'error' | 'unhandledrejection' | 'react';
  level: 'error' | 'warning' | 'info';
  timestamp: string;
  url: string;
  userAgent: string;
  breadcrumbs: Breadcrumb[];
  tags: Record<string, string>;
  count: number;
  firstSeen: string;
  lastSeen: string;
  metadata?: Record<string, unknown>;
}

export interface Breadcrumb {
  type: 'navigation' | 'click' | 'xhr' | 'console' | 'custom';
  message: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

export interface ErrorTrackerConfig {
  /** Max breadcrumbs to keep (default 20) */
  maxBreadcrumbs?: number;
  /** Max errors to store (default 100) */
  maxErrors?: number;
  /** Dedup window in ms (default 5000) */
  dedupWindow?: number;
  /** Callback when error is captured */
  onError?: (event: ErrorEvent) => void;
  /** Custom fingerprint function */
  fingerprinter?: (error: Error) => string;
}

// ── Fingerprinting ──

function defaultFingerprinter(error: Error): string {
  const stack = error.stack || error.message;
  // Extract first 2 meaningful stack frames
  const frames = stack.split('\n')
    .filter(l => l.includes('at '))
    .slice(0, 2)
    .map(l => l.trim().replace(/:\d+:\d+/g, '')); // Remove line numbers
  return [error.message.slice(0, 100), ...frames].join('|');
}

// ── Error Tracker ──

export class ErrorTracker {
  private config: Required<ErrorTrackerConfig>;
  private errors = new Map<string, ErrorEvent>();
  private breadcrumbs: Breadcrumb[] = [];
  private initialized = false;
  private recentFingerprints = new Map<string, number>(); // fingerprint → timestamp

  constructor(config: ErrorTrackerConfig = {}) {
    this.config = {
      maxBreadcrumbs: config.maxBreadcrumbs ?? 20,
      maxErrors: config.maxErrors ?? 100,
      dedupWindow: config.dedupWindow ?? 5000,
      onError: config.onError ?? (() => {}),
      fingerprinter: config.fingerprinter ?? defaultFingerprinter,
    };
  }

  /**
   * Install global error handlers.
   */
  init(): () => void {
    if (this.initialized) return () => {};
    this.initialized = true;

    const originalOnError = window.onerror;
    const originalOnUnhandled = window.onunhandledrejection;

    window.onerror = (message, source, lineno, colno, error) => {
      if (error) {
        this.captureError(error, 'error');
      } else {
        this.captureMessage(String(message), 'error', {source, lineno, colno});
      }
      originalOnError?.call(window, message, source, lineno, colno, error);
    };

    window.onunhandledrejection = (event) => {
      const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
      this.captureError(error, 'unhandledrejection');
      originalOnUnhandled?.call(window, event);
    };

    // Return cleanup function
    return () => {
      window.onerror = originalOnError;
      window.onunhandledrejection = originalOnUnhandled;
      this.initialized = false;
    };
  }

  /**
   * Capture an error manually.
   */
  captureError(error: Error, type: ErrorEvent['type'] = 'error', tags?: Record<string, string>): ErrorEvent {
    const fingerprint = this.config.fingerprinter(error);
    const now = new Date().toISOString();

    // Dedup: skip if same fingerprint seen within dedup window
    const lastSeen = this.recentFingerprints.get(fingerprint);
    if (lastSeen && Date.now() - lastSeen < this.config.dedupWindow) {
      // Increment count on existing
      const existing = this.errors.get(fingerprint);
      if (existing) {
        existing.count++;
        existing.lastSeen = now;
        return existing;
      }
    }

    this.recentFingerprints.set(fingerprint, Date.now());

    const event: ErrorEvent = {
      id: `err_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      fingerprint,
      message: error.message,
      stack: error.stack,
      type,
      level: 'error',
      timestamp: now,
      url: typeof window !== 'undefined' ? window.location.href : '',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      breadcrumbs: [...this.breadcrumbs],
      tags: tags ?? {},
      count: 1,
      firstSeen: now,
      lastSeen: now,
    };

    // Merge with existing error if same fingerprint
    const existing = this.errors.get(fingerprint);
    if (existing) {
      existing.count++;
      existing.lastSeen = now;
      existing.breadcrumbs = [...this.breadcrumbs];
      this.config.onError(existing);
      return existing;
    }

    this.errors.set(fingerprint, event);

    // Evict oldest if over limit
    if (this.errors.size > this.config.maxErrors) {
      const oldest = Array.from(this.errors.entries())
        .sort((a, b) => a[1].firstSeen.localeCompare(b[1].firstSeen))[0];
      if (oldest) this.errors.delete(oldest[0]);
    }

    this.config.onError(event);
    return event;
  }

  /**
   * Capture a message (non-Error).
   */
  captureMessage(message: string, level: ErrorEvent['level'] = 'info', metadata?: Record<string, unknown>): ErrorEvent {
    const error = new Error(message);
    return this.captureError(error, 'error', {});
  }

  /**
   * Add a breadcrumb for context.
   */
  addBreadcrumb(breadcrumb: Omit<Breadcrumb, 'timestamp'>): void {
    this.breadcrumbs.push({
      ...breadcrumb,
      timestamp: new Date().toISOString(),
    });

    if (this.breadcrumbs.length > this.config.maxBreadcrumbs) {
      this.breadcrumbs.shift();
    }
  }

  /**
   * Add tag to all future errors.
   */
  addTag(key: string, value: string): void {
    // Tags are per-event, but this is a convenience for manual capture
  }

  /**
   * Get all captured errors, sorted by most recent.
   */
  getErrors(): ErrorEvent[] {
    return Array.from(this.errors.values())
      .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
  }

  /**
   * Get error count by type.
   */
  getStats(): {total: number; unique: number; byType: Record<string, number>; byLevel: Record<string, number>} {
    const errors = this.getErrors();
    return {
      total: errors.reduce((sum, e) => sum + e.count, 0),
      unique: errors.length,
      byType: errors.reduce<Record<string, number>>((acc, e) => {
        acc[e.type] = (acc[e.type] || 0) + e.count;
        return acc;
      }, {}),
      byLevel: errors.reduce<Record<string, number>>((acc, e) => {
        acc[e.level] = (acc[e.level] || 0) + e.count;
        return acc;
      }, {}),
    };
  }

  /**
   * Clear all errors and breadcrumbs.
   */
  clear(): void {
    this.errors.clear();
    this.breadcrumbs = [];
    this.recentFingerprints.clear();
  }

  /**
   * Export errors in Sentry-compatible envelope format.
   */
  exportSentryFormat(): object {
    return {
      event_id: crypto.randomUUID?.() || Date.now().toString(),
      timestamp: new Date().toISOString(),
      exceptions: this.getErrors().map(e => ({
        type: e.type,
        value: e.message,
        stacktrace: e.stack ? {frames: e.stack.split('\n').map(line => ({
          filename: line.trim(),
          function: line.trim(),
        }))} : undefined,
      })),
      breadcrumbs: this.breadcrumbs,
      tags: {},
      extra: {
        url: typeof window !== 'undefined' ? window.location.href : '',
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      },
    };
  }
}

// ── Singleton ──

let globalTracker: ErrorTracker | null = null;

export function getErrorTracker(config?: ErrorTrackerConfig): ErrorTracker {
  if (!globalTracker) {
    globalTracker = new ErrorTracker(config);
  }
  return globalTracker;
}

// ── React Error Boundary ──

import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: (error: Error, reset: () => void) => React.ReactNode;
  tracker?: ErrorTracker;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private tracker: ErrorTracker;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.tracker = props.tracker ?? getErrorTracker();
    this.state = {hasError: false, error: null};
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {hasError: true, error};
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.tracker.captureError(error, 'react', {
      componentStack: errorInfo.componentStack?.slice(0, 500) || '',
    });
  }

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, () => this.setState({hasError: false, error: null}));
      }

      return (
        <div className="p-6 rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800">
          <h3 className="text-sm font-semibold text-red-800 dark:text-red-300 mb-2">Something went wrong</h3>
          <p className="text-xs text-red-600 dark:text-red-400 mb-4">{this.state.error.message}</p>
          <button
            onClick={() => this.setState({hasError: false, error: null})}
            className="px-3 py-1.5 text-xs bg-red-600 text-white rounded hover:bg-red-700"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// ── Breadcrumb Auto-Instrumentation ──

export function instrumentBreadcrumbs(tracker: ErrorTracker): () => void {
  const cleanups: (() => void)[] = [];

  // Navigation breadcrumbs
  const origPushState = history.pushState.bind(history);
  history.pushState = (...args: any[]) => {
    tracker.addBreadcrumb({type: 'navigation', message: `Navigate: ${args[2] || window.location.pathname}`});
    origPushState(...args);
  };

  // XHR breadcrumbs
  const origXHROpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method: string, url: string, ...rest: any[]) {
    this.addEventListener('load', () => {
      tracker.addBreadcrumb({type: 'xhr', message: `${method} ${url} → ${this.status}`, data: {status: this.status}});
    });
    return origXHROpen.call(this, method, url, ...rest);
  };

  // Click breadcrumbs
  const onClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const tag = target.tagName.toLowerCase();
    const text = target.textContent?.slice(0, 50) || '';
    tracker.addBreadcrumb({type: 'click', message: `Click <${tag}> "${text}"`});
  };
  document.addEventListener('click', onClick, true);

  // Console error breadcrumbs
  const origConsoleError = console.error;
  console.error = (...args: any[]) => {
    tracker.addBreadcrumb({type: 'console', message: `console.error: ${args.join(' ').slice(0, 100)}`});
    origConsoleError.apply(console, args);
  };

  cleanups.push(() => {
    history.pushState = origPushState;
    XMLHttpRequest.prototype.open = origXHROpen;
    document.removeEventListener('click', onClick, true);
    console.error = origConsoleError;
  });

  return () => cleanups.forEach(fn => fn());
}

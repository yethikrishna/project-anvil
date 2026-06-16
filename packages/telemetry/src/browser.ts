/**
 * @anvil/telemetry — Browser SDK 2.0
 *
 * OpenTelemetry browser auto-instrumentation for Anvil apps.
 * Provides frontend-to-backend trace correlation by:
 * 1. Creating root spans for page views and user interactions
 * 2. Injecting traceparent headers into all fetch/XHR calls
 * 3. Sending spans to the collector via OTLP/HTTP
 * 4. Auto-instrumenting: fetch, XMLHttpRequest, document load
 *
 * Usage (in app layout or _app.tsx):
 *   import { initBrowserTracing } from '@anvil/telemetry/browser';
 *   initBrowserTracing({ serviceName: 'anvil-drive' });
 *
 * Environment:
 *   NEXT_PUBLIC_OTEL_ENDPOINT=https://otel.example.com:4318
 *   NEXT_PUBLIC_OTEL_SERVICE_NAME=anvil-drive
 */

'use client';

// ── Types ──

export interface BrowserTracingConfig {
  serviceName: string;
  endpoint?: string;
  /** App version for resource attributes */
  version?: string;
  /** Sampling rate 0-1 (default: 1.0 in dev, 0.1 in prod) */
  sampleRate?: number;
  /** Whether to propagate traceparent headers into fetch calls */
  propagateHeaders?: boolean;
  /** Ignore URLs matching these patterns */
  ignoreUrls?: (string | RegExp)[];
  /** Max spans to buffer before sending (default: 20) */
  batchSize?: number;
  /** Flush interval in ms (default: 5000) */
  flushIntervalMs?: number;
}

export interface SpanData {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  startTime: number;
  endTime?: number;
  status: 'ok' | 'error' | 'unset';
  attributes: Record<string, string | number | boolean>;
  events: Array<{ name: string; timestamp: number; attributes?: Record<string, unknown> }>;
  kind: 'client' | 'server' | 'producer' | 'consumer' | 'internal';
}

export interface ActiveSpan {
  spanId: string;
  traceId: string;
  finish: (status?: 'ok' | 'error') => void;
  setError: (err: Error) => void;
  setAttribute: (key: string, value: string | number | boolean) => void;
  addEvent: (name: string, attributes?: Record<string, unknown>) => void;
}

// ── ID generators ──

function generateTraceId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function generateSpanId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ── Span buffer ──

class BrowserTracer {
  private config: Required<BrowserTracingConfig>;
  private spans: SpanData[] = [];
  private activeSpans = new Map<string, SpanData>();
  private currentTraceId: string | null = null;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private originalFetch?: typeof fetch;
  private initialized = false;

  constructor(config: BrowserTracingConfig) {
    this.config = {
      endpoint: process.env.NEXT_PUBLIC_OTEL_ENDPOINT ?? 'http://localhost:4318',
      version: process.env.NEXT_PUBLIC_APP_VERSION ?? '0.1.0',
      sampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
      propagateHeaders: true,
      ignoreUrls: [/\/_next\//, /\.hot-update\.js/, /favicon\.ico/],
      batchSize: 20,
      flushIntervalMs: 5000,
      ...config,
    };
  }

  init(): void {
    if (this.initialized || typeof window === 'undefined') return;
    this.initialized = true;

    // Start a new trace for this page load
    this.currentTraceId = generateTraceId();

    // Instrument fetch
    if (this.config.propagateHeaders) {
      this.patchFetch();
    }

    // Instrument XMLHttpRequest
    this.patchXHR();

    // Auto-span for page load
    this.recordDocumentLoad();

    // Navigation spans via PerformanceObserver
    this.observeNavigation();

    // Flush on interval
    this.flushTimer = setInterval(() => this.flush(), this.config.flushIntervalMs);

    // Flush on page hide
    window.addEventListener('pagehide', () => this.flush(true));
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.flush(true);
    });
  }

  /** Start a manual span. Returns a handle to finish it. */
  startSpan(
    operationName: string,
    options: {
      kind?: SpanData['kind'];
      parentSpanId?: string;
      attributes?: Record<string, string | number | boolean>;
    } = {},
  ): ActiveSpan {
    if (!this.shouldSample()) {
      // Return a no-op span
      return {
        spanId: 'noop',
        traceId: 'noop',
        finish: () => {},
        setError: () => {},
        setAttribute: () => {},
        addEvent: () => {},
      };
    }

    const spanId = generateSpanId();
    const traceId = this.currentTraceId ?? generateTraceId();

    const span: SpanData = {
      traceId,
      spanId,
      parentSpanId: options.parentSpanId,
      operationName,
      startTime: performance.now(),
      status: 'unset',
      attributes: {
        'service.name': this.config.serviceName,
        'service.version': this.config.version,
        'browser.user_agent': navigator.userAgent,
        'page.url': window.location.href,
        ...options.attributes,
      },
      events: [],
      kind: options.kind ?? 'client',
    };

    this.activeSpans.set(spanId, span);

    return {
      spanId,
      traceId,
      finish: (status = 'ok') => {
        span.endTime = performance.now();
        span.status = status;
        this.activeSpans.delete(spanId);
        this.enqueue(span);
      },
      setError: (err) => {
        span.status = 'error';
        span.attributes['error.message'] = err.message;
        span.attributes['error.type'] = err.name;
        span.events.push({
          name: 'exception',
          timestamp: performance.now(),
          attributes: { message: err.message, stack: err.stack ?? '' },
        });
      },
      setAttribute: (key, value) => {
        span.attributes[key] = value;
      },
      addEvent: (name, attributes) => {
        span.events.push({ name, timestamp: performance.now(), attributes });
      },
    };
  }

  /** Get the current trace context header value. */
  getTraceparent(): string {
    if (!this.currentTraceId) return '';
    const spanId = generateSpanId();
    return `00-${this.currentTraceId}-${spanId}-01`;
  }

  private shouldSample(): boolean {
    return Math.random() < this.config.sampleRate;
  }

  private enqueue(span: SpanData): void {
    this.spans.push(span);
    if (this.spans.length >= this.config.batchSize) {
      this.flush();
    }
  }

  private async flush(sync = false): Promise<void> {
    if (this.spans.length === 0) return;
    const batch = this.spans.splice(0, this.spans.length);

    const otlpPayload = this.toOtlpJson(batch);
    const body = JSON.stringify(otlpPayload);
    const url = `${this.config.endpoint}/v1/traces`;

    if (sync && typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
      return;
    }

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    }).catch(() => null); // best-effort
  }

  private recordDocumentLoad(): void {
    if (!this.shouldSample()) return;

    const navEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (!navEntry) return;

    const span: SpanData = {
      traceId: this.currentTraceId!,
      spanId: generateSpanId(),
      operationName: 'document.load',
      startTime: 0,
      endTime: navEntry.loadEventEnd,
      status: 'ok',
      attributes: {
        'service.name': this.config.serviceName,
        'page.url': window.location.href,
        'page.title': document.title,
        'nav.type': navEntry.type,
        'timing.dns': navEntry.domainLookupEnd - navEntry.domainLookupStart,
        'timing.tcp': navEntry.connectEnd - navEntry.connectStart,
        'timing.ttfb': navEntry.responseStart - navEntry.requestStart,
        'timing.download': navEntry.responseEnd - navEntry.responseStart,
        'timing.dom_content_loaded': navEntry.domContentLoadedEventEnd,
        'timing.load': navEntry.loadEventEnd,
      },
      events: [],
      kind: 'client',
    };

    this.enqueue(span);
  }

  private patchFetch(): void {
    this.originalFetch = window.fetch.bind(window);
    const self = this;

    window.fetch = async function patchedFetch(
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> {
      const url = input instanceof Request ? input.url : String(input);

      // Skip ignored URLs
      if (self.config.ignoreUrls.some((pattern) =>
        typeof pattern === 'string' ? url.includes(pattern) : pattern.test(url),
      )) {
        return self.originalFetch!(input, init);
      }

      // Inject traceparent
      const traceparent = self.getTraceparent();
      const headers = new Headers(init?.headers);
      if (traceparent) headers.set('traceparent', traceparent);

      const span = self.startSpan(`HTTP ${(init?.method ?? 'GET').toUpperCase()} ${new URL(url, window.location.href).pathname}`, {
        kind: 'client',
        attributes: {
          'http.method': (init?.method ?? 'GET').toUpperCase(),
          'http.url': url,
        },
      });

      try {
        const response = await self.originalFetch!(input, { ...init, headers });
        span.setAttribute('http.status_code', response.status);
        span.finish(response.ok ? 'ok' : 'error');
        return response;
      } catch (err) {
        span.setError(err as Error);
        span.finish('error');
        throw err;
      }
    };
  }

  private patchXHR(): void {
    const OriginalXHR = XMLHttpRequest;
    const self = this;

    (window as Window & { XMLHttpRequest: typeof XMLHttpRequest }).XMLHttpRequest = class PatchedXHR extends OriginalXHR {
      private _span?: ActiveSpan;
      private _method = 'GET';
      private _url = '';

      open(method: string, url: string | URL, ...args: [boolean?, string?, string?]) {
        this._method = method;
        this._url = String(url);
        super.open(method, url, ...(args as [boolean]));
      }

      send(body?: Document | XMLHttpRequestBodyInit | null) {
        if (self.shouldSample() && !self.config.ignoreUrls.some((p) =>
          typeof p === 'string' ? this._url.includes(p) : p.test(this._url),
        )) {
          this._span = self.startSpan(`XHR ${this._method} ${this._url}`, {
            kind: 'client',
            attributes: { 'http.method': this._method, 'http.url': this._url },
          });

          const traceparent = self.getTraceparent();
          if (traceparent) this.setRequestHeader('traceparent', traceparent);

          this.addEventListener('loadend', () => {
            this._span?.setAttribute('http.status_code', this.status);
            this._span?.finish(this.status >= 200 && this.status < 400 ? 'ok' : 'error');
          });

          this.addEventListener('error', () => {
            this._span?.setError(new Error('XHR network error'));
            this._span?.finish('error');
          });
        }

        super.send(body);
      }
    };
  }

  private observeNavigation(): void {
    if (!('PerformanceObserver' in window)) return;
    const self = this;

    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === 'navigation') {
          self.currentTraceId = generateTraceId();
        }
      }
    });

    observer.observe({ entryTypes: ['navigation'] });
  }

  // ── OTLP/JSON serialization ──

  private toOtlpJson(spans: SpanData[]) {
    return {
      resourceSpans: [
        {
          resource: {
            attributes: [
              { key: 'service.name', value: { stringValue: this.config.serviceName } },
              { key: 'service.version', value: { stringValue: this.config.version } },
              { key: 'telemetry.sdk.name', value: { stringValue: 'anvil-browser' } },
              { key: 'telemetry.sdk.version', value: { stringValue: '2.0.0' } },
            ],
          },
          scopeSpans: [
            {
              scope: { name: '@anvil/telemetry', version: '2.0.0' },
              spans: spans.map((s) => ({
                traceId: s.traceId,
                spanId: s.spanId,
                parentSpanId: s.parentSpanId,
                name: s.operationName,
                kind: this.kindToInt(s.kind),
                startTimeUnixNano: String(Math.round((performance.timeOrigin + s.startTime) * 1_000_000)),
                endTimeUnixNano: s.endTime != null
                  ? String(Math.round((performance.timeOrigin + s.endTime) * 1_000_000))
                  : undefined,
                status: { code: s.status === 'error' ? 2 : 1 },
                attributes: Object.entries(s.attributes).map(([key, value]) => ({
                  key,
                  value: typeof value === 'number'
                    ? { doubleValue: value }
                    : typeof value === 'boolean'
                      ? { boolValue: value }
                      : { stringValue: String(value) },
                })),
                events: s.events.map((e) => ({
                  name: e.name,
                  timeUnixNano: String(Math.round((performance.timeOrigin + e.timestamp) * 1_000_000)),
                  attributes: e.attributes
                    ? Object.entries(e.attributes).map(([k, v]) => ({
                        key: k,
                        value: { stringValue: String(v) },
                      }))
                    : [],
                })),
              })),
            },
          ],
        },
      ],
    };
  }

  private kindToInt(kind: SpanData['kind']): number {
    return { internal: 1, server: 2, client: 3, producer: 4, consumer: 5 }[kind] ?? 1;
  }

  destroy(): void {
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flush(true);
    // Restore originals
    if (this.originalFetch) window.fetch = this.originalFetch;
  }
}

// ── Singleton ──

let browserTracer: BrowserTracer | null = null;

/**
 * Initialize browser tracing.
 * Call once in your app layout or `_app.tsx`.
 */
export function initBrowserTracing(config: BrowserTracingConfig): BrowserTracer {
  if (typeof window === 'undefined') {
    // SSR — return no-op
    return { init: () => {}, startSpan: () => ({ spanId: '', traceId: '', finish: () => {}, setError: () => {}, setAttribute: () => {}, addEvent: () => {} }), getTraceparent: () => '', destroy: () => {} } as unknown as BrowserTracer;
  }
  if (!browserTracer) {
    browserTracer = new BrowserTracer(config);
    browserTracer.init();
  }
  return browserTracer;
}

/** Get the active browser tracer (must call initBrowserTracing first). */
export function getBrowserTracer(): BrowserTracer | null {
  return browserTracer;
}

/** Create a traced React component wrapper. */
export function withTracing<P extends object>(
  Component: React.ComponentType<P>,
  spanName: string,
): React.FC<P> {
  return function TracedComponent(props: P) {
    const tracer = getBrowserTracer();
    if (tracer) {
      const span = tracer.startSpan(`render.${spanName}`, { kind: 'internal' });
      // In React 19, we can use useEffect for finishing
      // For now, finish immediately (layout-time)
      setTimeout(() => span.finish(), 0);
    }
    return <Component {...props} />;
  };
}

export { BrowserTracer };

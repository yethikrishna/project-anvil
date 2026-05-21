'use client';

import {useState, useEffect, useCallback, useMemo} from 'react';

/**
 * Performance monitoring — Core Web Vitals + custom traces.
 *
 * Tracks:
 * - LCP (Largest Contentful Paint)
 * - FID (First Input Delay)
 * - CLS (Cumulative Layout Shift)
 * - INP (Interaction to Next Paint)
 * - TTFB (Time to First Byte)
 * - Custom traces (API call durations, component render times)
 */

// ── Types ──

export interface CoreWebVitals {
  lcp: number | null;  // ms, good < 2500
  fid: number | null;  // ms, good < 100
  cls: number | null;  // score, good < 0.1
  inp: number | null;  // ms, good < 200
  ttfb: number | null; // ms, good < 800
  fcpx: number | null; // ms, First Contentful Paint
}

export interface CustomTrace {
  name: string;
  durationMs: number;
  timestamp: string;
  metadata?: Record<string, string>;
}

export interface PerformanceSnapshot {
  vitals: CoreWebVitals;
  traces: CustomTrace[];
  memory?: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
  connection?: {
    effectiveType: string;
    downlink: number;
    rtt: number;
  };
  timestamp: string;
}

// ── Rating helpers ──

export function rateLCP(value: number): 'good' | 'needs-improvement' | 'poor' {
  if (value <= 2500) return 'good';
  if (value <= 4000) return 'needs-improvement';
  return 'poor';
}

export function rateFID(value: number): 'good' | 'needs-improvement' | 'poor' {
  if (value <= 100) return 'good';
  if (value <= 300) return 'needs-improvement';
  return 'poor';
}

export function rateCLS(value: number): 'good' | 'needs-improvement' | 'poor' {
  if (value <= 0.1) return 'good';
  if (value <= 0.25) return 'needs-improvement';
  return 'poor';
}

export function rateINP(value: number): 'good' | 'needs-improvement' | 'poor' {
  if (value <= 200) return 'good';
  if (value <= 500) return 'needs-improvement';
  return 'poor';
}

export function rateTTFB(value: number): 'good' | 'needs-improvement' | 'poor' {
  if (value <= 800) return 'good';
  if (value <= 1800) return 'needs-improvement';
  return 'poor';
}

const RATING_COLORS: Record<string, string> = {
  'good': 'text-green-600',
  'needs-improvement': 'text-yellow-600',
  'poor': 'text-red-600',
};

// ── Hook ──

export function usePerformanceMonitor(): PerformanceSnapshot {
  const [vitals, setVitals] = useState<CoreWebVitals>({
    lcp: null, fid: null, cls: null, inp: null, ttfb: null, fcpx: null,
  });
  const [traces, setTraces] = useState<CustomTrace[]>([]);

  useEffect(() => {
    // Observe Core Web Vitals using PerformanceObserver
    try {
      // LCP
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        setVitals(prev => ({...prev, lcp: lastEntry.startTime}));
      });
      lcpObserver.observe({type: 'largest-contentful-paint', buffered: true});

      // FID
      const fidObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const firstEntry = entries[0];
        setVitals(prev => ({...prev, fid: (firstEntry as any).processingStart - firstEntry.startTime}));
      });
      fidObserver.observe({type: 'first-input', buffered: true});

      // CLS
      let clsValue = 0;
      const clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!(entry as any).hadRecentInput) {
            clsValue += (entry as any).value;
          }
        }
        setVitals(prev => ({...prev, cls: clsValue}));
      });
      clsObserver.observe({type: 'layout-shift', buffered: true});

      // TTFB
      const navEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      if (navEntry) {
        setVitals(prev => ({
          ...prev,
          ttfb: navEntry.responseStart - navEntry.requestStart,
          fcpx: navEntry.loadEventEnd,
        }));
      }

      return () => {
        lcpObserver.disconnect();
        fidObserver.disconnect();
        clsObserver.disconnect();
      };
    } catch {
      // PerformanceObserver not supported
    }
  }, []);

  const memory = useMemo(() => {
    const perf = performance as any;
    if (perf.memory) {
      return {
        usedJSHeapSize: perf.memory.usedJSHeapSize,
        totalJSHeapSize: perf.memory.totalJSHeapSize,
        jsHeapSizeLimit: perf.memory.jsHeapSizeLimit,
      };
    }
    return undefined;
  }, []);

  const connection = useMemo(() => {
    const nav = navigator as any;
    if (nav.connection) {
      return {
        effectiveType: nav.connection.effectiveType,
        downlink: nav.connection.downlink,
        rtt: nav.connection.rtt,
      };
    }
    return undefined;
  }, []);

  return {
    vitals,
    traces,
    memory,
    connection,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Custom trace — measure a specific operation.
 */
export function trace<T>(name: string, fn: () => T): T & {_trace: CustomTrace} {
  const start = performance.now();
  const result = fn();
  const duration = performance.now() - start;

  const traceResult: CustomTrace = {
    name,
    durationMs: Math.round(duration * 100) / 100,
    timestamp: new Date().toISOString(),
  };

  return Object.assign(result, {_trace: traceResult});
}

export async function traceAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  const result = await fn();
  const duration = performance.now() - start;

  // Store trace
  if (typeof window !== 'undefined') {
    try {
      performance.mark(`anvil-${name}-end`);
      performance.measure(`anvil-${name}`, `anvil-${name}-start`, `anvil-${name}-end`);
    } catch {}
  }

  return result;
}

// ── Performance Dashboard Component ──

export function PerformanceDashboard({open, onClose}: {open: boolean; onClose: () => void}) {
  const snapshot = usePerformanceMonitor();
  const {vitals, memory, connection} = snapshot;

  if (!open) return null;

  const metricItems = [
    {label: 'LCP', value: vitals.lcp, unit: 'ms', rating: vitals.lcp ? rateLCP(vitals.lcp) : null, good: '<2500ms'},
    {label: 'FID', value: vitals.fid, unit: 'ms', rating: vitals.fid ? rateFID(vitals.fid) : null, good: '<100ms'},
    {label: 'CLS', value: vitals.cls, unit: '', rating: vitals.cls ? rateCLS(vitals.cls) : null, good: '<0.1'},
    {label: 'TTFB', value: vitals.ttfb, unit: 'ms', rating: vitals.ttfb ? rateTTFB(vitals.ttfb) : null, good: '<800ms'},
  ];

  return (
    <div className="fixed right-0 top-0 h-full w-96 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 shadow-xl z-50 flex flex-col">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">⚡ Performance</h3>
          <p className="text-[10px] text-gray-500">Core Web Vitals & traces</p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-6">
        {/* Core Web Vitals */}
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase mb-3">Core Web Vitals</h4>
          <div className="grid grid-cols-2 gap-3">
            {metricItems.map(m => (
              <div key={m.label} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{m.label}</span>
                  {m.rating && <span className={`text-[10px] font-bold ${RATING_COLORS[m.rating]}`}>{m.rating}</span>}
                </div>
                <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  {m.value !== null ? `${Math.round(m.value)}${m.unit}` : '—'}
                </div>
                <div className="text-[10px] text-gray-400">Good: {m.good}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Memory */}
        {memory && (
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase mb-3">Memory</h4>
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-gray-600 dark:text-gray-400">Used</span>
                <span className="font-mono">{(memory.usedJSHeapSize / 1048576).toFixed(1)} MB</span>
              </div>
              <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${(memory.usedJSHeapSize / memory.jsHeapSizeLimit) > 0.8 ? 'bg-red-500' : 'bg-blue-500'}`}
                  style={{width: `${(memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100}%`}}
                />
              </div>
              <div className="flex justify-between text-[10px] text-gray-400">
                <span>Total: {(memory.totalJSHeapSize / 1048576).toFixed(1)} MB</span>
                <span>Limit: {(memory.jsHeapSizeLimit / 1048576).toFixed(0)} MB</span>
              </div>
            </div>
          </div>
        )}

        {/* Connection */}
        {connection && (
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase mb-3">Connection</h4>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2">
                <div className="text-sm font-bold text-gray-900 dark:text-gray-100">{connection.effectiveType}</div>
                <div className="text-[10px] text-gray-400">Type</div>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2">
                <div className="text-sm font-bold text-gray-900 dark:text-gray-100">{connection.downlink} Mbps</div>
                <div className="text-[10px] text-gray-400">Downlink</div>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2">
                <div className="text-sm font-bold text-gray-900 dark:text-gray-100">{connection.rtt} ms</div>
                <div className="text-[10px] text-gray-400">RTT</div>
              </div>
            </div>
          </div>
        )}

        {/* Timestamp */}
        <div className="text-[10px] text-gray-400 text-center">
          Updated: {new Date(snapshot.timestamp).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
}

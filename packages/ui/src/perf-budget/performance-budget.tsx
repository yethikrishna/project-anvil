'use client';

/**
 * Performance budget enforcement — set thresholds, measure, and alert.
 *
 * Budgets:
 * - LCP: < 2500ms
 * - FID: < 100ms
 * - CLS: < 0.1
 * - TTFB: < 800ms
 * - JS bundle: < 300KB (gzipped)
 * - CSS bundle: < 50KB (gzipped)
 * - Total page weight: < 1MB
 */

import {useState, useEffect, useMemo} from 'react';

// ── Types ──

export interface PerformanceBudget {
  metric: string;
  label: string;
  budget: number;
  unit: string;
  actual?: number;
  status: 'pass' | 'warn' | 'fail' | 'unknown';
}

export interface BundleBudget {
  name: string;
  budgetKB: number;
  actualKB?: number;
  status: 'pass' | 'warn' | 'fail' | 'unknown';
}

// ── Budgets ──

const CORE_WEB_VITAL_BUDGETS: PerformanceBudget[] = [
  {metric: 'lcp', label: 'Largest Contentful Paint', budget: 2500, unit: 'ms', status: 'unknown'},
  {metric: 'fid', label: 'First Input Delay', budget: 100, unit: 'ms', status: 'unknown'},
  {metric: 'cls', label: 'Cumulative Layout Shift', budget: 0.1, unit: '', status: 'unknown'},
  {metric: 'inp', label: 'Interaction to Next Paint', budget: 200, unit: 'ms', status: 'unknown'},
  {metric: 'ttfb', label: 'Time to First Byte', budget: 800, unit: 'ms', status: 'unknown'},
  {metric: 'fcpx', label: 'First Contentful Paint', budget: 1800, unit: 'ms', status: 'unknown'},
  {metric: 'tti', label: 'Time to Interactive', budget: 3800, unit: 'ms', status: 'unknown'},
];

const BUNDLE_BUDGETS: BundleBudget[] = [
  {name: 'JavaScript (gzip)', budgetKB: 300, status: 'unknown'},
  {name: 'CSS (gzip)', budgetKB: 50, status: 'unknown'},
  {name: 'Images', budgetKB: 500, status: 'unknown'},
  {name: 'Fonts', budgetKB: 100, status: 'unknown'},
  {name: 'Total Page Weight', budgetKB: 1000, status: 'unknown'},
];

// ── Hook ──

export function usePerformanceBudget() {
  const [budgets, setBudgets] = useState<PerformanceBudget[]>(CORE_WEB_VITAL_BUDGETS);
  const [bundleBudgets, setBundleBudgets] = useState<BundleBudget[]>(BUNDLE_BUDGETS);

  useEffect(() => {
    try {
      // Measure Core Web Vitals
      const lcpObserver = new PerformanceObserver((list) => {
        const entry = list.getEntries().at(-1);
        if (entry) {
          setBudgets(prev => prev.map(b =>
            b.metric === 'lcp'
              ? {...b, actual: Math.round(entry.startTime), status: entry.startTime <= b.budget ? 'pass' : entry.startTime <= b.budget * 1.5 ? 'warn' : 'fail'}
              : b
          ));
        }
      });
      lcpObserver.observe({type: 'largest-contentful-paint', buffered: true});

      const fidObserver = new PerformanceObserver((list) => {
        const entry = list.getEntries()[0] as any;
        if (entry) {
          const fid = entry.processingStart - entry.startTime;
          setBudgets(prev => prev.map(b =>
            b.metric === 'fid'
              ? {...b, actual: Math.round(fid), status: fid <= b.budget ? 'pass' : fid <= b.budget * 2 ? 'warn' : 'fail'}
              : b
          ));
        }
      });
      fidObserver.observe({type: 'first-input', buffered: true});

      // Navigation timing
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      if (nav) {
        setBudgets(prev => prev.map(b => {
          switch (b.metric) {
            case 'ttfb':
              const ttfb = nav.responseStart - nav.requestStart;
              return {...b, actual: Math.round(ttfb), status: ttfb <= b.budget ? 'pass' : ttfb <= b.budget * 1.5 ? 'warn' : 'fail'};
            case 'fcpx':
              const fcp = nav.loadEventEnd;
              return fcp > 0 ? {...b, actual: Math.round(fcp), status: fcp <= b.budget ? 'pass' : fcp <= b.budget * 1.5 ? 'warn' : 'fail'} : b;
            case 'tti':
              const tti = nav.domInteractive;
              return {...b, actual: Math.round(tti), status: tti <= b.budget ? 'pass' : tti <= b.budget * 1.5 ? 'warn' : 'fail'};
            default:
              return b;
          }
        }));
      }

      // Estimate bundle sizes from resource timing
      const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      let jsSize = 0, cssSize = 0, imgSize = 0, fontSize = 0;
      for (const r of resources) {
        const size = r.transferSize || r.encodedBodySize || 0;
        if (r.name.match(/\.js(\?|$)/)) jsSize += size;
        else if (r.name.match(/\.css(\?|$)/)) cssSize += size;
        else if (r.name.match(/\.(png|jpg|jpeg|gif|webp|svg|ico)(\?|$)/)) imgSize += size;
        else if (r.name.match(/\.(woff2?|ttf|otf|eot)(\?|$)/)) fontSize += size;
      }

      setBundleBudgets(prev => prev.map(b => {
        switch (b.name) {
          case 'JavaScript (gzip)':
            return {...b, actualKB: Math.round(jsSize / 1024), status: jsSize / 1024 <= b.budgetKB ? 'pass' : jsSize / 1024 <= b.budgetKB * 1.5 ? 'warn' : 'fail'};
          case 'CSS (gzip)':
            return {...b, actualKB: Math.round(cssSize / 1024), status: cssSize / 1024 <= b.budgetKB ? 'pass' : cssSize / 1024 <= b.budgetKB * 1.5 ? 'warn' : 'fail'};
          case 'Images':
            return {...b, actualKB: Math.round(imgSize / 1024), status: imgSize / 1024 <= b.budgetKB ? 'pass' : imgSize / 1024 <= b.budgetKB * 1.5 ? 'warn' : 'fail'};
          case 'Fonts':
            return {...b, actualKB: Math.round(fontSize / 1024), status: fontSize / 1024 <= b.budgetKB ? 'pass' : fontSize / 1024 <= b.budgetKB * 1.5 ? 'warn' : 'fail'};
          case 'Total Page Weight':
            const total = (jsSize + cssSize + imgSize + fontSize) / 1024;
            return {...b, actualKB: Math.round(total), status: total <= b.budgetKB ? 'pass' : total <= b.budgetKB * 1.5 ? 'warn' : 'fail'};
          default:
            return b;
        }
      }));

      return () => {
        lcpObserver.disconnect();
        fidObserver.disconnect();
      };
    } catch {
      // PerformanceObserver not available
    }
  }, []);

  const overallStatus = useMemo(() => {
    const all = [...budgets, ...bundleBudgets.map(b => ({status: b.status}))];
    if (all.some(b => b.status === 'fail')) return 'fail';
    if (all.some(b => b.status === 'warn')) return 'warn';
    if (all.every(b => b.status === 'pass')) return 'pass';
    return 'unknown';
  }, [budgets, bundleBudgets]);

  return {budgets, bundleBudgets, overallStatus};
}

// ── Component ──

const STATUS_STYLES: Record<string, {bg: string; text: string; icon: string}> = {
  pass: {bg: 'bg-green-50 dark:bg-green-900/20', text: 'text-green-700 dark:text-green-300', icon: '✓'},
  warn: {bg: 'bg-yellow-50 dark:bg-yellow-900/20', text: 'text-yellow-700 dark:text-yellow-300', icon: '⚠'},
  fail: {bg: 'bg-red-50 dark:bg-red-900/20', text: 'text-red-700 dark:text-red-300', icon: '✗'},
  unknown: {bg: 'bg-gray-50 dark:bg-gray-800', text: 'text-gray-400', icon: '?'},
};

export function PerformanceBudgetPanel() {
  const {budgets, bundleBudgets, overallStatus} = usePerformanceBudget();

  return (
    <div className="space-y-6">
      {/* Overall Status */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">📊 Performance Budget</h3>
        <span className={`text-sm font-medium px-3 py-1 rounded-full ${STATUS_STYLES[overallStatus].bg} ${STATUS_STYLES[overallStatus].text}`}>
          {STATUS_STYLES[overallStatus].icon} {overallStatus === 'pass' ? 'All budgets met' : overallStatus === 'warn' ? 'Warnings' : overallStatus === 'fail' ? 'Budgets exceeded' : 'Measuring...'}
        </span>
      </div>

      {/* Core Web Vitals Budgets */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Core Web Vitals</h4>
        <div className="space-y-2">
          {budgets.map(b => (
            <div key={b.metric} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800">
              <span className={`text-sm font-bold ${STATUS_STYLES[b.status].text}`}>
                {STATUS_STYLES[b.status].icon}
              </span>
              <div className="flex-1">
                <div className="text-sm text-gray-900 dark:text-gray-100">{b.label}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-mono">
                  {b.actual !== undefined ? `${Math.round(b.actual)}${b.unit}` : '—'}
                </div>
                <div className="text-[10px] text-gray-400">budget: {b.budget}{b.unit}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bundle Budgets */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Bundle Sizes</h4>
        <div className="space-y-2">
          {bundleBudgets.map(b => (
            <div key={b.name} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800">
              <span className={`text-sm font-bold ${STATUS_STYLES[b.status].text}`}>
                {STATUS_STYLES[b.status].icon}
              </span>
              <div className="flex-1">
                <div className="text-sm text-gray-900 dark:text-gray-100">{b.name}</div>
                {b.actualKB !== undefined && (
                  <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full mt-1 overflow-hidden">
                    <div className={`h-full rounded-full ${
                      b.status === 'pass' ? 'bg-green-500' : b.status === 'warn' ? 'bg-yellow-500' : 'bg-red-500'
                    }`} style={{width: `${Math.min(100, (b.actualKB / b.budgetKB) * 100)}%`}} />
                  </div>
                )}
              </div>
              <div className="text-right">
                <div className="text-sm font-mono">
                  {b.actualKB !== undefined ? `${b.actualKB} KB` : '—'}
                </div>
                <div className="text-[10px] text-gray-400">budget: {b.budgetKB} KB</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * AIStatusBar — compact header bar showing AI + service health.
 *
 * Shows:
 * - Model being used (with latency indicator)
 * - Connected services (Mail, Drive, Calendar, Docs)
 * - Agent mode status
 * - Token/cost meter (optional)
 * - Current persona
 */

'use client';

import { useState, useEffect } from 'react';
import { cn } from '@anvil/ui';

interface ServiceStatus {
  id: string;
  name: string;
  icon: string;
  status: 'connected' | 'error' | 'checking' | 'disconnected';
}

interface Props {
  model?: string;
  agentMode?: boolean;
  personaIcon?: string;
  personaName?: string;
  tokenCount?: number;
  maxTokens?: number;
  latencyMs?: number;
  className?: string;
}

const SERVICES: Omit<ServiceStatus, 'status'>[] = [
  { id: 'mail', name: 'Mail', icon: '📧' },
  { id: 'drive', name: 'Drive', icon: '📁' },
  { id: 'calendar', name: 'Calendar', icon: '📅' },
  { id: 'docs', name: 'Docs', icon: '📝' },
];

function useServiceHealth() {
  const [statuses, setStatuses] = useState<ServiceStatus[]>(
    SERVICES.map(s => ({ ...s, status: 'checking' as const }))
  );

  useEffect(() => {
    // Check /api/health which pings all downstream services
    let cancelled = false;

    async function check() {
      try {
        const res = await fetch('/api/health', { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
          const data = await res.json() as {
            services?: Record<string, { ok: boolean }>;
          };
          if (!cancelled) {
            setStatuses(SERVICES.map(s => ({
              ...s,
              status: data.services?.[s.id]?.ok === false
                ? 'error'
                : data.services?.[s.id]?.ok === true
                  ? 'connected'
                  : 'connected', // default to connected if not reported
            })));
          }
        } else {
          if (!cancelled) {
            setStatuses(SERVICES.map(s => ({ ...s, status: 'disconnected' })));
          }
        }
      } catch {
        if (!cancelled) {
          // Can't reach health — show all as checking (not error, might be dev mode)
          setStatuses(SERVICES.map(s => ({ ...s, status: 'checking' })));
        }
      }
    }

    check();
    const interval = setInterval(check, 60_000); // refresh every minute
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return statuses;
}

function getLatencyColor(ms?: number): string {
  if (!ms) return 'text-gray-400';
  if (ms < 500) return 'text-emerald-500';
  if (ms < 1500) return 'text-yellow-500';
  return 'text-red-500';
}

export default function AIStatusBar({
  model,
  agentMode,
  personaIcon,
  personaName,
  tokenCount,
  maxTokens = 128000,
  latencyMs,
  className,
}: Props) {
  const services = useServiceHealth();
  const [expanded, setExpanded] = useState(false);

  const displayModel = model
    ? model.replace('gpt-4o', 'GPT-4o').replace('gpt-4-turbo', 'GPT-4T').replace('gpt-4', 'GPT-4').replace('claude-', 'Claude ').replace('gemini-', 'Gemini ')
    : 'AI';

  const tokenPct = tokenCount ? Math.min(100, (tokenCount / maxTokens) * 100) : 0;

  const connectedCount = services.filter(s => s.status === 'connected').length;
  const hasError = services.some(s => s.status === 'error');

  return (
    <div className={cn(
      'relative select-none',
      className,
    )}>
      {/* Compact bar */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-[10px] text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        {/* AI model + latency */}
        <div className="flex items-center gap-1">
          <span className="font-medium text-gray-700 dark:text-gray-300">{displayModel}</span>
          {latencyMs && (
            <span className={cn('font-mono', getLatencyColor(latencyMs))}>
              {latencyMs}ms
            </span>
          )}
        </div>

        <div className="flex-1" />

        {/* Persona */}
        {personaIcon && (
          <span title={personaName}>{personaIcon}</span>
        )}

        {/* Agent mode */}
        {agentMode && (
          <span className="px-1 py-0.5 rounded text-[9px] bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 font-medium">
            AGENT
          </span>
        )}

        {/* Service dots */}
        <div className="flex items-center gap-0.5">
          {services.map(s => (
            <span
              key={s.id}
              title={`${s.name}: ${s.status}`}
              className={cn(
                'w-1.5 h-1.5 rounded-full',
                s.status === 'connected' ? 'bg-emerald-400' :
                s.status === 'error' ? 'bg-red-400' :
                s.status === 'checking' ? 'bg-gray-300 dark:bg-gray-600 animate-pulse' :
                'bg-gray-200 dark:bg-gray-700',
              )}
            />
          ))}
        </div>

        {/* Token bar */}
        {tokenCount !== undefined && tokenCount > 0 && (
          <div className="w-10 h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                tokenPct > 80 ? 'bg-red-400' : tokenPct > 50 ? 'bg-yellow-400' : 'bg-emerald-400',
              )}
              style={{ width: `${tokenPct}%` }}
            />
          </div>
        )}

        <svg
          className={cn('w-3 h-3 transition-transform', expanded && 'rotate-180')}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="absolute top-full left-0 right-0 z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-b-xl shadow-lg p-3 space-y-2.5">
          {/* Services */}
          <div>
            <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Connected services</p>
            <div className="grid grid-cols-2 gap-1">
              {services.map(s => (
                <div
                  key={s.id}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-gray-50 dark:bg-gray-800"
                >
                  <span className="text-xs">{s.icon}</span>
                  <span className="text-[10px] text-gray-700 dark:text-gray-300">{s.name}</span>
                  <span className={cn(
                    'ml-auto text-[9px] font-medium',
                    s.status === 'connected' ? 'text-emerald-600 dark:text-emerald-400' :
                    s.status === 'error' ? 'text-red-600 dark:text-red-400' :
                    'text-gray-400',
                  )}>
                    {s.status === 'connected' ? '✓' : s.status === 'error' ? '✗' : '...'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Token meter */}
          {tokenCount !== undefined && tokenCount > 0 && (
            <div>
              <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Context window</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      tokenPct > 80 ? 'bg-red-400' : tokenPct > 50 ? 'bg-yellow-400' : 'bg-emerald-400',
                    )}
                    style={{ width: `${tokenPct}%` }}
                  />
                </div>
                <span className="text-[10px] font-mono text-gray-500">
                  {(tokenCount / 1000).toFixed(1)}k / {(maxTokens / 1000).toFixed(0)}k
                </span>
              </div>
            </div>
          )}

          {/* Model info */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">Model</p>
              <p className="text-[10px] text-gray-700 dark:text-gray-300 font-medium">{displayModel}</p>
            </div>
            {latencyMs && (
              <div className="text-right">
                <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">Last response</p>
                <p className={cn('text-[10px] font-mono font-medium', getLatencyColor(latencyMs))}>
                  {latencyMs}ms
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

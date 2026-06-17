/**
 * AIMorningBriefing — Live intelligence card for the welcome screen.
 *
 * Shows a personalized daily briefing with:
 * - AI-generated headline: "3 urgent emails · 2 meetings today"
 * - Priority inbox items with one-click "Draft reply"
 * - Today's calendar with meeting prep shortcuts
 * - Pending follow-ups
 * - Recent Drive files
 *
 * Fetches from /api/ai-briefing on mount (< 5s).
 * Auto-refreshes every 5 minutes.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn } from '@anvil/ui';
import type { AIBriefing, BriefingItem, BriefingSection } from '@/app/api/ai-briefing/route';

// Re-export for convenience
export type { AIBriefing, BriefingItem, BriefingSection };

const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30',
  high: 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30',
  medium: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30',
  low: 'text-gray-500 dark:text-gray-400',
};

const PRIORITY_DOTS: Record<string, string> = {
  urgent: 'bg-red-500',
  high: 'bg-orange-400',
  medium: 'bg-blue-400',
  low: 'bg-gray-300 dark:bg-gray-600',
};

interface Props {
  onAction: (prompt: string) => void;
  className?: string;
}

function BriefingItemRow({
  item,
  onAction,
}: {
  item: BriefingItem;
  onAction: (prompt: string) => void;
}) {
  return (
    <div className="flex items-start gap-2.5 py-1.5 group hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-lg px-2 -mx-2 transition-colors">
      {/* Priority dot */}
      <div className="mt-1.5 shrink-0">
        <div className={cn('w-1.5 h-1.5 rounded-full', PRIORITY_DOTS[item.priority ?? 'low'])} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-gray-800 dark:text-gray-200 leading-snug truncate">
              {item.title}
            </p>
            {item.subtitle && (
              <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate mt-0.5">
                {item.subtitle}
              </p>
            )}
          </div>
          {item.timestamp && (
            <span className="text-[10px] text-gray-400 shrink-0 mt-0.5">{item.timestamp}</span>
          )}
        </div>
        {item.detail && (
          <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate mt-0.5">
            {item.detail}
          </p>
        )}
      </div>

      {/* Action button — appears on hover */}
      {item.actionPrompt && (
        <button
          onClick={() => onAction(item.actionPrompt!)}
          className={cn(
            'shrink-0 text-[10px] px-2 py-0.5 rounded-full border font-medium transition-all',
            'opacity-0 group-hover:opacity-100',
            'border-indigo-300 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400',
            'hover:bg-indigo-50 dark:hover:bg-indigo-950/40',
          )}
          title={item.actionLabel}
        >
          {item.actionLabel ?? 'Go'}
        </button>
      )}
    </div>
  );
}

function BriefingSectionPanel({
  section,
  onAction,
  isExpanded,
  onToggle,
}: {
  section: BriefingSection;
  onAction: (prompt: string) => void;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const isEmpty = section.items.length === 0;

  return (
    <div className="border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden">
      {/* Section header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm">{section.icon}</span>
          <span className="text-[12px] font-semibold text-gray-700 dark:text-gray-300">
            {section.title}
          </span>
          {!isEmpty && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
              {section.items.length}
            </span>
          )}
          {section.badge && section.badge > 0 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-500 text-white font-bold">
              {section.badge}
            </span>
          )}
        </div>
        <span className={cn('text-gray-400 text-xs transition-transform', isExpanded && 'rotate-180')}>
          ▾
        </span>
      </button>

      {/* Section items */}
      {isExpanded && (
        <div className="px-3 pb-2">
          {isEmpty ? (
            <p className="text-[11px] text-gray-400 italic py-1">{section.empty}</p>
          ) : (
            section.items.map((item) => (
              <BriefingItemRow key={item.id} item={item} onAction={onAction} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Skeleton loader ──

function BriefingSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded-lg w-3/4" />
      <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded-lg w-full" />
      <div className="space-y-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-12 bg-gray-100 dark:bg-gray-800 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

// ── Main component ──

export default function AIMorningBriefing({ onAction, className }: Props) {
  const [briefing, setBriefing] = useState<AIBriefing | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['urgent', 'today']));
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchBriefing = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetch('/api/ai-briefing', {
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error('Failed to load briefing');
      const data = await res.json() as AIBriefing;
      setBriefing(data);
      setLastRefresh(new Date());

      // Auto-expand sections with urgent items
      const toExpand = new Set<string>();
      for (const section of data.sections) {
        if (section.items.some(i => i.priority === 'urgent' || i.priority === 'high')) {
          toExpand.add(section.id);
        }
      }
      if (toExpand.size > 0) setExpandedSections(toExpand);
    } catch {
      setError('Couldn\'t load your briefing — services may be offline.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load on mount
  useEffect(() => {
    fetchBriefing();
    // Auto-refresh every 5 minutes
    const interval = setInterval(fetchBriefing, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchBriefing]);

  const toggleSection = useCallback((id: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  if (isLoading) {
    return (
      <div className={cn('p-4', className)}>
        <BriefingSkeleton />
      </div>
    );
  }

  if (error || !briefing) {
    return (
      <div className={cn('p-4', className)}>
        <div className="text-center py-4">
          <p className="text-[12px] text-gray-400">{error ?? 'No briefing available.'}</p>
          <button
            onClick={fetchBriefing}
            className="mt-2 text-[11px] text-indigo-500 hover:text-indigo-700 transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  const urgentCount = briefing.sections
    .find(s => s.id === 'urgent')?.items.length ?? 0;

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-gray-800 dark:text-gray-200 leading-snug">
            {briefing.greeting}
          </p>
          <p className="text-[12px] text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">
            {briefing.headline}
          </p>
        </div>
        <button
          onClick={fetchBriefing}
          className="text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors shrink-0 mt-0.5"
          title="Refresh briefing"
        >
          ↻
        </button>
      </div>

      {/* AI focus recommendation */}
      <div className="flex gap-2 items-start bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/50 rounded-xl px-3 py-2.5">
        <span className="text-sm shrink-0 mt-0.5">🎯</span>
        <p className="text-[11px] text-indigo-700 dark:text-indigo-300 leading-snug">
          {briefing.focusRecommendation}
        </p>
      </div>

      {/* One-click actions for most urgent */}
      {urgentCount > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => onAction('What needs my attention right now?')}
            className="text-[11px] px-2.5 py-1 rounded-full bg-red-500 hover:bg-red-600 text-white font-medium transition-colors shadow-sm"
          >
            ⚡ Handle urgent ({urgentCount})
          </button>
          <button
            onClick={() => onAction("Give me a quick summary of my most urgent emails and what I should do about each one")}
            className="text-[11px] px-2.5 py-1 rounded-full border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            📋 Full digest
          </button>
        </div>
      )}

      {/* Sections */}
      <div className="flex flex-col gap-2">
        {briefing.sections.map((section) => (
          <BriefingSectionPanel
            key={section.id}
            section={section}
            onAction={onAction}
            isExpanded={expandedSections.has(section.id)}
            onToggle={() => toggleSection(section.id)}
          />
        ))}
      </div>

      {/* Footer */}
      {lastRefresh && (
        <p className="text-[10px] text-gray-400 text-right">
          Updated {lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      )}
    </div>
  );
}

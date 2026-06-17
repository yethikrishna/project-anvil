/**
 * ProductivityCoach — weekly AI-driven productivity report panel.
 *
 * Shows:
 * - Overall productivity score ring (animated)
 * - 5 category scores: speed, focus, communication, organization, follow-through
 * - Top strength + top improvement
 * - Actionable one-click recommendations
 *
 * Appears in the sidebar "insights" section.
 */

'use client';

import { useMemo } from 'react';
import { cn } from '@anvil/ui';
import { generateProductivityReport, type WeeklyProductivityReport, type ProductivityInsight } from '@/lib/ai-coach';
import type { Conversation } from '@/lib/types';

// ── Score ring ──

function ScoreRing({ score, size = 80 }: { score: number; size?: number }) {
  const radius = (size - 10) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - score / 100);
  const color = score >= 75 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#6366f1';

  return (
    <svg width={size} height={size} className="rotate-[-90deg]">
      {/* Track */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={8}
        className="stroke-gray-200 dark:stroke-gray-700"
      />
      {/* Progress */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={8}
        stroke={color}
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.8s ease-out' }}
      />
    </svg>
  );
}

// ── Category bar ──

function InsightBar({ insight, onAction }: { insight: ProductivityInsight; onAction?: (prompt: string) => void }) {
  const barColor = insight.score >= 75 ? 'bg-green-500' : insight.score >= 50 ? 'bg-amber-400' : 'bg-indigo-400';
  const trendIcon = insight.trend === 'up' ? '↑' : insight.trend === 'down' ? '↓' : '→';
  const trendColor = insight.trend === 'up' ? 'text-green-500' : insight.trend === 'down' ? 'text-red-400' : 'text-gray-400';

  return (
    <div className="group">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">{insight.icon}</span>
          <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-300">
            {insight.title}
          </span>
          <span className={cn('text-[10px] font-medium', trendColor)}>{trendIcon}</span>
        </div>
        <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400">{insight.score}</span>
      </div>
      <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-700', barColor)}
          style={{ width: `${insight.score}%` }}
        />
      </div>
      {insight.detail && (
        <p className="text-[10px] text-gray-400 mt-1 leading-snug">{insight.detail}</p>
      )}
      {insight.recommendation && onAction && (
        <button
          onClick={() => onAction(insight.recommendation!)}
          className="mt-1 text-[10px] text-indigo-500 hover:text-indigo-700 transition-colors opacity-0 group-hover:opacity-100"
        >
          → {insight.recommendation.slice(0, 60)}{insight.recommendation.length > 60 ? '…' : ''}
        </button>
      )}
    </div>
  );
}

// ── Main component ──

interface Props {
  conversations: Conversation[];
  onAction: (prompt: string) => void;
  className?: string;
}

export default function ProductivityCoach({ conversations, onAction, className }: Props) {
  const report = useMemo<WeeklyProductivityReport>(
    () => generateProductivityReport(conversations),
    [conversations],
  );

  const trendText = report.weekComparedToLast > 0
    ? `↑ ${Math.abs(report.weekComparedToLast)}% vs last week`
    : report.weekComparedToLast < 0
      ? `↓ ${Math.abs(report.weekComparedToLast)}% vs last week`
      : 'Same as last week';

  const trendColor = report.weekComparedToLast > 0 ? 'text-green-500' : report.weekComparedToLast < 0 ? 'text-red-400' : 'text-gray-400';

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* Score header */}
      <div className="flex items-center gap-4">
        <div className="relative shrink-0">
          <ScoreRing score={report.overallScore} size={72} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-lg font-bold text-gray-800 dark:text-gray-100 leading-none">
              {report.overallScore}
            </span>
            <span className="text-[9px] text-gray-400 mt-0.5">score</span>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold text-gray-800 dark:text-gray-100 leading-snug">
            {report.headline}
          </p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 leading-snug">
            {report.subheadline}
          </p>
          <p className={cn('text-[10px] font-medium mt-1.5', trendColor)}>{trendText}</p>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl px-3 py-2 text-center">
          <p className="text-lg font-bold text-gray-800 dark:text-gray-100">{report.activeDays}</p>
          <p className="text-[10px] text-gray-400">active days</p>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl px-3 py-2 text-center">
          <p className="text-lg font-bold text-gray-800 dark:text-gray-100">{report.totalActions}</p>
          <p className="text-[10px] text-gray-400">AI actions</p>
        </div>
      </div>

      {/* Category insights */}
      <div className="flex flex-col gap-3">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Breakdown</p>
        {report.insights.map(insight => (
          <InsightBar key={insight.category} insight={insight} onAction={onAction} />
        ))}
      </div>

      {/* Top recommendation */}
      {report.topImprovement && (
        <div className="bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 rounded-xl p-3">
          <p className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-1">
            Top opportunity
          </p>
          <p className="text-[12px] text-indigo-700 dark:text-indigo-300 leading-snug">
            {report.topImprovement}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * ConversationInsights — shows what the AI has learned about you.
 *
 * Displays a live, updating "memory" card that shows:
 * - People mentioned frequently
 * - Active projects/topics
 * - Detected preferences
 * - Recent decisions
 * - Pending follow-ups
 *
 * Helps users feel seen and understood — a key differentiator from
 * basic chatbots that feel stateless.
 */

'use client';

import { useState, useEffect } from 'react';
import { cn } from '@anvil/ui';
import type { ConversationContext } from '@/lib/types';
import { loadContextSnapshot } from '@/lib/proactive-context';
import { dbGetPreferences } from '@/lib/db';

interface InsightGroup {
  label: string;
  icon: string;
  items: string[];
  color: string;
}

interface Props {
  context: ConversationContext;
  onDismiss?: () => void;
  className?: string;
}

function buildInsights(
  context: ConversationContext,
  snapshot: ReturnType<typeof loadContextSnapshot>,
  prefs: Record<string, string>,
): InsightGroup[] {
  const groups: InsightGroup[] = [];

  const people = [
    ...new Set([
      ...(snapshot?.importantPeople ?? []),
      ...context.people,
    ]),
  ].filter(Boolean).slice(0, 6);

  if (people.length > 0) {
    groups.push({
      label: 'Key people',
      icon: '👥',
      items: people,
      color: 'text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/30',
    });
  }

  const projects = [
    ...new Set([
      ...(snapshot?.activeProjects ?? []),
      ...context.topics,
    ]),
  ].filter(Boolean).slice(0, 6);

  if (projects.length > 0) {
    groups.push({
      label: 'Active topics',
      icon: '🎯',
      items: projects,
      color: 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30',
    });
  }

  const preferences = context.preferences
    .filter(Boolean)
    .slice(0, 5);

  if (preferences.length > 0) {
    groups.push({
      label: 'Your preferences',
      icon: '⚙️',
      items: preferences,
      color: 'text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/30',
    });
  }

  const savedPrefs = Object.entries(prefs).slice(0, 4);
  if (savedPrefs.length > 0) {
    groups.push({
      label: 'Saved settings',
      icon: '💾',
      items: savedPrefs.map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`),
      color: 'text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800',
    });
  }

  const followUps = snapshot?.pendingFollowUps?.slice(0, 3) ?? [];
  if (followUps.length > 0) {
    groups.push({
      label: 'Open commitments',
      icon: '⏳',
      items: followUps.map(f => f.slice(0, 80)),
      color: 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30',
    });
  }

  const decisions = snapshot?.recentDecisions?.slice(0, 3) ?? [];
  if (decisions.length > 0) {
    groups.push({
      label: 'Recent decisions',
      icon: '✅',
      items: decisions.map(d => d.slice(0, 80)),
      color: 'text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/30',
    });
  }

  return groups;
}

export default function ConversationInsights({ context, onDismiss, className }: Props) {
  const [groups, setGroups] = useState<InsightGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const snapshot = loadContextSnapshot();
      let prefs: Record<string, string> = {};
      try {
        const storedPrefs = await dbGetPreferences('default');
        prefs = storedPrefs ?? {};
      } catch {}

      if (!cancelled) {
        setGroups(buildInsights(context, snapshot, prefs));
        setIsLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [context]);

  const totalItems = groups.reduce((sum, g) => sum + g.items.length, 0);

  return (
    <div className={cn(
      'rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden shadow-sm',
      className,
    )}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-gray-800 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/20 dark:to-purple-950/20">
        <div className="flex items-center gap-2">
          <span className="text-sm">🧠</span>
          <div>
            <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">What I know about you</h3>
            <p className="text-[10px] text-gray-500">
              {isLoading ? 'Loading...' : `${totalItems} thing${totalItems !== 1 ? 's' : ''} in memory`}
            </p>
          </div>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-sm"
          >
            ✕
          </button>
        )}
      </div>

      {/* Content */}
      <div className="p-3 space-y-3 max-h-80 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <div className="w-3 h-3 border-2 border-gray-300 border-t-indigo-500 rounded-full animate-spin" />
            Building your context...
          </div>
        ) : groups.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-xs text-gray-500">No context yet.</p>
            <p className="text-[10px] text-gray-400 mt-1">
              The more you chat, the more I learn about you.
            </p>
          </div>
        ) : (
          groups.map(group => (
            <div key={group.label}>
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-xs">{group.icon}</span>
                <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                  {group.label}
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {group.items.map((item, i) => (
                  <span
                    key={i}
                    className={cn(
                      'text-[10px] px-2 py-0.5 rounded-full font-medium truncate max-w-[180px]',
                      group.color,
                    )}
                    title={item}
                  >
                    {item.length > 40 ? item.slice(0, 38) + '…' : item}
                  </span>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      {!isLoading && groups.length > 0 && (
        <div className="px-3 py-2 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
          <p className="text-[10px] text-gray-400 text-center">
            Memory persists across all your conversations
          </p>
        </div>
      )}
    </div>
  );
}

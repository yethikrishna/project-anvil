'use client';

import {useState} from 'react';

// ── Types ──

export interface ActivityEntry {
  id: string;
  timestamp: string;
  app: 'drive' | 'docs' | 'gmail' | 'youtube' | 'maps' | 'search' | 'calendar';
  action: string;
  description: string;
  metadata?: Record<string, string>;
}

export interface ActivityTimelineProps {
  entries: ActivityEntry[];
  open: boolean;
  onClose: () => void;
}

// ── App Icons/Colors ──

const APP_META: Record<string, {icon: string; color: string; label: string}> = {
  drive: {icon: '📁', color: '#3b82f6', label: 'Drive'},
  docs: {icon: '📝', color: '#10b981', label: 'Docs'},
  gmail: {icon: '✉️', color: '#ef4444', label: 'Gmail'},
  youtube: {icon: '▶️', color: '#f59e0b', label: 'Video'},
  maps: {icon: '🗺️', color: '#8b5cf6', label: 'Maps'},
  search: {icon: '🔍', color: '#06b6d4', label: 'Search'},
  calendar: {icon: '📅', color: '#ec4899', label: 'Calendar'},
};

// ── Component ──

export function ActivityTimeline({entries, open, onClose}: ActivityTimelineProps) {
  const [filter, setFilter] = useState<string>('all');

  if (!open) return null;

  const filtered = filter === 'all'
    ? entries
    : entries.filter(e => e.app === filter);

  // Group by date
  const grouped = new Map<string, ActivityEntry[]>();
  for (const entry of filtered) {
    const date = new Date(entry.timestamp).toLocaleDateString();
    if (!grouped.has(date)) grouped.set(date, []);
    grouped.get(date)!.push(entry);
  }

  // Compute summary stats
  const stats = entries.reduce((acc, e) => {
    acc[e.app] = (acc[e.app] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const totalToday = entries.filter(e => {
    const d = new Date(e.timestamp);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  }).length;

  return (
    <div className="fixed right-0 top-0 h-full w-96 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 shadow-xl z-50 flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">📊 Activity Timeline</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <p className="text-xs text-gray-500 mt-1">{totalToday} activities today</p>
      </div>

      {/* App filters */}
      <div className="flex gap-1.5 px-4 py-2 border-b border-gray-100 dark:border-gray-800 overflow-x-auto">
        <button
          onClick={() => setFilter('all')}
          className={`px-2.5 py-1 rounded-full text-[10px] font-medium whitespace-nowrap ${
            filter === 'all' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
          }`}
        >
          All ({entries.length})
        </button>
        {Object.entries(APP_META).map(([app, meta]) =>
          stats[app] ? (
            <button
              key={app}
              onClick={() => setFilter(app)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-medium whitespace-nowrap ${
                filter === app ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
              }`}
            >
              {meta.icon} {stats[app]}
            </button>
          ) : null
        )}
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-auto px-4 py-3">
        {Array.from(grouped.entries()).map(([date, dateEntries]) => (
          <div key={date} className="mb-4">
            <div className="text-xs font-semibold text-gray-500 mb-2">{date === new Date().toLocaleDateString() ? 'Today' : date}</div>
            <div className="space-y-3">
              {dateEntries.map(entry => {
                const meta = APP_META[entry.app];
                const time = new Date(entry.timestamp).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});

                return (
                  <div key={entry.id} className="flex gap-3">
                    {/* Timeline line */}
                    <div className="flex flex-col items-center">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-xs shrink-0"
                        style={{backgroundColor: `${meta.color}20`, color: meta.color}}
                      >
                        {meta.icon}
                      </div>
                      <div className="w-px flex-1 bg-gray-200 dark:bg-gray-700 mt-1" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 pb-3">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-medium text-gray-900 dark:text-gray-100">{entry.action}</span>
                        <span className="text-[10px] text-gray-400">{time}</span>
                      </div>
                      <p className="text-xs text-gray-600 dark:text-gray-400">{entry.description}</p>
                      {entry.metadata && (
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {Object.entries(entry.metadata).map(([key, val]) => (
                            <span key={key} className="text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-500 px-1.5 py-0.5 rounded">
                              {key}: {val}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Focus Mode Component ──

export type FocusMode = 'zen' | 'inbox-zero' | 'deep-work' | null;

export interface FocusModeProps {
  mode: FocusMode;
  onActivate: (mode: FocusMode) => void;
  onDeactivate: () => void;
}

const MODES: {id: FocusMode; label: string; description: string; icon: string; color: string}[] = [
  {
    id: 'zen',
    label: 'Zen Mode',
    description: 'Minimal UI, no distractions. Focus on writing and thinking.',
    icon: '🧘',
    color: '#8b5cf6',
  },
  {
    id: 'inbox-zero',
    label: 'Inbox Zero',
    description: 'Process emails efficiently: archive, reply, or snooze. No lingering.',
    icon: '📭',
    color: '#3b82f6',
  },
  {
    id: 'deep-work',
    label: 'Deep Work',
    description: 'Block notifications, hide sidebar, maximize single app focus.',
    icon: '🎯',
    color: '#10b981',
  },
];

export function FocusModeSelector({mode, onActivate, onDeactivate}: FocusModeProps) {
  if (mode) {
    const current = MODES.find(m => m.id === mode)!;
    return (
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-white dark:bg-gray-900 rounded-full shadow-lg border border-gray-200 dark:border-gray-700 px-4 py-2">
        <span className="text-sm">{current.icon}</span>
        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{current.label} Active</span>
        <button
          onClick={onDeactivate}
          className="text-xs text-gray-400 hover:text-gray-600 ml-2"
        >
          Exit ✕
        </button>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      {MODES.map(m => (
        <button
          key={m.id}
          onClick={() => onActivate(m.id)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-gray-300 hover:shadow-sm transition-all text-left"
        >
          <span className="text-lg">{m.icon}</span>
          <div>
            <div className="text-xs font-medium text-gray-900 dark:text-gray-100">{m.label}</div>
            <div className="text-[10px] text-gray-500 max-w-[160px]">{m.description}</div>
          </div>
        </button>
      ))}
    </div>
  );
}

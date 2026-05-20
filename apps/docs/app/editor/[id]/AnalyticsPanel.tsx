'use client';

import {useState, useEffect} from 'react';

interface ContributorStats {
  userId: string;
  userName: string;
  edits: number;
  sessions: number;
  totalTimeMinutes: number;
  percentage: number;
}

interface TimelinePoint {
  timestamp: string;
  edits: number;
  collaborators: number;
}

interface DocumentAnalytics {
  documentId: string;
  totalEdits: number;
  totalSessions: number;
  averageSessionDuration: number;
  activeCollaborators: number;
  topContributors: ContributorStats[];
  editTimeline: TimelinePoint[];
}

interface AnalyticsPanelProps {
  documentId: string;
  open: boolean;
  onClose: () => void;
}

export function AnalyticsPanel({documentId, open, onClose}: AnalyticsPanelProps) {
  const [analytics, setAnalytics] = useState<DocumentAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!open || !documentId) return;

    setIsLoading(true);
    fetch(`/api/documents/${documentId}/analytics`)
      .then(r => r.json())
      .then(data => {
        setAnalytics(data.error ? null : data);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));

    // Refresh every 30 seconds
    const interval = setInterval(() => {
      fetch(`/api/documents/${documentId}/analytics`)
        .then(r => r.json())
        .then(data => setAnalytics(data.error ? null : data))
        .catch(() => {});
    }, 30000);

    return () => clearInterval(interval);
  }, [documentId, open]);

  if (!open) return null;

  return (
    <div className="fixed right-0 top-0 h-full w-96 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 shadow-xl z-40 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Collaboration Analytics</h2>
          <p className="text-xs text-gray-500 mt-0.5">Real-time editing metrics</p>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1"
        >
          ✕
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-5 space-y-6">
        {isLoading ? (
          <div className="space-y-4 animate-pulse">
            <div className="grid grid-cols-2 gap-3">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-20 bg-gray-100 rounded-lg" />
              ))}
            </div>
            <div className="h-40 bg-gray-100 rounded-lg" />
          </div>
        ) : !analytics ? (
          <div className="text-center py-12">
            <span className="text-4xl">📊</span>
            <p className="text-gray-500 mt-3">No analytics data yet</p>
            <p className="text-xs text-gray-400 mt-1">Start editing to see collaboration metrics</p>
          </div>
        ) : (
          <>
            {/* Key metrics */}
            <div className="grid grid-cols-2 gap-3">
              <MetricCard
                label="Total Edits"
                value={analytics.totalEdits.toLocaleString()}
                icon="✏️"
                color="blue"
              />
              <MetricCard
                label="Active Now"
                value={String(analytics.activeCollaborators)}
                icon="👥"
                color="green"
              />
              <MetricCard
                label="Sessions"
                value={String(analytics.totalSessions)}
                icon="🕐"
                color="purple"
              />
              <MetricCard
                label="Avg Duration"
                value={`${Math.round(analytics.averageSessionDuration)}m`}
                icon="⏱️"
                color="orange"
              />
            </div>

            {/* Edit activity chart (simplified bar chart) */}
            {analytics.editTimeline.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Edit Activity</h3>
                <div className="flex items-end gap-1 h-24">
                  {analytics.editTimeline.slice(-24).map((point, i) => {
                    const maxEdits = Math.max(...analytics.editTimeline.map(p => p.edits), 1);
                    const height = Math.max(4, (point.edits / maxEdits) * 100);
                    return (
                      <div
                        key={i}
                        className="flex-1 bg-blue-500 rounded-t hover:bg-blue-600 transition-colors cursor-default group relative"
                        style={{height: `${height}%`}}
                        title={`${point.edits} edits`}
                      >
                        {/* Tooltip */}
                        <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-gray-800 text-white text-[10px] rounded whitespace-nowrap z-10">
                          {new Date(point.timestamp).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}
                          {' — '}{point.edits} edits
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-[10px] text-gray-400">
                    {analytics.editTimeline.length > 0 &&
                      new Date(analytics.editTimeline[0].timestamp).toLocaleDateString()}
                  </span>
                  <span className="text-[10px] text-gray-400">Now</span>
                </div>
              </div>
            )}

            {/* Top contributors */}
            {analytics.topContributors.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Top Contributors</h3>
                <div className="space-y-3">
                  {analytics.topContributors.map((contributor, i) => (
                    <div key={contributor.userId} className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-[10px] text-white font-bold flex-shrink-0">
                        {contributor.userName.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                            {contributor.userName}
                          </span>
                          <span className="text-xs text-gray-500">
                            {contributor.edits} edits
                          </span>
                        </div>
                        {/* Progress bar */}
                        <div className="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              i === 0 ? 'bg-blue-500' : i === 1 ? 'bg-green-500' : 'bg-gray-400'
                            }`}
                            style={{width: `${contributor.percentage}%`}}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Metric Card ──

function MetricCard({label, value, icon, color}: {
  label: string;
  value: string;
  icon: string;
  color: 'blue' | 'green' | 'purple' | 'orange';
}) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-green-50 text-green-700',
    purple: 'bg-purple-50 text-purple-700',
    orange: 'bg-orange-50 text-orange-700',
  };

  return (
    <div className={`rounded-lg p-3 ${colorClasses[color]}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium opacity-70">{label}</span>
        <span className="text-sm">{icon}</span>
      </div>
      <span className="text-xl font-bold">{value}</span>
    </div>
  );
}

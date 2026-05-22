/**
 * WeeklySummaryWidget — renders a weekly summary with charts and metrics.
 *
 * Shows:
 * - Email/Meeting/Docs metrics
 * - Top topics as tag cloud
 * - Action items as checklist
 * - Highlights as cards
 * - Export as PDF button
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import type { WeeklySummary } from '@/lib/types';
import { toastSuccess, toastError } from './Toast';

interface Props {
  onClose: () => void;
}

export default function WeeklySummaryWidget({ onClose }: Props) {
  const [summary, setSummary] = useState<WeeklySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/weekly-summary');
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = await res.json();
      setSummary(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);

  const handleExport = () => {
    if (!summary) return;
    const md = buildSummaryMarkdown(summary);
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `weekly-summary-${new Date().toISOString().split('T')[0]}.md`;
    a.click();
    URL.revokeObjectURL(url);
    toastSuccess('Summary exported');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[85vh] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div>
            <h2 className="font-semibold text-base flex items-center gap-2">
              📊 Weekly Summary
            </h2>
            {summary?.weekRange && (
              <p className="text-xs text-gray-500 mt-0.5">{summary.weekRange}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {summary && (
              <button
                onClick={handleExport}
                className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                📥 Export
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {loading ? (
            <div className="text-center py-12">
              <div className="flex justify-center gap-1 mb-3">
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <p className="text-sm text-gray-400">Analyzing your week across Mail, Calendar, and Drive...</p>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-sm text-red-500 mb-3">{error}</p>
              <button
                onClick={fetchSummary}
                className="text-xs text-blue-500 hover:underline"
              >
                Try again
              </button>
            </div>
          ) : summary ? (
            <>
              {/* Metrics grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <MetricCard icon="✉️" label="Emails" value={summary.emailsProcessed} sub="processed" color="blue" />
                <MetricCard icon="📅" label="Meetings" value={summary.meetingsAttended} sub="attended" color="orange" />
                <MetricCard icon="📄" label="Docs" value={summary.docsCreated} sub="created" color="green" />
                <MetricCard icon="🔗" label="Shared" value={summary.filesShared} sub="files" color="purple" />
              </div>

              {/* Top Topics */}
              {summary.topTopics.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Top Topics</h3>
                  <div className="flex flex-wrap gap-2">
                    {summary.topTopics.map((topic, i) => (
                      <span
                        key={i}
                        className={`text-xs px-3 py-1.5 rounded-full font-medium ${
                          i === 0
                            ? 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                            : i === 1
                              ? 'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300'
                              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                        }`}
                      >
                        {topic}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Highlights */}
              {summary.highlights.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Highlights</h3>
                  <div className="space-y-2">
                    {summary.highlights.map((h, i) => (
                      <div key={i} className="flex items-start gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-100 dark:border-green-900">
                        <span className="text-sm mt-0.5">✨</span>
                        <p className="text-sm text-green-800 dark:text-green-200">{h}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Items */}
              {summary.actionItems.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Action Items for Next Week</h3>
                  <div className="space-y-1.5">
                    {summary.actionItems.map((item, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm">
                        <input type="checkbox" className="mt-1 rounded" />
                        <span className="text-gray-700 dark:text-gray-300">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Productivity Insights */}
              {summary.productivity && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Productivity</h3>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="text-center p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
                      <div className="text-lg font-bold text-gray-800 dark:text-gray-200">
                        {summary.productivity.emailsPerDay?.toFixed(1) ?? '—'}
                      </div>
                      <div className="text-[10px] text-gray-400 mt-0.5">emails/day</div>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
                      <div className="text-lg font-bold text-gray-800 dark:text-gray-200">
                        {summary.productivity.meetingsPerDay?.toFixed(1) ?? '—'}
                      </div>
                      <div className="text-[10px] text-gray-400 mt-0.5">meetings/day</div>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
                      <div className="text-lg font-bold text-gray-800 dark:text-gray-200">
                        {summary.productivity.avgResponseTimeHours
                          ? `${summary.productivity.avgResponseTimeHours.toFixed(1)}h`
                          : '—'}
                      </div>
                      <div className="text-[10px] text-gray-400 mt-0.5">avg response</div>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-12 text-gray-400 text-sm">
              No summary data available.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value, sub, color }: {
  icon: string;
  label: string;
  value: number;
  sub: string;
  color: 'blue' | 'orange' | 'green' | 'purple';
}) {
  const colorClasses = {
    blue: 'bg-blue-50 dark:bg-blue-950/30 border-blue-100 dark:border-blue-900',
    orange: 'bg-orange-50 dark:bg-orange-950/30 border-orange-100 dark:border-orange-900',
    green: 'bg-green-50 dark:bg-green-950/30 border-green-100 dark:border-green-900',
    purple: 'bg-purple-50 dark:bg-purple-950/30 border-purple-100 dark:border-purple-900',
  };

  return (
    <div className={`p-3 rounded-xl border ${colorClasses[color]} text-center`}>
      <div className="text-lg mb-1">{icon}</div>
      <div className="text-xl font-bold text-gray-800 dark:text-gray-200">{value}</div>
      <div className="text-[10px] text-gray-500 mt-0.5">{sub}</div>
    </div>
  );
}

function buildSummaryMarkdown(s: WeeklySummary): string {
  return `# Weekly Summary: ${s.weekRange}

## Metrics
- **Emails processed:** ${s.emailsProcessed}
- **Meetings attended:** ${s.meetingsAttended}
- **Documents created:** ${s.docsCreated}
- **Files shared:** ${s.filesShared}

## Top Topics
${s.topTopics.map(t => `- ${t}`).join('\n')}

## Highlights
${s.highlights.map(h => `- ✨ ${h}`).join('\n')}

## Action Items for Next Week
${s.actionItems.map((a, i) => `- [ ] ${a}`).join('\n')}

## Productivity
- Emails per day: ${s.productivity?.emailsPerDay?.toFixed(1) ?? 'N/A'}
- Meetings per day: ${s.productivity?.meetingsPerDay?.toFixed(1) ?? 'N/A'}
- Average response time: ${s.productivity?.avgResponseTimeHours?.toFixed(1) ?? 'N/A'}h
`;
}

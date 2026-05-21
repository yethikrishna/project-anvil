'use client';

/**
 * Unified app analytics dashboards for Gmail, Drive, and Collaboration.
 *
 * Three dashboard components:
 * 1. EmailAnalytics — response time, volume heatmap, top correspondents
 * 2. DriveAnalytics — storage by type, duplicates, shared file audit
 * 3. CollaborationAnalytics — edit heatmap, timezone visualization
 */

import {useState, useMemo} from 'react';

// ── Shared Types ──

interface DataPoint {
  label: string;
  value: number;
  color?: string;
}

interface TimeSeriesPoint {
  date: string;
  value: number;
}

// ── Mock Data Generators ──

function generateDays(count: number): string[] {
  return Array.from({length: count}, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (count - 1 - i));
    return d.toISOString().split('T')[0];
  });
}

// ── Email Analytics ──

export interface EmailAnalyticsData {
  totalEmails: number;
  unread: number;
  avgResponseTimeMin: number;
  responseTimeDistribution: DataPoint[];
  volumeByDay: TimeSeriesPoint[];
  volumeByHour: DataPoint[];
  topCorrespondents: {name: string; email: string; count: number; avgResponseMin: number}[];
  emailByLabel: DataPoint[];
  responseRate: number;
  peakHour: number;
}

const MOCK_EMAIL: EmailAnalyticsData = {
  totalEmails: 1247,
  unread: 43,
  avgResponseTimeMin: 34,
  responseTimeDistribution: [
    {label: '<5 min', value: 23, color: 'bg-green-500'},
    {label: '5-30 min', value: 45, color: 'bg-green-400'},
    {label: '30-60 min', value: 18, color: 'bg-yellow-500'},
    {label: '1-4 hours', value: 10, color: 'bg-orange-500'},
    {label: '>4 hours', value: 4, color: 'bg-red-500'},
  ],
  volumeByDay: generateDays(30).map((d, i) => ({
    date: d,
    value: 20 + Math.floor(Math.random() * 40) + (i % 7 < 5 ? 15 : 0),
  })),
  volumeByHour: Array.from({length: 24}, (_, h) => ({
    label: `${h}:00`,
    value: h >= 9 && h <= 17 ? 30 + Math.floor(Math.random() * 40) : Math.floor(Math.random() * 10),
    color: h >= 9 && h <= 17 ? 'bg-blue-500' : 'bg-blue-200',
  })),
  topCorrespondents: [
    {name: 'Sarah Chen', email: 'sarah@company.com', count: 89, avgResponseMin: 12},
    {name: 'Dev Team', email: 'dev@company.com', count: 67, avgResponseMin: 45},
    {name: 'Mike Johnson', email: 'mike@company.com', count: 52, avgResponseMin: 28},
    {name: 'Design Team', email: 'design@company.com', count: 41, avgResponseMin: 55},
    {name: 'HR Department', email: 'hr@company.com', count: 31, avgResponseMin: 120},
  ],
  emailByLabel: [
    {label: 'Primary', value: 45, color: 'bg-blue-500'},
    {label: 'Updates', value: 25, color: 'bg-yellow-500'},
    {label: 'Promotions', value: 18, color: 'bg-green-500'},
    {label: 'Social', value: 8, color: 'bg-purple-500'},
    {label: 'Spam', value: 4, color: 'bg-red-500'},
  ],
  responseRate: 87,
  peakHour: 10,
};

export function EmailAnalytics() {
  const data = MOCK_EMAIL;
  const maxVolume = Math.max(...data.volumeByDay.map(d => d.value));
  const maxHourVolume = Math.max(...data.volumeByHour.map(d => d.value));

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">📧 Email Analytics</h3>

      {/* Key Metrics */}
      <div className="grid grid-cols-4 gap-3">
        <MetricCard label="Total Emails" value={data.totalEmails.toLocaleString()} />
        <MetricCard label="Unread" value={data.unread.toString()} subtext={`${((data.unread / data.totalEmails) * 100).toFixed(1)}%`} />
        <MetricCard label="Avg Response" value={`${data.avgResponseTimeMin} min`} />
        <MetricCard label="Response Rate" value={`${data.responseRate}%`} />
      </div>

      {/* Volume Heatmap (30 days) */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Volume (30 days)</h4>
        <div className="flex gap-[2px]">
          {data.volumeByDay.map(d => (
            <div
              key={d.date}
              className="flex-1 rounded-sm"
              style={{
                height: '40px',
                backgroundColor: `rgb(59, 130, 246, ${Math.max(0.1, d.value / maxVolume)})`,
              }}
              title={`${d.date}: ${d.value} emails`}
            />
          ))}
        </div>
      </div>

      {/* Volume by Hour */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Volume by Hour</h4>
        <div className="flex items-end gap-[2px] h-24">
          {data.volumeByHour.map(d => (
            <div
              key={d.label}
              className="flex-1 rounded-t-sm bg-blue-400"
              style={{height: `${(d.value / maxHourVolume) * 100}%`, opacity: d.value / maxHourVolume}}
              title={`${d.label}: ${d.value}`}
            />
          ))}
        </div>
      </div>

      {/* Top Correspondents */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Top Correspondents</h4>
        <div className="space-y-2">
          {data.topCorrespondents.map(c => (
            <div key={c.email} className="flex items-center gap-3 text-sm">
              <div className="w-24 truncate text-gray-900 dark:text-gray-100 font-medium">{c.name}</div>
              <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full" style={{width: `${(c.count / data.topCorrespondents[0].count) * 100}%`}} />
              </div>
              <div className="w-16 text-right text-xs text-gray-500">{c.count} emails</div>
              <div className="w-20 text-right text-xs text-gray-400">{c.avgResponseMin}min avg</div>
            </div>
          ))}
        </div>
      </div>

      {/* Response Time Distribution */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Response Time</h4>
        <div className="space-y-1">
          {data.responseTimeDistribution.map(d => (
            <div key={d.label} className="flex items-center gap-2 text-sm">
              <div className="w-20 text-xs text-gray-500">{d.label}</div>
              <div className="flex-1 h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${d.color}`} style={{width: `${d.value}%`}} />
              </div>
              <div className="w-8 text-right text-xs font-medium">{d.value}%</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Drive Analytics ──

export interface DriveAnalyticsData {
  totalFiles: number;
  totalSizeGB: number;
  filesByType: DataPoint[];
  sizeByType: DataPoint[];
  recentUploads: number;
  sharedFiles: number;
  duplicateCandidates: number;
  largestFiles: {name: string; size: string; type: string}[];
  sharingActivity: TimeSeriesPoint[];
}

const MOCK_DRIVE: DriveAnalyticsData = {
  totalFiles: 3842,
  totalSizeGB: 24.7,
  filesByType: [
    {label: 'Documents', value: 1245, color: 'bg-blue-500'},
    {label: 'Images', value: 982, color: 'bg-green-500'},
    {label: 'Videos', value: 234, color: 'bg-purple-500'},
    {label: 'Spreadsheets', value: 567, color: 'bg-yellow-500'},
    {label: 'Presentations', value: 312, color: 'bg-orange-500'},
    {label: 'Other', value: 502, color: 'bg-gray-400'},
  ],
  sizeByType: [
    {label: 'Videos', value: 14.2, color: 'bg-purple-500'},
    {label: 'Images', value: 4.8, color: 'bg-green-500'},
    {label: 'Documents', value: 2.1, color: 'bg-blue-500'},
    {label: 'Other', value: 3.6, color: 'bg-gray-400'},
  ],
  recentUploads: 89,
  sharedFiles: 412,
  duplicateCandidates: 23,
  largestFiles: [
    {name: 'Q4 Demo Recording.mp4', size: '2.4 GB', type: 'video'},
    {name: 'Product Photos.zip', size: '1.8 GB', type: 'archive'},
    {name: 'Training Video Series.mp4', size: '1.2 GB', type: 'video'},
    {name: 'Annual Report.pdf', size: '340 MB', type: 'document'},
    {name: 'Design Assets.sketch', size: '280 MB', type: 'design'},
  ],
  sharingActivity: generateDays(30).map((d, i) => ({
    date: d,
    value: Math.floor(Math.random() * 20),
  })),
};

export function DriveAnalytics() {
  const data = MOCK_DRIVE;
  const maxFilesByType = Math.max(...data.filesByType.map(d => d.value));

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">💾 Drive Analytics</h3>

      <div className="grid grid-cols-4 gap-3">
        <MetricCard label="Total Files" value={data.totalFiles.toLocaleString()} />
        <MetricCard label="Storage Used" value={`${data.totalSizeGB} GB`} />
        <MetricCard label="Shared Files" value={data.sharedFiles.toString()} subtext={`${((data.sharedFiles / data.totalFiles) * 100).toFixed(1)}%`} />
        <MetricCard label="Duplicates" value={data.duplicateCandidates.toString()} subtext="candidates" variant="warning" />
      </div>

      {/* Files by Type */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Files by Type</h4>
        <div className="flex h-8 rounded-lg overflow-hidden">
          {data.filesByType.map(d => (
            <div
              key={d.label}
              className={`${d.color} transition-all`}
              style={{width: `${(d.value / data.totalFiles) * 100}%`}}
              title={`${d.label}: ${d.value}`}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-3 mt-2">
          {data.filesByType.map(d => (
            <div key={d.label} className="flex items-center gap-1 text-xs">
              <div className={`w-2 h-2 rounded-full ${d.color}`} />
              <span className="text-gray-600 dark:text-gray-400">{d.label}</span>
              <span className="text-gray-400">({d.value.toLocaleString()})</span>
            </div>
          ))}
        </div>
      </div>

      {/* Storage by Type */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Storage by Type</h4>
        <div className="space-y-2">
          {data.sizeByType.map(d => (
            <div key={d.label} className="flex items-center gap-2 text-sm">
              <div className="w-20 text-xs text-gray-500">{d.label}</div>
              <div className="flex-1 h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${d.color}`} style={{width: `${(d.value / data.totalSizeGB) * 100}%`}} />
              </div>
              <div className="w-16 text-right text-xs font-medium">{d.value} GB</div>
            </div>
          ))}
        </div>
      </div>

      {/* Largest Files */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Largest Files</h4>
        <div className="space-y-1">
          {data.largestFiles.map(f => (
            <div key={f.name} className="flex items-center justify-between text-sm px-3 py-1.5 rounded bg-gray-50 dark:bg-gray-800">
              <span className="text-gray-900 dark:text-gray-100 truncate">{f.name}</span>
              <span className="text-xs text-gray-500 ml-4">{f.size}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Collaboration Analytics ──

export interface CollaborationAnalyticsData {
  totalEdits: number;
  activeContributors: number;
  editHeatmap: {day: number; hour: number; count: number}[];
  topContributors: {name: string; edits: number; documents: number}[];
  timezoneDistribution: {timezone: string; count: number; offset: number}[];
  documentActivity: {name: string; edits: number; editors: number}[];
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({length: 24}, (_, i) => i);

const MOCK_COLLAB: CollaborationAnalyticsData = {
  totalEdits: 4827,
  activeContributors: 14,
  editHeatmap: Array.from({length: 7}, (_, day) =>
    Array.from({length: 24}, (_, hour) => ({
      day,
      hour,
      count: day >= 1 && day <= 5 && hour >= 9 && hour <= 17
        ? Math.floor(Math.random() * 30) + 5
        : Math.floor(Math.random() * 5),
    }))
  ).flat(),
  topContributors: [
    {name: 'Alice Wang', edits: 842, documents: 23},
    {name: 'Bob Martinez', edits: 654, documents: 19},
    {name: 'Carol Kim', edits: 521, documents: 17},
    {name: 'Dave Patel', edits: 398, documents: 14},
    {name: 'Eve Johnson', edits: 312, documents: 11},
  ],
  timezoneDistribution: [
    {timezone: 'US/Eastern', count: 5, offset: -5},
    {timezone: 'US/Pacific', count: 3, offset: -8},
    {timezone: 'Europe/London', count: 2, offset: 0},
    {timezone: 'Asia/Tokyo', count: 2, offset: 9},
    {timezone: 'Asia/Calcutta', count: 2, offset: 5.5},
  ],
  documentActivity: [
    {name: 'Q4 Planning', edits: 234, editors: 8},
    {name: 'Product Roadmap', edits: 189, editors: 6},
    {name: 'Design Spec v2', edits: 156, editors: 5},
    {name: 'API Documentation', edits: 134, editors: 4},
    {name: 'Meeting Notes', edits: 98, editors: 7},
  ],
};

export function CollaborationAnalytics() {
  const data = MOCK_COLLAB;
  const maxHeat = Math.max(...data.editHeatmap.map(h => h.count));
  const maxEdits = Math.max(...data.topContributors.map(c => c.edits));

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">🤝 Collaboration Analytics</h3>

      <div className="grid grid-cols-3 gap-3">
        <MetricCard label="Total Edits" value={data.totalEdits.toLocaleString()} />
        <MetricCard label="Contributors" value={data.activeContributors.toString()} />
        <MetricCard label="Avg Edits/Doc" value={Math.round(data.totalEdits / data.documentActivity.length).toString()} />
      </div>

      {/* Edit Heatmap (GitHub-style) */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Edit Activity Heatmap</h4>
        <div className="overflow-x-auto">
          <div className="flex gap-[3px]">
            {/* Day labels */}
            <div className="flex flex-col gap-[3px] mr-1">
              {DAYS.map((d, i) => (
                <div key={d} className="h-[14px] text-[9px] text-gray-400 flex items-center">
                  {i % 2 === 1 ? d : ''}
                </div>
              ))}
            </div>

            {/* Heat cells */}
            <div className="flex flex-col gap-[3px]">
              {Array.from({length: 7}, (_, day) => (
                <div key={day} className="flex gap-[3px]">
                  {HOURS.map(hour => {
                    const heat = data.editHeatmap.find(h => h.day === day && h.hour === hour);
                    const intensity = heat ? heat.count / maxHeat : 0;
                    return (
                      <div
                        key={hour}
                        className="w-[14px] h-[14px] rounded-sm"
                        style={{
                          backgroundColor: intensity > 0
                            ? `rgba(16, 185, 129, ${0.2 + intensity * 0.8})`
                            : 'rgba(229, 231, 235, 0.3)',
                        }}
                        title={`${DAYS[day]} ${hour}:00 — ${heat?.count ?? 0} edits`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Timezone Distribution */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Timezone Distribution</h4>
        <div className="space-y-2">
          {data.timezoneDistribution.map(tz => (
            <div key={tz.timezone} className="flex items-center gap-2 text-sm">
              <div className="w-28 text-xs text-gray-600 dark:text-gray-400">{tz.timezone}</div>
              <div className="flex-1 h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{width: `${(tz.count / data.activeContributors) * 100}%`}} />
              </div>
              <div className="w-8 text-right text-xs text-gray-500">{tz.count}</div>
              <div className="w-14 text-right text-xs text-gray-400">UTC{tz.offset >= 0 ? '+' : ''}{tz.offset}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Top Contributors */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Top Contributors</h4>
        <div className="space-y-2">
          {data.topContributors.map(c => (
            <div key={c.name} className="flex items-center gap-3 text-sm">
              <div className="w-24 truncate font-medium text-gray-900 dark:text-gray-100">{c.name}</div>
              <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full" style={{width: `${(c.edits / maxEdits) * 100}%`}} />
              </div>
              <div className="w-16 text-right text-xs text-gray-500">{c.edits} edits</div>
              <div className="w-20 text-right text-xs text-gray-400">{c.documents} docs</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Shared Components ──

function MetricCard({label, value, subtext, variant = 'default'}: {
  label: string;
  value: string;
  subtext?: string;
  variant?: 'default' | 'warning';
}) {
  return (
    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-xl font-bold ${
        variant === 'warning' ? 'text-orange-600' : 'text-gray-900 dark:text-gray-100'
      }`}>
        {value}
      </div>
      {subtext && <div className="text-[10px] text-gray-400">{subtext}</div>}
    </div>
  );
}

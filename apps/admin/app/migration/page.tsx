/**
 * Admin Migration Page
 * Google Workspace → Anvil migration toolkit UI.
 * Triggers and monitors bulk migration jobs.
 */
'use client';

import {useState} from 'react';
import {AdminLayout, PageHeader, Button, Badge, Card, StatCard} from '../../components/admin-ui';

type MigrationType = 'gmail' | 'drive' | 'docs' | 'calendar';
type MigrationStatus = 'idle' | 'estimating' | 'running' | 'completed' | 'failed';

interface MigrationJob {
  id: string;
  type: MigrationType;
  status: MigrationStatus;
  totalItems: number;
  processedItems: number;
  failedItems: number;
  startedAt: string;
  completedAt?: string;
  users: string[];
}

const TYPE_ICONS: Record<MigrationType, string> = {
  gmail: '📧',
  drive: '📁',
  docs: '📄',
  calendar: '📅',
};

const TYPE_LABELS: Record<MigrationType, string> = {
  gmail: 'Gmail → Stalwart IMAP',
  drive: 'Google Drive → MinIO',
  docs: 'Google Docs → Anvil Docs',
  calendar: 'Google Calendar → Anvil Calendar',
};

const DEMO_JOBS: MigrationJob[] = [
  {
    id: '1',
    type: 'gmail',
    status: 'completed',
    totalItems: 45230,
    processedItems: 45230,
    failedItems: 12,
    startedAt: '2026-05-20T10:00:00Z',
    completedAt: '2026-05-20T11:45:00Z',
    users: ['alice@company.com', 'bob@company.com'],
  },
  {
    id: '2',
    type: 'drive',
    status: 'running',
    totalItems: 8420,
    processedItems: 3102,
    failedItems: 3,
    startedAt: '2026-05-22T08:00:00Z',
    users: ['alice@company.com'],
  },
];

export default function MigrationPage() {
  const [jobs, setJobs] = useState<MigrationJob[]>(DEMO_JOBS);
  const [showNewMigration, setShowNewMigration] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<MigrationType[]>(['gmail']);
  const [userList, setUserList] = useState('');
  const [allUsers, setAllUsers] = useState(false);
  const [dryRun, setDryRun] = useState(true);
  const [domainInput, setDomainInput] = useState('');
  const [activeJob, setActiveJob] = useState<MigrationJob | null>(null);

  const totalMigrated = jobs.reduce((a, j) => a + j.processedItems, 0);
  const totalFailed = jobs.reduce((a, j) => a + j.failedItems, 0);
  const running = jobs.filter(j => j.status === 'running').length;
  const completed = jobs.filter(j => j.status === 'completed').length;

  function toggleType(type: MigrationType) {
    setSelectedTypes(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type],
    );
  }

  function startMigration() {
    const newJob: MigrationJob = {
      id: String(Date.now()),
      type: selectedTypes[0] ?? 'gmail',
      status: dryRun ? 'estimating' : 'running',
      totalItems: 0,
      processedItems: 0,
      failedItems: 0,
      startedAt: new Date().toISOString(),
      users: allUsers ? ['all users'] : userList.split(',').map(s => s.trim()).filter(Boolean),
    };
    setJobs(prev => [newJob, ...prev]);
    setShowNewMigration(false);
    setActiveJob(newJob);
  }

  const getProgressPct = (job: MigrationJob) =>
    job.totalItems > 0 ? Math.round((job.processedItems / job.totalItems) * 100) : 0;

  const formatDuration = (startedAt: string, completedAt?: string) => {
    const end = completedAt ? new Date(completedAt) : new Date();
    const ms = end.getTime() - new Date(startedAt).getTime();
    const mins = Math.floor(ms / 60000);
    const hrs = Math.floor(mins / 60);
    if (hrs > 0) return `${hrs}h ${mins % 60}m`;
    return `${mins}m`;
  };

  return (
    <AdminLayout>
      <PageHeader
        title="Google Workspace Migration"
        description="Bulk migrate Gmail, Drive, Docs, and Calendar to Anvil."
        actions={
          <Button onClick={() => setShowNewMigration(true)}>+ Start Migration</Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Migrated" value={totalMigrated.toLocaleString()} icon="✅" />
        <StatCard label="Running Jobs" value={running} icon="⚡" />
        <StatCard label="Completed" value={completed} icon="📦" />
        <StatCard label="Failed Items" value={totalFailed} change={totalFailed > 0 ? 'Review errors' : 'All clear'} icon="⚠️" />
      </div>

      {/* Prerequisites */}
      <Card className="p-5 mb-6">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Prerequisites</h3>
        <div className="grid md:grid-cols-3 gap-4 text-sm">
          <div className="flex items-start gap-3">
            <span className="text-green-500 mt-0.5">✓</span>
            <div>
              <div className="font-medium text-gray-900 dark:text-gray-100">Google Service Account</div>
              <div className="text-gray-500">With domain-wide delegation enabled</div>
              <code className="text-xs text-blue-600 mt-1 block">GOOGLE_SERVICE_ACCOUNT_KEY</code>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-green-500 mt-0.5">✓</span>
            <div>
              <div className="font-medium text-gray-900 dark:text-gray-100">Admin Impersonation</div>
              <div className="text-gray-500">Admin email for OAuth delegation</div>
              <code className="text-xs text-blue-600 mt-1 block">GOOGLE_ADMIN_EMAIL</code>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-green-500 mt-0.5">✓</span>
            <div>
              <div className="font-medium text-gray-900 dark:text-gray-100">Anvil Running</div>
              <div className="text-gray-500">Stalwart, MinIO, and API must be up</div>
              <code className="text-xs text-blue-600 mt-1 block">ANVIL_API_URL</code>
            </div>
          </div>
        </div>
        <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
          <p className="text-xs font-mono text-gray-600 dark:text-gray-400">
            # CLI alternative: <span className="text-green-600">npx anvil-migrate all --domain company.com --all-users --dry-run</span>
          </p>
        </div>
      </Card>

      {/* Jobs list */}
      <Card>
        <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Migration Jobs</h3>
          <Button variant="ghost" size="sm" onClick={() => {}}>Refresh</Button>
        </div>

        {jobs.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No migrations yet. Start one to migrate your Google Workspace data.</div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {jobs.map(job => {
              const pct = getProgressPct(job);
              const barColor = job.status === 'completed' ? 'bg-green-500' : job.status === 'failed' ? 'bg-red-500' : 'bg-blue-500';

              return (
                <div
                  key={job.id}
                  className="p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
                  onClick={() => setActiveJob(job)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{TYPE_ICONS[job.type]}</span>
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{TYPE_LABELS[job.type]}</div>
                        <div className="text-xs text-gray-500">
                          {job.users.length > 1 ? `${job.users.length} users` : job.users[0]}
                          {' · '}{formatDuration(job.startedAt, job.completedAt)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-gray-500">{job.processedItems.toLocaleString()}/{job.totalItems.toLocaleString()} items</span>
                      {job.failedItems > 0 && <span className="text-red-500">{job.failedItems} failed</span>}
                      <Badge variant={
                        job.status === 'completed' ? 'success' :
                        job.status === 'running' ? 'info' :
                        job.status === 'failed' ? 'danger' : 'default'
                      }>
                        {job.status}
                      </Badge>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${barColor}`}
                      style={{width: `${job.status === 'completed' ? 100 : pct}%`}}
                    />
                  </div>
                  {job.status === 'running' && (
                    <div className="text-xs text-gray-400 mt-1">{pct}% complete</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* New Migration Modal */}
      {showNewMigration && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 rounded-xl p-6 w-full max-w-lg shadow-xl">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-5">New Migration Job</h2>

            <div className="space-y-5">
              {/* Type selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">What to migrate</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['gmail', 'drive', 'docs', 'calendar'] as MigrationType[]).map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => toggleType(type)}
                      className={`p-3 rounded-lg border-2 text-left text-sm transition-all ${
                        selectedTypes.includes(type)
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-700'
                      }`}
                    >
                      <span className="mr-2">{TYPE_ICONS[type]}</span>
                      {TYPE_LABELS[type].split(' → ')[0]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Domain */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Google Workspace Domain</label>
                <input
                  type="text"
                  value={domainInput}
                  onChange={e => setDomainInput(e.target.value)}
                  placeholder="company.com"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-mono"
                />
              </div>

              {/* Users */}
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Users</label>
                  <label className="flex items-center gap-2 text-sm text-gray-500">
                    <input type="checkbox" checked={allUsers} onChange={e => setAllUsers(e.target.checked)} />
                    All users in domain
                  </label>
                </div>
                {!allUsers && (
                  <textarea
                    value={userList}
                    onChange={e => setUserList(e.target.value)}
                    rows={3}
                    placeholder="user1@company.com, user2@company.com"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-mono resize-none"
                  />
                )}
              </div>

              {/* Dry run */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">Dry run first</div>
                  <div className="text-xs text-gray-500">Estimate item counts without migrating</div>
                </div>
                <button
                  onClick={() => setDryRun(!dryRun)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${dryRun ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${dryRun ? 'translate-x-5' : ''}`} />
                </button>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button onClick={startMigration} disabled={selectedTypes.length === 0}>
                {dryRun ? 'Start Dry Run' : 'Start Migration'}
              </Button>
              <Button variant="secondary" onClick={() => setShowNewMigration(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

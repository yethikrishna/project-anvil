'use client';

import {useState} from 'react';
import {ThemeProvider} from '@anvil/ui';

// ── Types ──

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'editor' | 'viewer';
  status: 'active' | 'suspended' | 'invited';
  lastActive: string;
  storageUsed: string;
  appsUsed: string[];
}

interface AuditLogEntry {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  action: string;
  resource: string;
  details: string;
  ip: string;
}

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  created: string;
  lastUsed: string;
  permissions: string[];
  status: 'active' | 'revoked';
}

// ── Demo Data ──

const DEMO_USERS: AdminUser[] = [
  {id: '1', name: 'Indu', email: 'indu@anvil.dev', role: 'admin', status: 'active', lastActive: '2 min ago', storageUsed: '2.4 GB', appsUsed: ['Drive', 'Docs', 'Gmail', 'Calendar']},
  {id: '2', name: 'Arjun Patel', email: 'arjun@anvil.dev', role: 'editor', status: 'active', lastActive: '1 hour ago', storageUsed: '890 MB', appsUsed: ['Docs', 'Maps']},
  {id: '3', name: 'Sarah Chen', email: 'sarah@anvil.dev', role: 'editor', status: 'active', lastActive: '3 hours ago', storageUsed: '1.2 GB', appsUsed: ['Drive', 'YouTube', 'Search']},
  {id: '4', name: 'Mike Johnson', email: 'mike@anvil.dev', role: 'viewer', status: 'invited', lastActive: 'Never', storageUsed: '0 MB', appsUsed: []},
  {id: '5', name: 'Priya Sharma', email: 'priya@anvil.dev', role: 'editor', status: 'suspended', lastActive: '30 days ago', storageUsed: '450 MB', appsUsed: ['Gmail']},
];

const DEMO_AUDIT: AuditLogEntry[] = [
  {id: '1', timestamp: '2026-05-20T20:30:00Z', userId: '1', userName: 'Indu', action: 'file.upload', resource: 'drive:/reports/q1.pdf', details: 'Uploaded 2.4 MB PDF', ip: '192.168.1.100'},
  {id: '2', timestamp: '2026-05-20T20:15:00Z', userId: '2', userName: 'Arjun Patel', action: 'doc.edit', resource: 'docs:project-plan', details: 'Updated section 3', ip: '10.0.0.45'},
  {id: '3', timestamp: '2026-05-20T19:45:00Z', userId: '3', userName: 'Sarah Chen', action: 'email.send', resource: 'gmail:thread-123', details: 'Sent to 3 recipients', ip: '172.16.0.23'},
  {id: '4', timestamp: '2026-05-20T19:30:00Z', userId: '1', userName: 'Indu', action: 'user.invite', resource: 'user:mike@anvil.dev', details: 'Invited as viewer', ip: '192.168.1.100'},
  {id: '5', timestamp: '2026-05-20T18:00:00Z', userId: '1', userName: 'Indu', action: 'api_key.create', resource: 'apikey:prod-key', details: 'Created API key with drive.read, docs.read', ip: '192.168.1.100'},
  {id: '6', timestamp: '2026-05-20T17:30:00Z', userId: '5', userName: 'Priya Sharma', action: 'user.suspend', resource: 'user:priya@anvil.dev', details: 'Account suspended by admin', ip: '192.168.1.100'},
  {id: '7', timestamp: '2026-05-20T16:00:00Z', userId: '3', userName: 'Sarah Chen', action: 'file.share', resource: 'drive:/photos/vacation', details: 'Shared link created (expires 7d)', ip: '172.16.0.23'},
  {id: '8', timestamp: '2026-05-20T14:00:00Z', userId: '2', userName: 'Arjun Patel', action: 'calendar.create', resource: 'calendar:event-456', details: 'Created recurring weekly meeting', ip: '10.0.0.45'},
];

const DEMO_API_KEYS: ApiKey[] = [
  {id: '1', name: 'Production API', prefix: 'avk_prod_', created: '2026-05-01', lastUsed: '2 min ago', permissions: ['drive.read', 'drive.write', 'docs.read', 'docs.write'], status: 'active'},
  {id: '2', name: 'CI/CD Pipeline', prefix: 'avk_ci_', created: '2026-04-15', lastUsed: '1 hour ago', permissions: ['drive.read', 'search.read'], status: 'active'},
  {id: '3', name: 'Old Integration', prefix: 'avk_old_', created: '2026-01-10', lastUsed: '60 days ago', permissions: ['drive.read'], status: 'revoked'},
];

type AdminTab = 'users' | 'analytics' | 'audit' | 'api-keys' | 'settings';

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<AdminTab>('users');
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <ThemeProvider>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
        {/* Header */}
        <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🛡️</span>
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Admin Console</h1>
                <p className="text-xs text-gray-500">Team management, analytics & audit logs</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">All systems operational</span>
            </div>
          </div>
        </div>

        {/* Tab navigation */}
        <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6">
          <div className="flex gap-1">
            {([
              {id: 'users', label: '👥 Users', count: DEMO_USERS.length},
              {id: 'analytics', label: '📊 Analytics'},
              {id: 'audit', label: '📋 Audit Log', count: DEMO_AUDIT.length},
              {id: 'api-keys', label: '🔑 API Keys', count: DEMO_API_KEYS.filter(k => k.status === 'active').length},
              {id: 'settings', label: '⚙️ Settings'},
            ] as const).map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
                {tab.count && <span className="ml-1.5 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">{tab.count}</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {activeTab === 'users' && <UsersTab users={DEMO_USERS} searchQuery={searchQuery} onSearch={setSearchQuery} />}
          {activeTab === 'analytics' && <AnalyticsTab />}
          {activeTab === 'audit' && <AuditTab entries={DEMO_AUDIT} />}
          {activeTab === 'api-keys' && <ApiKeysTab keys={DEMO_API_KEYS} />}
          {activeTab === 'settings' && <SettingsTab />}
        </div>
      </div>
    </ThemeProvider>
  );
}

// ── Users Tab ──

function UsersTab({users, searchQuery, onSearch}: {users: AdminUser[]; searchQuery: string; onSearch: (q: string) => void}) {
  const filtered = searchQuery
    ? users.filter(u => u.name.toLowerCase().includes(searchQuery.toLowerCase()) || u.email.toLowerCase().includes(searchQuery.toLowerCase()))
    : users;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <input
          placeholder="Search users..."
          value={searchQuery}
          onChange={e => onSearch(e.target.value)}
          className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm w-64"
        />
        <button className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
          + Invite User
        </button>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">User</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Role</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Status</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Last Active</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Storage</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Apps</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(user => (
              <tr key={user.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">
                      {user.name.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{user.name}</div>
                      <div className="text-xs text-gray-500">{user.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    user.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                    user.role === 'editor' ? 'bg-blue-100 text-blue-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {user.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    user.status === 'active' ? 'bg-green-100 text-green-700' :
                    user.status === 'suspended' ? 'bg-red-100 text-red-700' :
                    'bg-yellow-100 text-yellow-700'
                  }`}>
                    {user.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{user.lastActive}</td>
                <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{user.storageUsed}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1 flex-wrap">
                    {user.appsUsed.map(app => (
                      <span key={app} className="text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-1.5 py-0.5 rounded">
                        {app}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <button className="text-xs text-gray-400 hover:text-gray-600">•••</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Analytics Tab ──

function AnalyticsTab() {
  const metrics = [
    {label: 'Total Users', value: '5', change: '+2 this week', icon: '👥'},
    {label: 'Active Today', value: '3', change: '60% of users', icon: '🟢'},
    {label: 'Total Files', value: '1,247', change: '+45 this week', icon: '📁'},
    {label: 'Storage Used', value: '4.9 GB', change: 'of 50 GB limit', icon: '💾'},
    {label: 'Documents', value: '312', change: '+18 this week', icon: '📝'},
    {label: 'Emails Sent', value: '892', change: '+67 this week', icon: '✉️'},
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        {metrics.map(m => (
          <div key={m.label} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">{m.label}</span>
              <span className="text-lg">{m.icon}</span>
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{m.value}</div>
            <div className="text-xs text-gray-500 mt-1">{m.change}</div>
          </div>
        ))}
      </div>

      {/* Usage by app */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">Usage by App</h3>
        <div className="space-y-3">
          {[
            {app: 'Drive', users: 3, pct: 60},
            {app: 'Docs', users: 4, pct: 80},
            {app: 'Gmail', users: 3, pct: 60},
            {app: 'Calendar', users: 2, pct: 40},
            {app: 'YouTube', users: 1, pct: 20},
            {app: 'Maps', users: 2, pct: 40},
            {app: 'Search', users: 5, pct: 100},
          ].map(item => (
            <div key={item.app} className="flex items-center gap-3">
              <span className="text-sm text-gray-600 dark:text-gray-400 w-20">{item.app}</span>
              <div className="flex-1 h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full transition-all" style={{width: `${item.pct}%`}} />
              </div>
              <span className="text-xs text-gray-500 w-20 text-right">{item.users} users</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Audit Tab ──

function AuditTab({entries}: {entries: AuditLogEntry[]}) {
  const actionColors: Record<string, string> = {
    'file.upload': 'bg-blue-100 text-blue-700',
    'file.share': 'bg-purple-100 text-purple-700',
    'doc.edit': 'bg-green-100 text-green-700',
    'email.send': 'bg-yellow-100 text-yellow-700',
    'user.invite': 'bg-cyan-100 text-cyan-700',
    'user.suspend': 'bg-red-100 text-red-700',
    'api_key.create': 'bg-orange-100 text-orange-700',
    'calendar.create': 'bg-pink-100 text-pink-700',
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Time</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">User</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Action</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Resource</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Details</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">IP</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(entry => (
            <tr key={entry.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/30">
              <td className="px-4 py-3 text-xs text-gray-500 font-mono">
                {new Date(entry.timestamp).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}
              </td>
              <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{entry.userName}</td>
              <td className="px-4 py-3">
                <span className={`text-xs px-2 py-0.5 rounded ${actionColors[entry.action] ?? 'bg-gray-100 text-gray-600'}`}>
                  {entry.action}
                </span>
              </td>
              <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400 font-mono">{entry.resource}</td>
              <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400">{entry.details}</td>
              <td className="px-4 py-3 text-xs text-gray-400 font-mono">{entry.ip}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── API Keys Tab ──

function ApiKeysTab({keys}: {keys: ApiKey[]}) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
          + Create API Key
        </button>
      </div>

      <div className="space-y-3">
        {keys.map(key => (
          <div key={key.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{key.name}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${key.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {key.status}
                </span>
              </div>
              <div className="flex gap-2">
                {key.status === 'active' && (
                  <button className="text-xs text-red-500 hover:text-red-700">Revoke</button>
                )}
                <button className="text-xs text-gray-500 hover:text-gray-700">Copy</button>
              </div>
            </div>
            <div className="text-xs text-gray-500">
              Key: <code className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">{key.prefix}•••••••••••••••</code>
              <span className="mx-3">Created: {key.created}</span>
              <span>Last used: {key.lastUsed}</span>
            </div>
            <div className="flex gap-1.5 mt-2">
              {key.permissions.map(perm => (
                <span key={perm} className="text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-1.5 py-0.5 rounded">
                  {perm}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Settings Tab ──

function SettingsTab() {
  return (
    <div className="max-w-2xl space-y-6">
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">General</h3>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-500">Organization Name</label>
            <input defaultValue="Anvil Corp" className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Default Timezone</label>
            <select className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent text-sm">
              <option>UTC</option>
              <option>America/New_York</option>
              <option>Asia/Calcutta</option>
              <option>Europe/London</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">Security</h3>
        <div className="space-y-3">
          {[
            {label: 'Enforce 2FA for all users', enabled: false},
            {label: 'SSO-only authentication', enabled: false},
            {label: 'Session timeout (30 min)', enabled: true},
            {label: 'API key expiration (90 days)', enabled: true},
            {label: 'Audit log retention (1 year)', enabled: true},
          ].map(setting => (
            <div key={setting.label} className="flex items-center justify-between py-2">
              <span className="text-sm text-gray-700 dark:text-gray-300">{setting.label}</span>
              <div className={`w-10 h-5 rounded-full p-0.5 cursor-pointer transition-colors ${setting.enabled ? 'bg-blue-600' : 'bg-gray-300'}`}>
                <div className={`w-4 h-4 bg-white rounded-full transition-transform ${setting.enabled ? 'translate-x-5' : ''}`} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">Billing</h3>
        <div className="text-sm text-gray-600 dark:text-gray-400">
          <div className="flex items-center justify-between py-2">
            <span>Current Plan</span>
            <span className="font-medium text-gray-900 dark:text-gray-100">Free Tier</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span>Storage</span>
            <span>4.9 GB / 50 GB</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span>Users</span>
            <span>5 / 10</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Admin Audit Log Page
 * Searchable, filterable audit trail with export.
 */
'use client';

import {useState} from 'react';
import {AdminLayout, PageHeader, Button, Badge, Card, DataTable} from '../../components/admin-ui';

interface AuditEntry {
  id: string;
  timestamp: string;
  user: string;
  userEmail: string;
  action: string;
  resourceType: string;
  resourceId: string;
  details: string;
  ipAddress: string;
}

const ACTION_COLORS: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'default'> = {
  'user.create': 'success', 'user.invite': 'info', 'user.suspend': 'warning', 'user.delete': 'danger',
  'auth.login': 'success', 'auth.logout': 'default', 'auth.mfa_enable': 'info', 'auth.mfa_disable': 'warning',
  'billing.update': 'info', 'billing.cancel': 'danger',
  'sso.configure': 'info', 'ldap.sync': 'info', 'api_key.create': 'success', 'api_key.revoke': 'warning',
  'org.settings_update': 'info', 'org.export_data': 'info',
};

const DEMO_ENTRIES: AuditEntry[] = [
  {id: '1', timestamp: '2026-05-22 05:30:00', user: 'Indu', userEmail: 'indu@anvil.dev', action: 'auth.login', resourceType: 'session', resourceId: '-', details: 'MFA verified via TOTP', ipAddress: '203.0.113.42'},
  {id: '2', timestamp: '2026-05-22 05:28:00', user: 'Indu', userEmail: 'indu@anvil.dev', action: 'user.invite', resourceType: 'user', resourceId: 'mike@anvil.dev', details: 'Invited as viewer', ipAddress: '203.0.113.42'},
  {id: '3', timestamp: '2026-05-22 04:15:00', user: 'Arjun Patel', userEmail: 'arjun@anvil.dev', action: 'org.settings_update', resourceType: 'org', resourceId: '-', details: 'Updated MFA policy to required', ipAddress: '198.51.100.23'},
  {id: '4', timestamp: '2026-05-22 03:45:00', user: 'System', userEmail: '-', action: 'ldap.sync', resourceType: 'ldap', resourceId: '-', details: 'Synced 47 users, 3 new, 0 removed', ipAddress: '-'},
  {id: '5', timestamp: '2026-05-22 02:00:00', user: 'Sarah Chen', userEmail: 'sarah@anvil.dev', action: 'api_key.create', resourceType: 'api_key', resourceId: 'avk_prod_***', details: 'Named "CI/CD Pipeline"', ipAddress: '198.51.100.78'},
  {id: '6', timestamp: '2026-05-22 01:30:00', user: 'System', userEmail: '-', action: 'billing.update', resourceType: 'subscription', resourceId: '-', details: 'Seats updated: 23 → 25 (proration applied)', ipAddress: '-'},
  {id: '7', timestamp: '2026-05-21 23:00:00', user: 'Indu', userEmail: 'indu@anvil.dev', action: 'sso.configure', resourceType: 'saml_idp', resourceId: 'okta-prod', details: 'Updated Okta IdP certificate', ipAddress: '203.0.113.42'},
  {id: '8', timestamp: '2026-05-21 20:15:00', user: 'Arjun Patel', userEmail: 'arjun@anvil.dev', action: 'user.suspend', resourceType: 'user', resourceId: 'priya@anvil.dev', details: 'Reason: Security policy violation', ipAddress: '198.51.100.23'},
  {id: '9', timestamp: '2026-05-21 18:00:00', user: 'David Kim', userEmail: 'david@anvil.dev', action: 'auth.mfa_enable', resourceType: 'user_mfa', resourceId: '-', details: 'Enabled WebAuthn (TouchID)', ipAddress: '198.51.100.91'},
  {id: '10', timestamp: '2026-05-21 15:30:00', user: 'Indu', userEmail: 'indu@anvil.dev', action: 'org.export_data', resourceType: 'export', resourceId: '-', details: 'Full org data export requested (JSON)', ipAddress: '203.0.113.42'},
];

export default function AuditPage() {
  const [entries] = useState<AuditEntry[]>(DEMO_ENTRIES);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');

  const filtered = entries.filter(e => {
    if (search && !e.user.toLowerCase().includes(search.toLowerCase()) && !e.action.includes(search) && !e.details.toLowerCase().includes(search.toLowerCase())) return false;
    if (actionFilter && !e.action.startsWith(actionFilter)) return false;
    return true;
  });

  const actionTypes = [...new Set(entries.map(e => e.action.split('.')[0]))].sort();

  return (
    <AdminLayout>
      <PageHeader
        title="Audit Log"
        description="Immutable record of all actions. 6-year retention for compliance."
        actions={
          <Button variant="secondary">Export CSV</Button>
        }
      />

      {/* Filters */}
      <Card>
        <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-4 flex-wrap">
          <input
            type="text"
            placeholder="Search actions, users, details..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={actionFilter}
            onChange={e => setActionFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
          >
            <option value="">All Categories</option>
            {actionTypes.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
          />
        </div>

        {/* Table */}
        <DataTable<AuditEntry>
          columns={[
            {key: 'timestamp', label: 'Time', render: (e) => (
              <div className="text-xs font-mono text-gray-500 whitespace-nowrap">{e.timestamp}</div>
            )},
            {key: 'user', label: 'User', render: (e) => (
              <div>
                <div className="font-medium text-sm">{e.user}</div>
                <div className="text-xs text-gray-500">{e.ipAddress}</div>
              </div>
            )},
            {key: 'action', label: 'Action', render: (e) => (
              <Badge variant={ACTION_COLORS[e.action] || 'default'}>{e.action}</Badge>
            )},
            {key: 'resource', label: 'Resource', render: (e) => (
              <div>
                <div className="text-sm">{e.resourceType}</div>
                <div className="text-xs text-gray-500 font-mono">{e.resourceId}</div>
              </div>
            )},
            {key: 'details', label: 'Details', render: (e) => (
              <div className="text-sm text-gray-600 dark:text-gray-400 max-w-xs truncate">{e.details}</div>
            )},
          ]}
          data={filtered}
        />

        {/* Pagination */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between text-sm text-gray-500">
          <span>Showing {filtered.length} of {entries.length} entries</span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" disabled>Previous</Button>
            <span>Page 1</span>
            <Button variant="ghost" size="sm">Next</Button>
          </div>
        </div>
      </Card>
    </AdminLayout>
  );
}

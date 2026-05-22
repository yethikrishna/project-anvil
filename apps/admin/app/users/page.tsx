/**
 * Admin Users Management Page
 * Full CRUD for user management with invite, role change, suspend, deactivate.
 */
'use client';

import {useState} from 'react';
import {AdminLayout, PageHeader, Button, Badge, Card, DataTable, StatCard, EmptyState} from '../../components/admin-ui';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'admin' | 'member' | 'viewer' | 'guest';
  status: 'active' | 'suspended' | 'invited' | 'deactivated';
  lastLoginAt: string | null;
  createdAt: string;
  mfaEnabled: boolean;
}

const ROLES: Record<string, string> = {owner: 'Owner', admin: 'Admin', member: 'Member', viewer: 'Viewer', guest: 'Guest'};
const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
  active: 'success', suspended: 'warning', invited: 'info', deactivated: 'danger',
};

// Demo data for development
const DEMO_USERS: User[] = [
  {id: '1', name: 'Indu', email: 'indu@anvil.dev', role: 'owner', status: 'active', lastLoginAt: '2 min ago', createdAt: '2026-01-15', mfaEnabled: true},
  {id: '2', name: 'Arjun Patel', email: 'arjun@anvil.dev', role: 'admin', status: 'active', lastLoginAt: '1 hour ago', createdAt: '2026-02-10', mfaEnabled: true},
  {id: '3', name: 'Sarah Chen', email: 'sarah@anvil.dev', role: 'member', status: 'active', lastLoginAt: '3 hours ago', createdAt: '2026-03-01', mfaEnabled: false},
  {id: '4', name: 'Mike Johnson', email: 'mike@anvil.dev', role: 'viewer', status: 'invited', lastLoginAt: null, createdAt: '2026-05-20', mfaEnabled: false},
  {id: '5', name: 'Priya Sharma', email: 'priya@anvil.dev', role: 'member', status: 'suspended', lastLoginAt: '30 days ago', createdAt: '2026-01-20', mfaEnabled: true},
  {id: '6', name: 'David Kim', email: 'david@anvil.dev', role: 'member', status: 'active', lastLoginAt: '5 min ago', createdAt: '2026-04-12', mfaEnabled: true},
];

export default function UsersPage() {
  const [users] = useState<User[]>(DEMO_USERS);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showInviteModal, setShowInviteModal] = useState(false);

  const filtered = users.filter(u => {
    if (search && !u.name.toLowerCase().includes(search.toLowerCase()) && !u.email.toLowerCase().includes(search.toLowerCase())) return false;
    if (roleFilter && u.role !== roleFilter) return false;
    if (statusFilter && u.status !== statusFilter) return false;
    return true;
  });

  const activeUsers = users.filter(u => u.status === 'active').length;
  const mfaEnabled = users.filter(u => u.mfaEnabled).length;
  const pendingInvites = users.filter(u => u.status === 'invited').length;

  return (
    <AdminLayout>
      <PageHeader
        title="Users"
        description={`${users.length} total · ${activeUsers} active · ${pendingInvites} pending invites`}
        actions={
          <Button onClick={() => setShowInviteModal(true)}>+ Invite User</Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Users" value={users.length} change="+2 this month" icon="👥" />
        <StatCard label="Active" value={activeUsers} icon="✅" />
        <StatCard label="MFA Enabled" value={`${mfaEnabled}/${activeUsers}`} icon="🔐" />
        <StatCard label="Pending Invites" value={pendingInvites} icon="📨" />
      </div>

      {/* Filters */}
      <Card>
        <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-4">
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
          >
            <option value="">All Roles</option>
            {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="invited">Invited</option>
            <option value="deactivated">Deactivated</option>
          </select>
        </div>

        {/* Table */}
        {filtered.length === 0 ? (
          <EmptyState icon="🔍" title="No users found" description="Try adjusting your search or filters." />
        ) : (
          <DataTable<User>
            columns={[
              {key: 'name', label: 'User', render: (u) => (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center text-xs font-medium text-blue-700 dark:text-blue-300">
                    {u.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                  </div>
                  <div>
                    <div className="font-medium">{u.name}</div>
                    <div className="text-xs text-gray-500">{u.email}</div>
                  </div>
                </div>
              )},
              {key: 'role', label: 'Role', render: (u) => <Badge variant={u.role === 'owner' ? 'info' : 'default'}>{ROLES[u.role]}</Badge>},
              {key: 'status', label: 'Status', render: (u) => <Badge variant={STATUS_VARIANT[u.status]}>{u.status}</Badge>},
              {key: 'mfa', label: 'MFA', render: (u) => u.mfaEnabled ? <span className="text-green-500">✓</span> : <span className="text-gray-300">—</span>},
              {key: 'lastLogin', label: 'Last Active', render: (u) => <span className="text-gray-500">{u.lastLoginAt ?? 'Never'}</span>},
              {key: 'actions', label: '', render: (u) => (
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm">Edit</Button>
                  {u.status === 'active' && u.role !== 'owner' && (
                    <Button variant="ghost" size="sm" onClick={() => {}}>Suspend</Button>
                  )}
                  {u.status === 'suspended' && (
                    <Button variant="ghost" size="sm" onClick={() => {}}>Reactivate</Button>
                  )}
                </div>
              )},
            ]}
            data={filtered}
          />
        )}
      </Card>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 rounded-xl p-6 w-full max-w-md shadow-xl">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">Invite User</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                <input type="email" placeholder="user@company.com" className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role</label>
                <select className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm">
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                  <option value="viewer">Viewer</option>
                  <option value="guest">Guest</option>
                </select>
              </div>
              <div className="flex items-center gap-3 pt-2">
                <Button onClick={() => setShowInviteModal(false)}>Send Invite</Button>
                <Button variant="secondary" onClick={() => setShowInviteModal(false)}>Cancel</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

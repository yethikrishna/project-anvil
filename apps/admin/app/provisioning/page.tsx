/**
 * Admin SCIM Provisioning Page
 * Configure SCIM 2.0 for automatic user provisioning from Okta, Azure AD, OneLogin, etc.
 */
'use client';

import {useState} from 'react';
import {AdminLayout, PageHeader, Button, Badge, Card} from '../../components/admin-ui';

interface SCIMToken {
  id: string;
  label: string;
  prefix: string;
  active: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

interface GroupRoleMapping {
  ldapGroup: string;
  anvilRole: 'admin' | 'member' | 'viewer';
}

const DEMO_TOKENS: SCIMToken[] = [
  {
    id: '1',
    label: 'Okta Provisioning',
    prefix: 'scim_a3f8b9c1d2e4',
    active: true,
    createdAt: '2026-04-12',
    lastUsedAt: '2 min ago',
  },
];

const IDPS = [
  {
    id: 'okta',
    name: 'Okta',
    logo: '🔐',
    instructions: 'Go to Okta Admin → Directory → Profile Editor → Add App → Anvil. Use the token and endpoint below.',
  },
  {
    id: 'azure',
    name: 'Azure AD',
    logo: '☁️',
    instructions: 'In Azure AD, open your Enterprise App → Provisioning → Set mode to Automatic → enter tenant URL and secret token.',
  },
  {
    id: 'onelogin',
    name: 'OneLogin',
    logo: '🛡️',
    instructions: 'In OneLogin Admin → Apps → Anvil → Configuration. Enter SCIM Base URL and Bearer Token.',
  },
  {
    id: 'google',
    name: 'Google Workspace',
    logo: '🅶',
    instructions: 'Google Workspace SCIM via Admin Console → Directory → Auto-provisioning.',
  },
];

const DEFAULT_ROLE_OPTIONS = [
  {value: 'viewer', label: 'Viewer — read-only access'},
  {value: 'member', label: 'Member — standard access'},
  {value: 'admin', label: 'Admin — full management access'},
];

export default function SCIMProvisioningPage() {
  const [tokens, setTokens] = useState<SCIMToken[]>(DEMO_TOKENS);
  const [showNewToken, setShowNewToken] = useState(false);
  const [newTokenLabel, setNewTokenLabel] = useState('');
  const [generatedToken, setGeneratedToken] = useState('');
  const [defaultRole, setDefaultRole] = useState<'admin' | 'member' | 'viewer'>('member');
  const [autoCreateGroups, setAutoCreateGroups] = useState(false);
  const [groupMappings, setGroupMappings] = useState<GroupRoleMapping[]>([
    {ldapGroup: 'Engineering', anvilRole: 'member'},
    {ldapGroup: 'IT Admins', anvilRole: 'admin'},
  ]);
  const [selectedIdp, setSelectedIdp] = useState('okta');
  const [activeTab, setActiveTab] = useState<'setup' | 'tokens' | 'mapping' | 'log'>('setup');

  const tenantScimUrl = 'https://admin.anvil.dev/api/scim/v2';

  function handleGenerateToken() {
    // In production: POST /api/scim/tokens
    const mockToken = `scim_${Array.from({length: 48}, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('')}`;
    setGeneratedToken(mockToken);
    setTokens(prev => [
      ...prev,
      {
        id: String(Date.now()),
        label: newTokenLabel || 'New Token',
        prefix: mockToken.slice(0, 16),
        active: true,
        createdAt: new Date().toISOString().slice(0, 10),
        lastUsedAt: null,
      },
    ]);
    setNewTokenLabel('');
    setShowNewToken(false);
  }

  function addGroupMapping() {
    setGroupMappings(prev => [...prev, {ldapGroup: '', anvilRole: 'member'}]);
  }

  function removeGroupMapping(idx: number) {
    setGroupMappings(prev => prev.filter((_, i) => i !== idx));
  }

  return (
    <AdminLayout>
      <PageHeader
        title="SCIM Provisioning"
        description="Auto-provision users from Okta, Azure AD, OneLogin, and more via SCIM 2.0."
        actions={
          <Badge variant="success">SCIM 2.0 Active</Badge>
        }
      />

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 w-fit flex-wrap">
        {([
          ['setup', 'IdP Setup'],
          ['tokens', 'Tokens'],
          ['mapping', 'Group Mapping'],
          ['log', 'Provisioning Log'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === key
                ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Setup Tab */}
      {activeTab === 'setup' && (
        <div className="space-y-5">
          {/* IdP selector */}
          <Card className="p-5">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Select Your Identity Provider</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              {IDPS.map(idp => (
                <button
                  key={idp.id}
                  onClick={() => setSelectedIdp(idp.id)}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    selectedIdp === idp.id
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                  }`}
                >
                  <div className="text-2xl mb-2">{idp.logo}</div>
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{idp.name}</div>
                </button>
              ))}
            </div>

            {/* Instructions */}
            <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
              <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-1">
                {IDPS.find(i => i.id === selectedIdp)?.name} Setup
              </h4>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                {IDPS.find(i => i.id === selectedIdp)?.instructions}
              </p>
            </div>
          </Card>

          {/* Connection details */}
          <Card className="p-5">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">SCIM Endpoint Details</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">SCIM Base URL</label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-sm font-mono text-gray-900 dark:text-gray-100">
                    {tenantScimUrl}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigator.clipboard.writeText(tenantScimUrl)}
                  >
                    Copy
                  </Button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Unique Identifier Field</label>
                <code className="px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-sm font-mono text-gray-900 dark:text-gray-100 block">
                  userName (email address)
                </code>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Supported Operations</label>
                <div className="flex flex-wrap gap-2">
                  {['Create User', 'Update User', 'Deactivate User', 'Reactivate User', 'List Users', 'Filter Users'].map(op => (
                    <Badge key={op} variant="default">{op}</Badge>
                  ))}
                </div>
              </div>

              <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  <strong>Note:</strong> Use a SCIM bearer token from the Tokens tab as the secret.
                  Never use your admin password. Rotate tokens annually or when personnel changes.
                </p>
              </div>
            </div>
          </Card>

          {/* Service Provider Config discovery */}
          <Card className="p-5">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Discovery Endpoint</h3>
            <p className="text-sm text-gray-500 mb-3">
              Some IdPs auto-discover capabilities from the ServiceProviderConfig endpoint.
            </p>
            <code className="block px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-sm font-mono">
              GET {tenantScimUrl}/ServiceProviderConfig
            </code>
          </Card>
        </div>
      )}

      {/* Tokens Tab */}
      {activeTab === 'tokens' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Each token grants full SCIM access. Use one token per IdP connection.
            </p>
            <Button onClick={() => setShowNewToken(true)}>+ Generate Token</Button>
          </div>

          {/* Generated token display (one-time) */}
          {generatedToken && (
            <div className="p-4 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
              <h4 className="text-sm font-semibold text-green-800 dark:text-green-200 mb-2">
                ✅ Token generated — copy it now, it won't be shown again
              </h4>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 rounded-lg bg-white dark:bg-gray-900 text-xs font-mono text-gray-900 dark:text-gray-100 break-all">
                  {generatedToken}
                </code>
                <Button
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(generatedToken);
                    setGeneratedToken('');
                  }}
                >
                  Copy & Close
                </Button>
              </div>
            </div>
          )}

          {/* Token list */}
          <Card>
            {tokens.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                No tokens yet. Generate one to enable SCIM provisioning.
              </div>
            ) : (
              <div className="divide-y divide-gray-200 dark:divide-gray-800">
                {tokens.map(token => (
                  <div key={token.id} className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center text-blue-600">
                        🔑
                      </div>
                      <div>
                        <div className="font-medium text-sm text-gray-900 dark:text-gray-100">{token.label}</div>
                        <div className="text-xs text-gray-400 font-mono">{token.prefix}••••••••</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span>Created {token.createdAt}</span>
                      <span>Last used: {token.lastUsedAt ?? 'Never'}</span>
                      <Badge variant={token.active ? 'success' : 'warning'}>{token.active ? 'Active' : 'Revoked'}</Badge>
                      {token.active && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setTokens(prev => prev.map(t => t.id === token.id ? {...t, active: false} : t))}
                        >
                          Revoke
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* New token modal */}
          {showNewToken && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-white dark:bg-gray-900 rounded-xl p-6 w-full max-w-md shadow-xl">
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">Generate SCIM Token</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Token Label</label>
                    <input
                      type="text"
                      value={newTokenLabel}
                      onChange={e => setNewTokenLabel(e.target.value)}
                      placeholder="e.g., Okta Provisioning"
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
                    />
                  </div>
                  <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-300">
                    The token will only be shown once. Store it securely in your IdP configuration.
                  </div>
                  <div className="flex gap-3">
                    <Button onClick={handleGenerateToken}>Generate Token</Button>
                    <Button variant="secondary" onClick={() => setShowNewToken(false)}>Cancel</Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Group Mapping Tab */}
      {activeTab === 'mapping' && (
        <div className="space-y-5">
          <Card className="p-5">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Default Role</h3>
            <p className="text-sm text-gray-500 mb-3">
              Assigned to provisioned users who don't match any group mapping.
            </p>
            <select
              value={defaultRole}
              onChange={e => setDefaultRole(e.target.value as typeof defaultRole)}
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
            >
              {DEFAULT_ROLE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">Group → Role Mappings</h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  Map IdP group names to Anvil roles. Highest-privilege role wins when a user belongs to multiple groups.
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={addGroupMapping}>+ Add Mapping</Button>
            </div>

            <div className="space-y-2">
              {groupMappings.map((mapping, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <input
                    type="text"
                    value={mapping.ldapGroup}
                    onChange={e => setGroupMappings(prev => prev.map((m, i) => i === idx ? {...m, ldapGroup: e.target.value} : m))}
                    placeholder="IdP group name (e.g., Engineering)"
                    className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-mono"
                  />
                  <span className="text-gray-400 text-sm">→</span>
                  <select
                    value={mapping.anvilRole}
                    onChange={e => setGroupMappings(prev => prev.map((m, i) => i === idx ? {...m, anvilRole: e.target.value as typeof mapping.anvilRole} : m))}
                    className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
                  >
                    <option value="admin">Admin</option>
                    <option value="member">Member</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeGroupMapping(idx)}
                    className="text-red-500 hover:text-red-700"
                  >
                    ✕
                  </Button>
                </div>
              ))}
              {groupMappings.length === 0 && (
                <p className="text-sm text-gray-400 italic">No mappings. All users will get the default role.</p>
              )}
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">Auto-create Groups</h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  Automatically create Anvil teams when IdP groups are provisioned.
                </p>
              </div>
              <button
                onClick={() => setAutoCreateGroups(!autoCreateGroups)}
                className={`relative w-11 h-6 rounded-full transition-colors ${autoCreateGroups ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${autoCreateGroups ? 'translate-x-5' : ''}`} />
              </button>
            </div>
          </Card>

          <Button>Save Mapping Configuration</Button>
        </div>
      )}

      {/* Provisioning Log Tab */}
      {activeTab === 'log' && (
        <Card>
          <div className="p-4 border-b border-gray-200 dark:border-gray-800">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Recent SCIM Operations</h3>
            <p className="text-xs text-gray-500 mt-0.5">Last 50 provisioning events from all IdPs.</p>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {[
              {time: '09:24 AM', op: 'CREATE', user: 'new.hire@company.com', idp: 'Okta', result: 'success', role: 'member'},
              {time: '09:20 AM', op: 'UPDATE', user: 'alice@company.com', idp: 'Okta', result: 'success', role: null},
              {time: '08:55 AM', op: 'DEACTIVATE', user: 'ex.employee@company.com', idp: 'Okta', result: 'success', role: null},
              {time: '08:30 AM', op: 'CREATE', user: 'bob@company.com', idp: 'Azure AD', result: 'success', role: 'admin'},
              {time: 'Yesterday', op: 'CREATE', user: 'charlie@company.com', idp: 'Okta', result: 'error', role: null},
            ].map((entry, i) => (
              <div key={i} className="p-4 flex items-center gap-4 text-sm">
                <span className="text-gray-400 w-24 text-xs">{entry.time}</span>
                <Badge variant={entry.op === 'DEACTIVATE' ? 'warning' : entry.op === 'CREATE' ? 'success' : 'default'}>
                  {entry.op}
                </Badge>
                <span className="flex-1 text-gray-700 dark:text-gray-300 font-mono">{entry.user}</span>
                <span className="text-gray-500 text-xs">{entry.idp}</span>
                {entry.role && <Badge variant="info">{entry.role}</Badge>}
                <Badge variant={entry.result === 'success' ? 'success' : 'danger'}>{entry.result}</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}
    </AdminLayout>
  );
}

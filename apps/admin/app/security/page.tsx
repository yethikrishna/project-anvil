/**
 * Admin Security Page
 * SSO (SAML), LDAP/AD, MFA enforcement, API keys, and encryption key management.
 */
'use client';

import {useState} from 'react';
import {AdminLayout, PageHeader, Button, Badge, Card, StatCard} from '../../components/admin-ui';

export default function SecurityPage() {
  const [activeTab, setActiveTab] = useState<'sso' | 'ldap' | 'mfa' | 'api-keys' | 'encryption'>('sso');

  return (
    <AdminLayout>
      <PageHeader title="Security" description="SSO, LDAP, MFA, API keys, and encryption management." />

      {/* Stats */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <StatCard label="SSO Providers" value="1" icon="🔑" />
        <StatCard label="LDAP Sync" value="Active" change="Last: 2h ago" icon="🏢" />
        <StatCard label="MFA Policy" value="Required" icon="🔐" />
        <StatCard label="API Keys" value="8" change="3 active" icon="🗝️" />
        <StatCard label="Encryption" value="HSM" change="Keys: 5 active" icon="🔒" />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 w-fit">
        {(['sso', 'ldap', 'mfa', 'api-keys', 'encryption'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === tab
                ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {tab === 'sso' ? 'SSO (SAML)' : tab === 'ldap' ? 'LDAP / AD' : tab === 'mfa' ? 'MFA' : tab === 'api-keys' ? 'API Keys' : 'Encryption'}
          </button>
        ))}
      </div>

      {/* SSO Tab */}
      {activeTab === 'sso' && (
        <Card className="divide-y divide-gray-200 dark:divide-gray-800">
          <div className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">SAML 2.0 Identity Providers</h3>
                <p className="text-sm text-gray-500 mt-1">Configure SSO with your enterprise IdP.</p>
              </div>
              <Button>+ Add IdP</Button>
            </div>
            <div className="space-y-3">
              {/* Existing IdP */}
              <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-lg">🔵</div>
                  <div>
                    <div className="font-medium text-gray-900 dark:text-gray-100">Okta Production</div>
                    <div className="text-xs text-gray-500">Entity ID: https://anvil.dev/saml · Last sync: 1h ago</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="success">Active</Badge>
                  <Button variant="ghost" size="sm">Configure</Button>
                </div>
              </div>

              {/* SP Metadata */}
              <div className="p-4 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Service Provider Metadata</h4>
                <code className="block text-xs font-mono text-gray-600 dark:text-gray-400 break-all">
                  https://anvil.dev/api/auth/saml/metadata
                </code>
                <p className="mt-2 text-xs text-gray-500">Provide this URL to your IdP administrator to configure the SAML integration.</p>
              </div>
            </div>
          </div>

          <div className="p-5">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">SAML Settings</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">ACS URL</label>
                <code className="block px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-xs font-mono">https://anvil.dev/api/auth/saml/acs</code>
              </div>
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Entity ID</label>
                <code className="block px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-xs font-mono">https://anvil.dev/saml/metadata</code>
              </div>
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Signed Assertions</label>
                <Badge variant="success">Required</Badge>
              </div>
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">JIT Provisioning</label>
                <Badge variant="success">Enabled</Badge>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* LDAP Tab */}
      {activeTab === 'ldap' && (
        <Card className="divide-y divide-gray-200 dark:divide-gray-800">
          <div className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">LDAP / Active Directory</h3>
                <p className="text-sm text-gray-500 mt-1">Sync users and groups from your directory server.</p>
              </div>
              <Button>+ Add Connection</Button>
            </div>

            <div className="space-y-3">
              <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-orange-50 dark:bg-orange-900/20 flex items-center justify-center text-lg">🏢</div>
                    <div>
                      <div className="font-medium text-gray-900 dark:text-gray-100">Corporate AD</div>
                      <div className="text-xs text-gray-500">ldap://ad.corp.local:389 · DC=corp,DC=local</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="success">Connected</Badge>
                    <Button variant="ghost" size="sm">Sync Now</Button>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-4 mt-4 pt-4 border-t border-gray-200 dark:border-gray-800">
                  <div>
                    <div className="text-xs text-gray-500">Users Synced</div>
                    <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">47</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Groups Mapped</div>
                    <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">8</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Last Sync</div>
                    <div className="text-sm font-medium text-gray-700 dark:text-gray-300">2 hours ago</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Sync Interval</div>
                    <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Every 1 hour</div>
                  </div>
                </div>
              </div>

              {/* Role Mappings */}
              <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">Group → Role Mappings</h4>
                <div className="space-y-2">
                  {[
                    {group: 'CN=Anvil-Admins,OU=Groups,DC=corp,DC=local', role: 'Admin'},
                    {group: 'CN=Anvil-Editors,OU=Groups,DC=corp,DC=local', role: 'Member'},
                    {group: 'CN=Anvil-Viewers,OU=Groups,DC=corp,DC=local', role: 'Viewer'},
                  ].map(m => (
                    <div key={m.group} className="flex items-center justify-between py-2 text-sm">
                      <code className="text-xs text-gray-600 dark:text-gray-400">{m.group}</code>
                      <Badge>{m.role}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* MFA Tab */}
      {activeTab === 'mfa' && (
        <Card className="divide-y divide-gray-200 dark:divide-gray-800">
          <div className="p-5">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">MFA Policy</h3>
            <p className="text-sm text-gray-500 mb-4">Control multi-factor authentication requirements for your organization.</p>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                <div>
                  <div className="font-medium text-gray-900 dark:text-gray-100">Enforcement Level</div>
                  <div className="text-sm text-gray-500 mt-0.5">Currently: <strong>Required</strong> (all users must enable MFA)</div>
                </div>
                <select className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm">
                  <option value="disabled">Disabled</option>
                  <option value="optional">Optional</option>
                  <option value="required" selected>Required</option>
                  <option value="required_with_grace">Required (Grace Period)</option>
                </select>
              </div>
              <div className="flex items-center justify-between p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                <div>
                  <div className="font-medium text-gray-900 dark:text-gray-100">Allowed Methods</div>
                  <div className="text-sm text-gray-500 mt-0.5">TOTP and WebAuthn/FIDO2 enabled</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="success">TOTP</Badge>
                  <Badge variant="success">WebAuthn</Badge>
                </div>
              </div>
              <div className="flex items-center justify-between p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                <div>
                  <div className="font-medium text-gray-900 dark:text-gray-100">Grace Period</div>
                  <div className="text-sm text-gray-500 mt-0.5">Not applicable (enforcement is immediate)</div>
                </div>
                <span className="text-sm text-gray-500">14 days (if enabled)</span>
              </div>
            </div>
          </div>
          <div className="p-5">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">User MFA Status</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800">
                <div className="text-2xl font-bold text-green-700 dark:text-green-400">5 / 6</div>
                <div className="text-sm text-green-600 dark:text-green-400">Users with MFA enabled</div>
              </div>
              <div className="p-4 rounded-lg bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800">
                <div className="text-2xl font-bold text-yellow-700 dark:text-yellow-400">1</div>
                <div className="text-sm text-yellow-600 dark:text-yellow-400">Users without MFA (action required)</div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* API Keys Tab */}
      {activeTab === 'api-keys' && (
        <Card className="divide-y divide-gray-200 dark:divide-gray-800">
          <div className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">API Keys</h3>
              <Button>+ Create Key</Button>
            </div>
            <div className="space-y-3">
              {[
                {name: 'CI/CD Pipeline', prefix: 'avk_prod_8f3a', created: '2026-05-20', lastUsed: '1 hour ago', status: 'active'},
                {name: 'Monitoring', prefix: 'avk_prod_2b7c', created: '2026-05-18', lastUsed: '5 min ago', status: 'active'},
                {name: 'Mobile App', prefix: 'avk_prod_9d1e', created: '2026-04-12', lastUsed: '2 days ago', status: 'active'},
                {name: 'Old Integration', prefix: 'avk_prod_4a6f', created: '2026-03-01', lastUsed: '45 days ago', status: 'revoked'},
              ].map(key => (
                <div key={key.prefix} className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-between">
                  <div>
                    <div className="font-medium text-gray-900 dark:text-gray-100">{key.name}</div>
                    <div className="text-xs text-gray-500 font-mono mt-0.5">{key.prefix}{'••••••••'}</div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right text-xs text-gray-500">
                      <div>Created: {key.created}</div>
                      <div>Last used: {key.lastUsed}</div>
                    </div>
                    <Badge variant={key.status === 'active' ? 'success' : 'danger'}>{key.status}</Badge>
                    {key.status === 'active' && <Button variant="ghost" size="sm">Revoke</Button>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Encryption Tab */}
      {activeTab === 'encryption' && (
        <Card className="divide-y divide-gray-200 dark:divide-gray-800">
          <div className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">Per-Tenant Encryption Keys</h3>
                <p className="text-sm text-gray-500 mt-1">HSM-backed envelope encryption. Each data type has its own DEK.</p>
              </div>
              <Button>Rotate Keys</Button>
            </div>
            <div className="space-y-2">
              {[
                {purpose: 'files', algorithm: 'AES-256-GCM', version: 3, created: '2026-04-01', status: 'active'},
                {purpose: 'emails', algorithm: 'AES-256-GCM', version: 2, created: '2026-03-15', status: 'active'},
                {purpose: 'documents', algorithm: 'AES-256-GCM', version: 2, created: '2026-03-15', status: 'active'},
                {purpose: 'database', algorithm: 'AES-256-GCM', version: 1, created: '2026-01-15', status: 'active'},
                {purpose: 'backups', algorithm: 'AES-256-GCM', version: 1, created: '2026-01-15', status: 'active'},
              ].map(key => (
                <div key={key.purpose} className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{key.purpose === 'files' ? '📁' : key.purpose === 'emails' ? '✉️' : key.purpose === 'documents' ? '📝' : key.purpose === 'database' ? '🗄️' : '💾'}</span>
                    <div>
                      <div className="font-medium text-sm text-gray-900 dark:text-gray-100 capitalize">{key.purpose}</div>
                      <div className="text-xs text-gray-500">{key.algorithm} · v{key.version} · Created {key.created}</div>
                    </div>
                  </div>
                  <Badge variant="success">{key.status}</Badge>
                </div>
              ))}
            </div>
          </div>
          <div className="p-5">
            <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">HSM Configuration</h4>
            <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800 text-xs text-gray-600 dark:text-gray-400 font-mono">
              Type: AWS KMS · Region: us-east-1 · Key ID: arn:aws:kms:us-east-1:123456789:key/abcd · Status: Connected
            </div>
          </div>
        </Card>
      )}
    </AdminLayout>
  );
}

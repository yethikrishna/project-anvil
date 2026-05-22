/**
 * Admin Org Settings Page
 * Organization settings: branding, features, data residency, custom domains, integrations.
 */
'use client';

import {useState} from 'react';
import {AdminLayout, PageHeader, Button, Badge, Card} from '../../components/admin-ui';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'general' | 'branding' | 'features' | 'data-residency' | 'domains' | 'integrations'>('general');

  return (
    <AdminLayout>
      <PageHeader title="Settings" description="Organization configuration and preferences." actions={
        <Button>Save Changes</Button>
      } />

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 w-fit flex-wrap">
        {([
          ['general', 'General'],
          ['branding', 'Branding'],
          ['features', 'Features'],
          ['data-residency', 'Data Residency'],
          ['domains', 'Custom Domains'],
          ['integrations', 'Integrations'],
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

      {/* General */}
      {activeTab === 'general' && (
        <Card className="p-5 space-y-6">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Organization Details</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Organization Name</label>
                <input type="text" defaultValue="Anvil Organization" className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Slug</label>
                <input type="text" defaultValue="anvil-org" className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-mono" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Region</label>
                <select className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm">
                  <option value="us-east-1">US East (Virginia)</option>
                  <option value="us-west-2">US West (Oregon)</option>
                  <option value="eu-west-1">EU West (Ireland)</option>
                  <option value="eu-central-1">EU Central (Frankfurt)</option>
                  <option value="ap-south-1">AP South (Mumbai)</option>
                  <option value="ap-northeast-1">AP Northeast (Tokyo)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Plan</label>
                <div className="flex items-center gap-2">
                  <Badge variant="info">Business</Badge>
                  <Button variant="ghost" size="sm">Change</Button>
                </div>
              </div>
            </div>
          </div>
          <div className="border-t border-gray-200 dark:border-gray-800 pt-6">
            <h3 className="font-semibold text-red-600 dark:text-red-400 mb-2">Danger Zone</h3>
            <p className="text-sm text-gray-500 mb-4">These actions are permanent and cannot be undone.</p>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-4 rounded-lg border border-red-200 dark:border-red-800">
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">Delete Organization</div>
                  <div className="text-xs text-gray-500">Permanently delete all data, users, and settings.</div>
                </div>
                <Button variant="danger" size="sm">Delete</Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Data Residency */}
      {activeTab === 'data-residency' && (
        <Card className="p-5">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Data Residency Policy</h3>
          <p className="text-sm text-gray-500 mb-6">Control where your organization data is stored and processed.</p>
          <div className="space-y-4">
            <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="font-medium text-gray-900 dark:text-gray-100">Primary Region</div>
                  <div className="text-sm text-gray-500">All data is stored and processed here.</div>
                </div>
                <Badge variant="info">US East (Virginia)</Badge>
              </div>
            </div>
            <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="font-medium text-gray-900 dark:text-gray-100">Jurisdiction</div>
                  <div className="text-sm text-gray-500">Determines which regions are valid.</div>
                </div>
                <Badge>US</Badge>
              </div>
            </div>
            <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="font-medium text-gray-900 dark:text-gray-100 mb-3">Restricted Data Types</div>
              <div className="flex items-center gap-2 flex-wrap">
                {['PII', 'Health (HIPAA)', 'Financial'].map(t => (
                  <Badge key={t} variant="warning">{t}</Badge>
                ))}
                <Button variant="ghost" size="sm">+ Add</Button>
              </div>
            </div>
            <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-gray-900 dark:text-gray-100">Cross-Region Reads</div>
                  <div className="text-sm text-gray-500">Allow reading non-restricted data from other regions.</div>
                </div>
                <Badge variant="danger">Disabled</Badge>
              </div>
            </div>
            <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-gray-900 dark:text-gray-100">Backup Regions</div>
                  <div className="text-sm text-gray-500">Disaster recovery copies (same jurisdiction).</div>
                </div>
                <Badge>US West (Oregon)</Badge>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Custom Domains */}
      {activeTab === 'domains' && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Custom Domains</h3>
              <p className="text-sm text-gray-500 mt-1">Use your own domain to access Anvil.</p>
            </div>
            <Button>+ Add Domain</Button>
          </div>
          <div className="space-y-3">
            <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <div>
                <div className="font-medium text-gray-900 dark:text-gray-100">anvil.company.com</div>
                <div className="text-xs text-gray-500 mt-0.5">CNAME → anvil.dev · Provisioned May 10, 2026</div>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant="success">Verified</Badge>
                <Badge variant="success">SSL Active</Badge>
                <Button variant="ghost" size="sm">Remove</Button>
              </div>
            </div>
            <div className="p-4 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">DNS Configuration</h4>
              <code className="block text-xs font-mono text-gray-600 dark:text-gray-400">
                anvil.company.com → CNAME → apps.anvil.dev
              </code>
              <code className="block text-xs font-mono text-gray-600 dark:text-gray-400 mt-1">
                _anvil-verify.anvil.company.com → TXT → av_verify_a1b2c3d4
              </code>
            </div>
          </div>
        </Card>
      )}

      {/* Features */}
      {activeTab === 'features' && (
        <Card className="p-5">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Feature Flags</h3>
          <div className="space-y-3">
            {[
              {name: 'SSO (SAML 2.0)', enabled: true, plan: 'enterprise'},
              {name: 'LDAP / Active Directory', enabled: true, plan: 'enterprise'},
              {name: 'MFA Enforcement', enabled: true, plan: 'business'},
              {name: 'Audit Logging', enabled: true, plan: 'business'},
              {name: 'End-to-End Encryption', enabled: false, plan: 'enterprise'},
              {name: 'AI Copilot', enabled: true, plan: 'business'},
              {name: 'Plugin Marketplace', enabled: true, plan: 'business'},
              {name: 'API Access', enabled: true, plan: 'starter'},
              {name: 'Custom Domains', enabled: true, plan: 'business'},
            ].map(f => (
              <div key={f.name} className="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{f.name}</div>
                  <div className="text-xs text-gray-500">Requires: {f.plan} plan</div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={f.enabled ? 'success' : 'default'}>{f.enabled ? 'Enabled' : 'Disabled'}</Badge>
                  <div className={`w-10 h-6 rounded-full transition-colors cursor-pointer ${f.enabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'}`}>
                    <div className={`w-4 h-4 rounded-full bg-white mt-1 transition-transform ${f.enabled ? 'translate-x-5' : 'translate-x-1'}`} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Branding */}
      {activeTab === 'branding' && (
        <Card className="p-5">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Branding</h3>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Organization Name (display)</label>
              <input type="text" defaultValue="Anvil" className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Primary Color</label>
              <div className="flex items-center gap-2">
                <input type="color" defaultValue="#2563EB" className="w-10 h-10 rounded border-0 cursor-pointer" />
                <input type="text" defaultValue="#2563EB" className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-mono" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Logo</label>
              <div className="p-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-center">
                <span className="text-2xl">🔨</span>
                <p className="text-xs text-gray-500 mt-1">Click or drag to upload (SVG, PNG)</p>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Login Page Message</label>
              <textarea rows={3} defaultValue="Welcome to Anvil. Sign in to continue." className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm" />
            </div>
          </div>
          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-800">
            <Button>Save Branding</Button>
          </div>
        </Card>
      )}

      {/* Integrations */}
      {activeTab === 'integrations' && (
        <Card className="p-5">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Connected Integrations</h3>
          <div className="space-y-3">
            {[
              {name: 'Stripe', desc: 'Payment processing', status: 'connected', icon: '💳'},
              {name: 'Google Workspace', desc: 'Migration & calendar sync', status: 'connected', icon: '📧'},
              {name: 'Slack', desc: 'Notifications & alerts', status: 'available', icon: '💬'},
              {name: 'Zapier', desc: 'Workflow automation', status: 'available', icon: '⚡'},
              {name: 'Webhooks', desc: 'Custom event notifications', status: 'connected', icon: '🔗'},
            ].map(int => (
              <div key={int.name} className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xl">{int.icon}</span>
                  <div>
                    <div className="font-medium text-gray-900 dark:text-gray-100">{int.name}</div>
                    <div className="text-xs text-gray-500">{int.desc}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {int.status === 'connected' && <Badge variant="success">Connected</Badge>}
                  <Button variant={int.status === 'connected' ? 'ghost' : 'secondary'} size="sm">
                    {int.status === 'connected' ? 'Configure' : 'Connect'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </AdminLayout>
  );
}

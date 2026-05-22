/**
 * Admin Billing Page
 * Subscription management, usage metering, invoices, and plan details.
 */
'use client';

import {useState} from 'react';
import {AdminLayout, PageHeader, Button, Badge, Card, StatCard} from '../../components/admin-ui';

const PLANS: Record<string, {name: string; price: string; period: string}> = {
  free: {name: 'Free', price: '$0', period: 'forever'},
  starter: {name: 'Starter', price: '$9', period: '/user/mo'},
  business: {name: 'Business', price: '$19', period: '/user/mo'},
  enterprise: {name: 'Enterprise', price: 'Custom', period: ''},
};

export default function BillingPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'usage' | 'invoices'>('overview');

  return (
    <AdminLayout>
      <PageHeader title="Billing" description="Subscription, usage, and payment management." actions={
        <div className="flex items-center gap-3">
          <Button variant="secondary">Manage in Stripe</Button>
          <Button>Change Plan</Button>
        </div>
      } />

      {/* Plan Banner */}
      <Card className="p-5 mb-6 bg-gradient-to-r from-blue-600 to-indigo-600 border-none text-white">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-blue-100">Current Plan</div>
            <div className="text-2xl font-bold mt-1">Business · 25 seats</div>
            <div className="text-blue-100 text-sm mt-1">
              $475/month · Billed monthly · Renews June 15, 2026
            </div>
          </div>
          <div className="text-right">
            <Badge variant="success">Active</Badge>
            <div className="text-sm text-blue-100 mt-2">14 days left in current period</div>
          </div>
        </div>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Monthly Cost" value="$475" icon="💳" />
        <StatCard label="Active Seats" value="23/25" change="2 unused" icon="👥" />
        <StatCard label="AI Calls Used" value="12,847" change="of 25,000 limit" icon="🤖" />
        <StatCard label="Storage" value="248 GB" change="of 500 GB" icon="💾" />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 w-fit">
        {(['overview', 'usage', 'invoices'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === tab
                ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab === 'overview' ? 'Overview' : tab === 'usage' ? 'Usage Metering' : 'Invoices'}
          </button>
        ))}
      </div>

      {/* Usage Tab */}
      {activeTab === 'usage' && (
        <div className="space-y-4">
          {/* Usage Bars */}
          <Card className="p-5">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Current Period Usage (May 2026)</h3>
            <div className="space-y-4">
              {[
                {label: 'API Calls', used: 45230, limit: 100000, unit: ''},
                {label: 'AI Calls', used: 12847, limit: 25000, unit: ''},
                {label: 'Storage', used: 248, limit: 500, unit: ' GB'},
                {label: 'Active Users', used: 23, limit: 25, unit: ''},
                {label: 'Emails Sent', used: 3842, limit: 10000, unit: ''},
                {label: 'Documents', used: 1247, limit: 0, unit: ''},
                {label: 'Searches', used: 8923, limit: 0, unit: ''},
                {label: 'Bandwidth', used: 47, limit: 0, unit: ' GB'},
              ].map(item => {
                const pct = item.limit > 0 ? Math.min(100, (item.used / item.limit) * 100) : 0;
                const color = pct > 90 ? 'bg-red-500' : pct > 75 ? 'bg-yellow-500' : 'bg-blue-500';
                return (
                  <div key={item.label}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-gray-700 dark:text-gray-300">{item.label}</span>
                      <span className="text-gray-500">
                        {item.used.toLocaleString()}{item.unit}
                        {item.limit > 0 && ` / ${item.limit.toLocaleString()}${item.unit}`}
                      </span>
                    </div>
                    {item.limit > 0 && (
                      <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${color} transition-all`} style={{width: `${pct}%`}} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Usage by User */}
          <Card className="p-5">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Top Users by API Usage</h3>
            <div className="space-y-2">
              {[
                {name: 'Sarah Chen', calls: 12450, aiCalls: 3210},
                {name: 'Indu', calls: 9823, aiCalls: 4102},
                {name: 'Arjun Patel', calls: 7654, aiCalls: 2847},
                {name: 'David Kim', calls: 5432, aiCalls: 1893},
                {name: 'Mike Johnson', calls: 2341, aiCalls: 795},
              ].map((u, i) => (
                <div key={u.name} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-500 w-6">{i + 1}.</span>
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{u.name}</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <span>{u.calls.toLocaleString()} API calls</span>
                    <span>{u.aiCalls.toLocaleString()} AI calls</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Invoices Tab */}
      {activeTab === 'invoices' && (
        <Card>
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {[
              {id: 'INV-2026-05', date: 'May 1, 2026', amount: '$475.00', status: 'paid', plan: 'Business · 25 seats'},
              {id: 'INV-2026-04', date: 'Apr 1, 2026', amount: '$418.00', status: 'paid', plan: 'Business · 22 seats'},
              {id: 'INV-2026-03', date: 'Mar 1, 2026', amount: '$418.00', status: 'paid', plan: 'Business · 22 seats'},
              {id: 'INV-2026-02', date: 'Feb 1, 2026', amount: '$171.00', status: 'paid', plan: 'Starter · 19 seats'},
              {id: 'INV-2026-01', date: 'Jan 1, 2026', amount: '$171.00', status: 'paid', plan: 'Starter · 19 seats'},
            ].map(inv => (
              <div key={inv.id} className="p-4 flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm text-gray-900 dark:text-gray-100">{inv.id}</div>
                  <div className="text-xs text-gray-500">{inv.date} · {inv.plan}</div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-medium text-gray-900 dark:text-gray-100">{inv.amount}</span>
                  <Badge variant={inv.status === 'paid' ? 'success' : 'warning'}>{inv.status}</Badge>
                  <Button variant="ghost" size="sm">Download</Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-2 gap-4">
          <Card className="p-5">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Payment Method</h3>
            <div className="flex items-center gap-3">
              <div className="px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded text-xs font-mono">Visa •••• 4242</div>
              <div className="text-sm text-gray-500">Expires 12/2027</div>
            </div>
            <Button variant="ghost" size="sm" className="mt-3">Update Payment</Button>
          </Card>
          <Card className="p-5">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Billing Contact</h3>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              <div>indu@anvil.dev</div>
              <div>Anvil Organization</div>
            </div>
            <Button variant="ghost" size="sm" className="mt-3">Update Contact</Button>
          </Card>
        </div>
      )}
    </AdminLayout>
  );
}

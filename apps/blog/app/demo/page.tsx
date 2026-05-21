'use client';

import {useState} from 'react';

export default function DemoSignupPage() {
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    company: '',
    teamSize: '',
    useCase: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // In production: POST to /api/demo-signup
    console.log('Demo signup:', form);
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 flex items-center justify-center py-12 px-6">
      <div className="max-w-lg w-full">
        <div className="text-center mb-8">
          <span className="text-4xl">🔨</span>
          <h1 className="mt-4 text-3xl font-bold text-gray-900 dark:text-gray-100">
            {submitted ? 'You\'re in!' : 'Try Anvil Free'}
          </h1>
          <p className="mt-2 text-gray-500">
            {submitted
              ? 'Check your email for your Anvil instance credentials.'
              : '14-day free trial. No credit card required. Self-host or cloud.'}
          </p>
        </div>

        {submitted ? (
          <div className="text-center space-y-4">
            <div className="p-6 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
              <span className="text-4xl">✉️</span>
              <h3 className="mt-2 font-semibold text-green-800 dark:text-green-200">Check your email</h3>
              <p className="mt-1 text-sm text-green-600 dark:text-green-400">
                We sent your instance details to <strong>{form.email}</strong>
              </p>
            </div>
            <div className="text-sm text-gray-500">
              <p>Your Anvil instance will be ready in ~2 minutes.</p>
              <p className="mt-2">Prefer self-hosting? Run:</p>
              <code className="block mt-2 p-3 bg-gray-100 dark:bg-gray-800 rounded-lg text-xs font-mono">
                curl -fsSL https://get.anvil.dev | bash
              </code>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Full Name</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={e => setForm({...form, name: e.target.value})}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Jane Smith"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Work Email</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={e => setForm({...form, email: e.target.value})}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="jane@company.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Company</label>
              <input
                type="text"
                value={form.company}
                onChange={e => setForm({...form, company: e.target.value})}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Acme Corp"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Team Size</label>
              <select
                value={form.teamSize}
                onChange={e => setForm({...form, teamSize: e.target.value})}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select team size</option>
                <option value="1-5">1–5</option>
                <option value="6-25">6–25</option>
                <option value="26-100">26–100</option>
                <option value="100+">100+</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                What are you looking for? <span className="text-gray-400">(optional)</span>
              </label>
              <textarea
                value={form.useCase}
                onChange={e => setForm({...form, useCase: e.target.value})}
                rows={3}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Migrating from Google Workspace, need HIPAA compliance..."
              />
            </div>
            <button
              type="submit"
              className="w-full px-4 py-3 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 text-sm"
            >
              Start Free Trial
            </button>
            <p className="text-xs text-center text-gray-400">
              By signing up, you agree to our Terms of Service and Privacy Policy.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

'use client';

import {useState} from 'react';
import Link from 'next/link';

interface FormState {
  name: string;
  email: string;
  company: string;
  teamSize: string;
  useCase: string;
  plan: 'starter' | 'business' | 'enterprise';
  deployType: 'cloud' | 'self-hosted';
}

interface SignupResult {
  success: boolean;
  message: string;
  trialId?: string;
  nextSteps?: string[];
}

export default function DemoSignupPage() {
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<SignupResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState<FormState>({
    name: '',
    email: '',
    company: '',
    teamSize: '',
    useCase: '',
    plan: 'starter',
    deployType: 'cloud',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const resp = await fetch('/api/demo-signup', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(form),
      });

      const data: SignupResult = await resp.json();

      if (!resp.ok || !data.success) {
        setError(data.message ?? 'Something went wrong. Please try again.');
        return;
      }

      setResult(data);
      setSubmitted(true);
    } catch {
      setError('Network error. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 flex items-center justify-center py-12 px-6">
      <div className="max-w-lg w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-700 text-sm mb-6">
            ← Back to home
          </Link>
          <div className="text-4xl">🔨</div>
          <h1 className="mt-4 text-3xl font-bold text-gray-900 dark:text-gray-100">
            {submitted ? (result?.message ?? 'You\'re in!') : 'Try Anvil Free'}
          </h1>
          <p className="mt-2 text-gray-500">
            {submitted
              ? 'Check your email — credentials arrive in ~5 minutes.'
              : '14-day free trial. No credit card required.'}
          </p>
        </div>

        {/* Success State */}
        {submitted && result ? (
          <div className="space-y-5">
            <div className="p-6 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-center">
              <span className="text-4xl">✉️</span>
              <h3 className="mt-3 font-semibold text-green-800 dark:text-green-200">
                {form.plan === 'enterprise' ? 'Request received!' : 'Check your email'}
              </h3>
              <p className="mt-1 text-sm text-green-600 dark:text-green-400">
                We sent details to <strong>{form.email}</strong>
              </p>
              {result.trialId && (
                <p className="mt-2 text-xs text-gray-400">Trial ID: {result.trialId}</p>
              )}
            </div>

            {result.nextSteps && (
              <div className="p-5 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Next steps</h4>
                <ol className="space-y-2">
                  {result.nextSteps.map((step, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-400">
                      <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {form.deployType === 'self-hosted' && (
              <div className="p-4 rounded-xl bg-gray-900 border border-gray-800">
                <p className="text-xs text-gray-400 font-mono mb-2"># Quick install</p>
                <p className="text-green-400 font-mono text-sm break-all select-all">
                  {'curl -fsSL https://get.anvil.dev | bash'}
                </p>
              </div>
            )}
          </div>
        ) : (
          /* Signup Form */
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Deploy type toggle */}
            <div className="flex items-center gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
              {(['cloud', 'self-hosted'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm(f => ({...f, deployType: t}))}
                  className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                    form.deployType === t
                      ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {t === 'cloud' ? '☁️ Cloud Trial' : '🖥️ Self-Hosted'}
                </button>
              ))}
            </div>

            {/* Plan */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Plan</label>
              <select
                value={form.plan}
                onChange={e => setForm(f => ({...f, plan: e.target.value as FormState['plan']}))}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value="starter">Starter — $9/user/mo (up to 25 users)</option>
                <option value="business">Business — $19/user/mo (up to 100 users)</option>
                <option value="enterprise">Enterprise — custom pricing (unlimited)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Full Name</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={e => setForm(f => ({...f, name: e.target.value}))}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-blue-500"
                placeholder="Jane Smith"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Work Email</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={e => setForm(f => ({...f, email: e.target.value}))}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-blue-500"
                placeholder="jane@company.com"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Company</label>
                <input
                  type="text"
                  value={form.company}
                  onChange={e => setForm(f => ({...f, company: e.target.value}))}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-blue-500"
                  placeholder="Acme Corp"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Team Size</label>
                <select
                  value={form.teamSize}
                  onChange={e => setForm(f => ({...f, teamSize: e.target.value}))}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select…</option>
                  <option value="1-5">1–5</option>
                  <option value="6-25">6–25</option>
                  <option value="26-100">26–100</option>
                  <option value="100+">100+</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                What are you looking for? <span className="text-gray-400">(optional)</span>
              </label>
              <textarea
                value={form.useCase}
                onChange={e => setForm(f => ({...f, useCase: e.target.value}))}
                rows={3}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-blue-500 resize-none"
                placeholder="Migrating from Google Workspace, HIPAA compliance, replacing Slack..."
              />
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-600 dark:text-red-400">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-3 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 text-sm disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Setting up your trial…' : form.plan === 'enterprise' ? 'Contact Sales' : 'Start 14-Day Free Trial'}
            </button>

            <p className="text-xs text-center text-gray-400">
              By signing up, you agree to our{' '}
              <a href="#" className="underline hover:text-gray-600">Terms of Service</a>
              {' '}and{' '}
              <a href="#" className="underline hover:text-gray-600">Privacy Policy</a>.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

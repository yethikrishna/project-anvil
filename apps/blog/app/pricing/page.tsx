import Link from 'next/link';

const plans = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'For individuals and small teams exploring Anvil.',
    features: [
      'Up to 5 users',
      '5 GB storage',
      'Docs, Drive, Search apps',
      'Basic email client',
      'Community support (GitHub)',
      'Self-hosted option',
    ],
    cta: 'Get Started Free',
    ctaLink: '/demo',
    highlighted: false,
  },
  {
    id: 'starter',
    name: 'Starter',
    price: '$9',
    period: '/user/mo',
    description: 'For growing teams that need all the apps.',
    features: [
      'Up to 25 users',
      '50 GB storage per user',
      'All Anvil apps',
      'Calendar & Tasks',
      'Email support (< 24h)',
      'API access (100 req/min)',
      'Google Workspace migration toolkit',
      'Custom branding',
    ],
    cta: 'Start 14-Day Trial',
    ctaLink: '/demo',
    highlighted: false,
  },
  {
    id: 'business',
    name: 'Business',
    price: '$19',
    period: '/user/mo',
    description: 'For teams needing advanced features & AI.',
    features: [
      'Up to 100 users',
      '500 GB storage per user',
      'Everything in Starter',
      'AI Copilot (GPT-4 class)',
      'Plugin marketplace',
      'Admin console & audit logs',
      'API access (1,000 req/min)',
      'Priority support (< 4h)',
      'Custom branding & theming',
      'Advanced sharing & permissions',
    ],
    cta: 'Start 14-Day Trial',
    ctaLink: '/demo',
    highlighted: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    description: 'For orgs with compliance, security, and scale needs.',
    features: [
      'Unlimited users & storage',
      'Everything in Business',
      'SSO: SAML 2.0 + OIDC',
      'LDAP / Active Directory sync',
      'End-to-end encryption (E2EE)',
      'HSM-backed per-tenant keys',
      'HIPAA / GDPR / SOC 2 configs',
      'Data residency controls',
      'Dedicated support engineer',
      'On-premise or private cloud',
      'Custom SLA (99.99%)',
      'BAA available',
    ],
    cta: 'Contact Sales',
    ctaLink: 'mailto:enterprise@anvil.dev',
    highlighted: false,
  },
];

const faqs = [
  {
    q: 'Can I self-host Anvil for free?',
    a: 'Yes. The self-hosted version (AGPL-3.0) is free with no user limits. Cloud features like AI Copilot, managed backups, and priority support require a paid plan.',
  },
  {
    q: 'What happens when my trial ends?',
    a: 'Your workspace becomes read-only. No data is deleted — you can downgrade to Free or upgrade to keep everything working.',
  },
  {
    q: 'Do you offer discounts for nonprofits or education?',
    a: 'Yes — 50% off all paid plans for verified nonprofits and educational institutions. Contact sales@anvil.dev.',
  },
  {
    q: 'How does billing work?',
    a: 'Per active user per month. You\'re only billed for users who log in during the billing period. Add or remove seats anytime — proration is automatic via Stripe.',
  },
  {
    q: 'Is there annual billing?',
    a: 'Yes. Annual billing saves 20%. Contact sales@anvil.dev for a custom quote on Business or Enterprise annual plans.',
  },
  {
    q: 'Can I migrate from Google Workspace?',
    a: 'Yes — Anvil includes a full migration toolkit: Gmail → Stalwart IMAP, Google Docs → Anvil Docs, Google Drive → MinIO, Google Calendar → Anvil Calendar. Resumable and incremental.',
  },
  {
    q: 'How does data residency work?',
    a: 'Enterprise plans let you pin all PII to a specific region (US, EU, APAC). Data never leaves the chosen jurisdiction. HIPAA deployments enforce US-only processing.',
  },
  {
    q: 'What compliance certifications do you support?',
    a: 'We provide Docker Compose configs pre-configured for HIPAA, GDPR, and SOC 2 Type II compliance. Enterprise plans include BAA signing, audit log exports, and dedicated compliance support.',
  },
];

const addons = [
  { name: 'Extra Storage', price: '$0.10', unit: '/GB/mo', description: 'Beyond plan limits' },
  { name: 'AI Copilot Boost', price: '$5', unit: '/user/mo', description: '10× AI usage allowance' },
  { name: 'Custom Domain', price: '$10', unit: '/domain/mo', description: 'Business+ plans' },
  { name: 'Priority Support', price: '$99', unit: '/mo', description: 'Dedicated Slack channel' },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      {/* Nav */}
      <nav className="border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🔨</span>
            <span className="text-xl font-bold text-gray-900 dark:text-gray-100">Anvil</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-gray-600 dark:text-gray-400">
            <Link href="/landing" className="hover:text-gray-900">Features</Link>
            <Link href="/pricing" className="text-gray-900 dark:text-gray-100 font-medium">Pricing</Link>
            <Link href="/demo" className="hover:text-gray-900">Demo</Link>
            <a href="https://github.com/anvil-org/anvil" className="hover:text-gray-900">GitHub</a>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/demo" className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400">Sign in</Link>
            <Link href="/demo" className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 dark:bg-white dark:text-gray-900">
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Header */}
      <section className="py-16 text-center">
        <div className="max-w-3xl mx-auto px-6">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-gray-100">
            Simple pricing for every team
          </h1>
          <p className="mt-4 text-lg text-gray-500">
            Start free. Scale without surprises. Cancel anytime.
          </p>
          <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-green-50 dark:bg-green-900/20 px-4 py-2 text-sm text-green-700 dark:text-green-300">
            <span>✓</span> 14-day free trial &middot; No credit card &middot; Cancel anytime
          </div>
        </div>
      </section>

      {/* Plans */}
      <section className="pb-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-4 gap-6">
            {plans.map(plan => (
              <div
                key={plan.id}
                className={`relative flex flex-col p-6 rounded-2xl border transition-shadow ${
                  plan.highlighted
                    ? 'border-blue-500 bg-white dark:bg-gray-800 shadow-xl shadow-blue-500/10'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:shadow-lg'
                }`}
              >
                {plan.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-blue-600 text-white text-xs font-semibold rounded-full">
                    Most Popular
                  </div>
                )}
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{plan.name}</h3>
                <div className="mt-3">
                  <span className="text-4xl font-bold text-gray-900 dark:text-gray-100">{plan.price}</span>
                  <span className="text-sm text-gray-500 ml-1">{plan.period}</span>
                </div>
                <p className="mt-2 text-sm text-gray-500">{plan.description}</p>
                <ul className="mt-5 flex-1 space-y-2.5">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <span className="text-green-500 mt-0.5 shrink-0">✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={plan.ctaLink}
                  className={`mt-6 block text-center px-4 py-3 rounded-lg text-sm font-semibold transition-colors ${
                    plan.highlighted
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Add-ons */}
      <section className="py-16 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 text-center mb-8">Add-ons</h2>
          <div className="grid md:grid-cols-4 gap-4">
            {addons.map(addon => (
              <div key={addon.name} className="p-5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100">{addon.name}</h4>
                <div className="mt-1">
                  <span className="text-xl font-bold text-gray-900 dark:text-gray-100">{addon.price}</span>
                  <span className="text-sm text-gray-500 ml-1">{addon.unit}</span>
                </div>
                <p className="mt-1 text-xs text-gray-500">{addon.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Self-host callout */}
      <section className="py-16">
        <div className="max-w-4xl mx-auto px-6">
          <div className="p-8 rounded-2xl bg-gray-900 dark:bg-gray-800 text-white text-center">
            <h2 className="text-2xl font-bold">Prefer self-hosting?</h2>
            <p className="mt-2 text-gray-300">
              Deploy on your own infrastructure with one command. Free forever, no license key needed.
            </p>
            <div className="mt-6 inline-block bg-gray-800 dark:bg-gray-700 px-6 py-3 rounded-lg font-mono text-sm">
              curl -fsSL https://get.anvil.dev | bash
            </div>
            <div className="mt-4 text-sm text-gray-400">
              Works on any Linux server with Docker. Kubernetes Helm chart also available.
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 text-center mb-8">
            Frequently asked questions
          </h2>
          <div className="space-y-4">
            {faqs.map((faq, i) => (
              <details key={i} className="group p-5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                <summary className="flex items-center justify-between cursor-pointer text-gray-900 dark:text-gray-100 font-medium">
                  {faq.q}
                  <span className="ml-2 text-gray-400 group-open:rotate-180 transition-transform">▾</span>
                </summary>
                <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">{faq.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            Ready to get started?
          </h2>
          <p className="mt-3 text-gray-500">Start your free trial. No credit card required.</p>
          <div className="mt-6 flex items-center justify-center gap-4">
            <Link href="/demo" className="px-6 py-3 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700">
              Start Free Trial
            </Link>
            <a href="mailto:enterprise@anvil.dev" className="px-6 py-3 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-900">
              Contact Sales
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 border-t border-gray-200 dark:border-gray-800 text-center text-sm text-gray-400">
        © {new Date().getFullYear()} Project Anvil. Open source under Apache 2.0.
      </footer>
    </div>
  );
}

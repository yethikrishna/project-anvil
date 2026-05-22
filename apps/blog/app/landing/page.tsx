import Link from 'next/link';

// ── Data ──

const plans = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'For individuals and small teams getting started.',
    features: [
      'Up to 5 users',
      '5 GB storage',
      'Docs, Drive, Search',
      'Basic email client',
      'Community support',
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
    period: '/user/month',
    description: 'For growing teams that need all the apps.',
    features: [
      'Up to 25 users',
      '50 GB storage per user',
      'All Anvil apps',
      'Calendar & Tasks',
      'Email support',
      'API access (100 req/min)',
      'Google Workspace migration',
    ],
    cta: 'Start Free Trial',
    ctaLink: '/demo',
    highlighted: false,
  },
  {
    id: 'business',
    name: 'Business',
    price: '$19',
    period: '/user/month',
    description: 'For teams that need advanced features & AI.',
    features: [
      'Up to 100 users',
      '500 GB storage per user',
      'All features',
      'AI Copilot',
      'Plugin marketplace',
      'Admin console & audit logs',
      'API access (1000 req/min)',
      'Priority support',
      'Custom branding',
    ],
    cta: 'Start Free Trial',
    ctaLink: '/demo',
    highlighted: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    description: 'For organizations with compliance needs.',
    features: [
      'Unlimited users',
      'Unlimited storage',
      'Everything in Business',
      'SSO (SAML 2.0 / OIDC)',
      'LDAP / Active Directory',
      'End-to-end encryption',
      'HSM-backed key management',
      'HIPAA / GDPR / SOC 2 compliance',
      'Data residency controls',
      'Dedicated support',
      'On-premise option',
    ],
    cta: 'Contact Sales',
    ctaLink: 'mailto:enterprise@anvil.dev',
    highlighted: false,
  },
];

const features = [
  {
    icon: '📝',
    title: 'Anvil Docs',
    description: 'Real-time collaborative editor with Yjs CRDT. Rich text, headings, images, code blocks, and more. Export to PDF/DOCX.',
    tags: ['Real-time', 'CRDT', 'Markdown'],
  },
  {
    icon: '📁',
    title: 'Anvil Drive',
    description: 'S3-compatible file storage with hierarchical folders, sharing links, permissions, and File System Access API integration.',
    tags: ['S3', 'Versioning', 'Sharing'],
  },
  {
    icon: '✉️',
    title: 'Anvil Mail',
    description: 'Full email client powered by Stalwart mail server. JMAP protocol, thread view, labels, and rich compose.',
    tags: ['JMAP', 'IMAP', 'SMTP'],
  },
  {
    icon: '📅',
    title: 'Anvil Calendar',
    description: 'Calendar with event management, recurring events, iCal import/export, and shared calendars.',
    tags: ['iCal', 'Recurring', 'Sharing'],
  },
  {
    icon: '🔍',
    title: 'Anvil Search',
    description: 'Hybrid BM25 + vector search powered by Meilisearch. Semantic search with MiniLM embeddings.',
    tags: ['Hybrid', 'AI', 'Vector'],
  },
  {
    icon: '🗺️',
    title: 'Anvil Maps',
    description: 'MapLibre GL JS with OpenMapTiles. Geocoding, routing via OSRM, and offline-capable vector maps.',
    tags: ['MapLibre', 'OSRM', 'Offline'],
  },
  {
    icon: '🛡️',
    title: 'Enterprise Security',
    description: 'SAML 2.0 SSO, LDAP/AD sync, TOTP + WebAuthn MFA, per-tenant encryption keys, and full audit logging.',
    tags: ['SAML', 'MFA', 'HSM'],
  },
  {
    icon: '🌐',
    title: 'Data Residency',
    description: 'Control where your data lives. Per-organization region routing with GDPR, HIPAA, and SOC 2 compliance configs.',
    tags: ['GDPR', 'HIPAA', 'Multi-region'],
  },
  {
    icon: '🤖',
    title: 'AI Copilot',
    description: 'Built-in AI assistant for document writing, email drafting, search, and productivity. Per-org usage metering.',
    tags: ['GPT', 'Automation', 'Usage tracking'],
  },
];

const testimonials = [
  {name: 'Sarah Chen', role: 'CTO, TechStart Inc.', quote: 'We migrated 200 users from Google Workspace in a weekend. Anvil\'s migration toolkit is incredible.'},
  {name: 'Arjun Patel', role: 'VP Engineering, DataCorp', quote: 'Finally, a self-hosted suite that doesn\'t sacrifice UX. Our compliance team loves the audit logs.'},
  {name: 'Maria Garcia', role: 'IT Director, HealthFirst', quote: 'HIPAA-compliant and self-hosted. That\'s all we needed to hear. The deployment was smooth.'},
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      {/* Navigation */}
      <nav className="border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🔨</span>
            <span className="text-xl font-bold text-gray-900 dark:text-gray-100">Anvil</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-gray-600 dark:text-gray-400">
            <Link href="/features" className="hover:text-gray-900">Features</Link>
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

      {/* Hero */}
      <section className="py-20 text-center">
        <div className="max-w-4xl mx-auto px-6">
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
            Your workspace,<br />
            <span className="text-blue-600 dark:text-blue-400">your rules.</span>
          </h1>
          <p className="mt-6 text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Open source Google Workspace alternative. Self-hosted, privacy-first, and enterprise-ready.
            Docs, Drive, Mail, Calendar, Search, Maps — all in one.
          </p>
          <div className="mt-8 flex items-center justify-center gap-4">
            <Link href="/demo" className="px-6 py-3 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 text-lg">
              Start Free Trial
            </Link>
            <Link href="#pricing" className="px-6 py-3 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-900 text-lg">
              View Pricing
            </Link>
          </div>
          <p className="mt-4 text-sm text-gray-500">
            No credit card required · 14-day free trial · Self-host or cloud
          </p>
        </div>
      </section>

      {/* Trusted by */}
      <section className="py-12 border-y border-gray-100 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-6">
          <p className="text-center text-sm text-gray-400 mb-8">Trusted by teams at</p>
          <div className="flex items-center justify-center gap-12 text-gray-300 dark:text-gray-600">
            {['TechStart', 'DataCorp', 'HealthFirst', 'EduGlobal', 'FinanceHub'].map(name => (
              <span key={name} className="text-lg font-semibold">{name}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Everything you need</h2>
            <p className="mt-3 text-gray-500">A complete productivity suite, built for the modern web.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {features.map(feature => (
              <div key={feature.title} className="p-6 rounded-xl border border-gray-200 dark:border-gray-800 hover:border-blue-300 dark:hover:border-blue-700 transition-colors">
                <span className="text-3xl">{feature.icon}</span>
                <h3 className="mt-3 text-lg font-semibold text-gray-900 dark:text-gray-100">{feature.title}</h3>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{feature.description}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {feature.tags.map(tag => (
                    <span key={tag} className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded-full">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Simple, transparent pricing</h2>
            <p className="mt-3 text-gray-500">Start free, scale as you grow. No surprises.</p>
          </div>
          <div className="grid md:grid-cols-4 gap-6">
            {plans.map(plan => (
              <div key={plan.id} className={`relative p-6 rounded-xl border ${
                plan.highlighted
                  ? 'border-blue-500 bg-white dark:bg-gray-800 shadow-lg shadow-blue-500/10'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
              }`}>
                {plan.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-blue-600 text-white text-xs font-medium rounded-full">
                    Most Popular
                  </div>
                )}
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{plan.name}</h3>
                <div className="mt-3">
                  <span className="text-4xl font-bold text-gray-900 dark:text-gray-100">{plan.price}</span>
                  <span className="text-gray-500">{plan.period}</span>
                </div>
                <p className="mt-2 text-sm text-gray-500">{plan.description}</p>
                <ul className="mt-4 space-y-2">
                  {plan.features.map(feature => (
                    <li key={feature} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <span className="text-green-500 mt-0.5">✓</span>
                      {feature}
                    </li>
                  ))}
                </ul>
                <Link
                  href={plan.ctaLink}
                  className={`mt-6 block text-center px-4 py-2.5 rounded-lg text-sm font-medium ${
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

      {/* Testimonials */}
      <section className="py-20">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-center text-gray-900 dark:text-gray-100 mb-12">What teams are saying</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map(t => (
              <div key={t.name} className="p-6 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
                <p className="text-gray-700 dark:text-gray-300 italic">"{t.quote}"</p>
                <div className="mt-4">
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{t.name}</div>
                  <div className="text-xs text-gray-500">{t.role}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Self-Hosted Install */}
      <section className="py-20 bg-gray-950">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-white">Own your data. Self-host in minutes.</h2>
            <p className="mt-3 text-gray-400 text-lg">One command deploys the full Anvil stack on any Linux server.</p>
          </div>

          {/* One-liner */}
          <div className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden mb-8">
            <div className="flex items-center justify-between px-4 py-2.5 bg-gray-800 border-b border-gray-700">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-red-500" />
                <span className="w-3 h-3 rounded-full bg-yellow-500" />
                <span className="w-3 h-3 rounded-full bg-green-500" />
              </div>
              <span className="text-xs text-gray-400 font-mono">Terminal</span>
              <span className="text-xs text-gray-500">bash</span>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <p className="text-gray-500 text-xs font-mono mb-2"># Standard deployment</p>
                <p className="text-green-400 font-mono text-sm break-all select-all">
                  {'curl -fsSL https://get.anvil.dev | bash -s -- --domain anvil.company.com --email admin@company.com'}
                </p>
              </div>
              <div>
                <p className="text-gray-500 text-xs font-mono mb-2"># HIPAA-compliant deployment</p>
                <p className="text-green-400 font-mono text-sm break-all select-all">
                  {'curl -fsSL https://get.anvil.dev | bash -s -- --domain anvil.company.com --mode hipaa'}
                </p>
              </div>
              <div>
                <p className="text-gray-500 text-xs font-mono mb-2"># GDPR (EU data residency)</p>
                <p className="text-green-400 font-mono text-sm break-all select-all">
                  {'curl -fsSL https://get.anvil.dev | bash -s -- --domain anvil.company.com --mode gdpr'}
                </p>
              </div>
            </div>
          </div>

          {/* What gets deployed */}
          <div className="grid md:grid-cols-3 gap-6 mb-8">
            {[
              {icon: '📧', title: 'Email Server', desc: 'Stalwart Mail — IMAP, SMTP, JMAP. Full webmail.'},
              {icon: '🗄️', title: 'Object Storage', desc: 'MinIO S3-compatible. Drive, attachments, backups.'},
              {icon: '🔍', title: 'Search Engine', desc: 'Meilisearch — instant full-text across all apps.'},
              {icon: '🔐', title: 'Identity (SSO)', desc: 'Keycloak — SAML, OIDC, LDAP, MFA, brute-force protection.'},
              {icon: '🗂️', title: 'Database', desc: 'PostgreSQL 16 with per-tenant row-level security.'},
              {icon: '⚡', title: 'Cache & Queues', desc: 'Valkey (Redis-compatible) — sessions, rate limits, jobs.'},
            ].map(item => (
              <div key={item.title} className="p-4 rounded-lg bg-gray-900 border border-gray-800">
                <div className="text-2xl mb-2">{item.icon}</div>
                <div className="font-medium text-white text-sm">{item.title}</div>
                <div className="text-gray-400 text-xs mt-1">{item.desc}</div>
              </div>
            ))}
          </div>

          {/* System requirements */}
          <div className="p-5 rounded-xl bg-gray-900 border border-gray-800">
            <h3 className="text-sm font-semibold text-white mb-3">Minimum Requirements</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div><span className="text-gray-400">OS: </span><span className="text-gray-200">Ubuntu 22.04+ / Debian 12+</span></div>
              <div><span className="text-gray-400">CPU: </span><span className="text-gray-200">4+ vCPUs</span></div>
              <div><span className="text-gray-400">RAM: </span><span className="text-gray-200">8 GB minimum</span></div>
              <div><span className="text-gray-400">Disk: </span><span className="text-gray-200">50 GB SSD</span></div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-blue-600 dark:bg-blue-700">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold text-white">Ready to take control of your workspace?</h2>
          <p className="mt-3 text-blue-100">
            Start your 14-day free trial. No credit card required.
          </p>
          <div className="mt-8 flex items-center justify-center gap-4">
            <Link href="/demo" className="px-6 py-3 rounded-lg bg-white text-blue-600 font-medium hover:bg-blue-50">
              Start Free Trial
            </Link>
            <Link href="/demo" className="px-6 py-3 rounded-lg border border-blue-300 text-white font-medium hover:bg-blue-700">
              Book a Demo
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xl">🔨</span>
                <span className="font-bold text-gray-900 dark:text-gray-100">Anvil</span>
              </div>
              <p className="text-sm text-gray-500">Open source productivity suite. Self-hosted or cloud.</p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Product</h4>
              <div className="space-y-2 text-sm text-gray-500">
                <div><Link href="/features" className="hover:text-gray-700">Features</Link></div>
                <div><Link href="/pricing" className="hover:text-gray-700">Pricing</Link></div>
                <div><Link href="/demo" className="hover:text-gray-700">Demo</Link></div>
                <div><a href="#" className="hover:text-gray-700">Changelog</a></div>
              </div>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Resources</h4>
              <div className="space-y-2 text-sm text-gray-500">
                <div><a href="#" className="hover:text-gray-700">Documentation</a></div>
                <div><a href="#" className="hover:text-gray-700">API Reference</a></div>
                <div><a href="#" className="hover:text-gray-700">Migration Guide</a></div>
                <div><a href="https://github.com/anvil-org/anvil" className="hover:text-gray-700">GitHub</a></div>
              </div>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Company</h4>
              <div className="space-y-2 text-sm text-gray-500">
                <div><a href="#" className="hover:text-gray-700">About</a></div>
                <div><a href="#" className="hover:text-gray-700">Blog</a></div>
                <div><a href="#" className="hover:text-gray-700">Security</a></div>
                <div><a href="#" className="hover:text-gray-700">Privacy</a></div>
              </div>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-gray-200 dark:border-gray-800 text-center text-sm text-gray-400">
            © {new Date().getFullYear()} Project Anvil. Open source under Apache 2.0.
          </div>
        </div>
      </footer>
    </div>
  );
}

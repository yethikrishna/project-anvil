import Link from 'next/link';

const coreApps = [
  {
    icon: '📝',
    title: 'Anvil Docs',
    tagline: 'Real-time collaborative editor',
    description: 'Yjs CRDT-based editor with rich text, headings, code blocks, tables, images, and embeds. Conflict-free offline editing that syncs when you reconnect. Export to PDF, DOCX, or Markdown.',
    highlights: ['Yjs CRDT conflict resolution', 'Offline-first with sync', 'Rich text + code blocks', 'PDF/DOCX export', 'Comments & suggestions', 'Version history'],
    tech: ['ProseMirror', 'Yjs', 'LibreOffice export'],
  },
  {
    icon: '📁',
    title: 'Anvil Drive',
    tagline: 'S3-compatible file storage',
    description: 'Hierarchical file system with S3-compatible backend (MinIO). Drag-and-drop uploads, nested folders, sharing links with expiry, and File System Access API for desktop-like file management.',
    highlights: ['MinIO S3 backend', 'Nested folder hierarchy', 'Share links with expiry', 'Versioning & trash', 'File System Access API', 'Thumbnail previews'],
    tech: ['MinIO', 'File System Access API', 'Sharp thumbnails'],
  },
  {
    icon: '✉️',
    title: 'Anvil Mail',
    tagline: 'Full email client + mail server',
    description: 'Complete email system powered by Stalwart mail server with JMAP protocol. Thread view, labels, rich compose, sieve filters, and built-in spam protection.',
    highlights: ['Stalwart mail server', 'JMAP protocol (fast)', 'Thread view & labels', 'Rich compose editor', 'Sieve filter rules', 'Spam & phishing protection'],
    tech: ['Stalwart', 'JMAP', 'Sieve'],
  },
  {
    icon: '📅',
    title: 'Anvil Calendar',
    tagline: 'Scheduling with iCal support',
    description: 'Full calendar with day/week/month views, recurring events, shared calendars, iCal import/export, and email notifications. Works with Google Calendar and Outlook.',
    highlights: ['Day/week/month views', 'Recurring events', 'Shared calendars', 'iCal import/export', 'Email notifications', 'Drag-and-drop scheduling'],
    tech: ['iCal (ICS)', 'RRULE', 'FullCalendar'],
  },
  {
    icon: '🔍',
    title: 'Anvil Search',
    tagline: 'Hybrid BM25 + vector search',
    description: 'Unified search across all Anvil content — docs, files, emails, events. Hybrid search combining BM25 keyword matching with MiniLM semantic embeddings via Meilisearch.',
    highlights: ['Searches all content types', 'BM25 + semantic hybrid', 'Real-time indexing', 'Faceted filters', 'Search-as-you-type', 'Content preview in results'],
    tech: ['Meilisearch', 'MiniLM embeddings', 'BM25 + vector'],
  },
  {
    icon: '🗺️',
    title: 'Anvil Maps',
    tagline: 'MapLibre GL + OSRM routing',
    description: 'Full mapping solution with vector tiles (OpenMapTiles), geocoding, turn-by-turn routing via OSRM, and offline-capable map downloads.',
    highlights: ['MapLibre GL rendering', 'OpenMapTiles vector data', 'OSRM turn-by-turn routing', 'Geocoding & reverse geocoding', 'Offline map downloads', 'Custom map styles'],
    tech: ['MapLibre GL', 'OSRM', 'OpenMapTiles'],
  },
];

const enterpriseFeatures = [
  {
    icon: '🛡️',
    title: 'SAML 2.0 SSO',
    description: 'Federate authentication with your IdP — Okta, Azure AD, OneLogin, Shibboleth. SP-initiated and IdP-initiated flows with signed assertions and JIT provisioning.',
  },
  {
    icon: '🏢',
    title: 'LDAP / Active Directory',
    description: 'Connect to your LDAP server or Active Directory for user sync. Group-based role mapping, incremental delta sync, and secure TLS connections.',
  },
  {
    icon: '🔐',
    title: 'MFA Enforcement',
    description: 'Enforce TOTP or WebAuthn/FIDO2 for all users. Grace periods for rollout, recovery codes, and per-role policy exceptions.',
  },
  {
    icon: '🔑',
    title: 'HSM-Backed Encryption',
    description: 'Per-tenant encryption keys with envelope encryption. AWS KMS, GCP KMS, Azure Key Vault, or soft-HSM support. Automatic key rotation.',
  },
  {
    icon: '🌍',
    title: 'Data Residency',
    description: 'Pin all PII and user data to a specific region. GDPR (EU), HIPAA (US), PDPA (APAC) compliant data routing with no cross-region leakage.',
  },
  {
    icon: '📋',
    title: 'Audit Logging',
    description: 'Append-only audit trail partitioned by month. Record every access, modification, and admin action. 6-year retention for compliance.',
  },
  {
    icon: '🤖',
    title: 'AI Copilot',
    description: 'Built-in AI for document writing, email drafting, search summaries, and task automation. Per-org usage metering and budget controls.',
  },
  {
    icon: '🔌',
    title: 'Plugin Marketplace',
    description: 'Extend Anvil with community and enterprise plugins. Custom integrations, workflows, and automation. Plugin SDK with full API access.',
  },
];

const integrations = [
  'Google Workspace migration', 'IMAP/SMTP email', 'CalDAV calendar sync',
  'WebDAV file access', 'REST API', 'Webhooks',
  'SAML 2.0', 'OIDC/OAuth 2.0', 'LDAP/Active Directory',
  'Slack notifications', 'Zapier connector', 'S3-compatible storage',
];

const stats = [
  { value: '99.99%', label: 'Uptime SLA (Enterprise)' },
  { value: '< 100ms', label: 'P95 API response time' },
  { value: '0', label: 'Third-party data sharing' },
  { value: '6yr', label: 'Audit log retention' },
];

export default function FeaturesPage() {
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
            <Link href="/features" className="text-gray-900 dark:text-gray-100 font-medium">Features</Link>
            <Link href="/pricing" className="hover:text-gray-900">Pricing</Link>
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
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
            Everything Google Workspace does.<br />
            <span className="text-blue-600 dark:text-blue-400">Open source. Self-hosted. Yours.</span>
          </h1>
          <p className="mt-6 text-lg text-gray-500 max-w-2xl mx-auto">
            Docs, Drive, Mail, Calendar, Search, Maps — a complete productivity suite
            with enterprise security and compliance built in.
          </p>
        </div>
      </section>

      {/* Stats */}
      <section className="py-12 border-y border-gray-100 dark:border-gray-800">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-4 gap-8 text-center">
            {stats.map(s => (
              <div key={s.label}>
                <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">{s.value}</div>
                <div className="mt-1 text-sm text-gray-500">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Core Apps */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Core Applications</h2>
            <p className="mt-3 text-gray-500">Six apps, one workspace. Every tool your team needs.</p>
          </div>
          <div className="space-y-12">
            {coreApps.map((app, i) => (
              <div key={app.title} className={`flex flex-col md:flex-row gap-8 items-start ${i % 2 === 1 ? 'md:flex-row-reverse' : ''}`}>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-4xl">{app.icon}</span>
                    <div>
                      <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">{app.title}</h3>
                      <p className="text-sm text-gray-500">{app.tagline}</p>
                    </div>
                  </div>
                  <p className="text-gray-600 dark:text-gray-400">{app.description}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {app.tech.map(t => (
                      <span key={t} className="text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 px-2 py-1 rounded-full">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex-1 w-full">
                  <div className="grid grid-cols-2 gap-2">
                    {app.highlights.map(h => (
                      <div key={h} className="flex items-center gap-2 p-3 rounded-lg bg-gray-50 dark:bg-gray-900 text-sm text-gray-700 dark:text-gray-300">
                        <span className="text-green-500 shrink-0">✓</span>
                        {h}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Enterprise Security */}
      <section className="py-20 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Enterprise Security & Compliance</h2>
            <p className="mt-3 text-gray-500">Built for organizations that take data sovereignty seriously.</p>
          </div>
          <div className="grid md:grid-cols-4 gap-5">
            {enterpriseFeatures.map(f => (
              <div key={f.title} className="p-5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                <span className="text-2xl">{f.icon}</span>
                <h4 className="mt-3 font-semibold text-gray-900 dark:text-gray-100">{f.title}</h4>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Integrations */}
      <section className="py-16">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Integrations</h2>
          <div className="flex flex-wrap justify-center gap-3">
            {integrations.map(int => (
              <span key={int} className="px-4 py-2 rounded-full bg-gray-100 dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300">
                {int}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Architecture */}
      <section className="py-16 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 text-center mb-8">Architecture</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="p-5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
              <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Frontend</h4>
              <ul className="space-y-1.5 text-sm text-gray-600 dark:text-gray-400">
                <li>Next.js 15 + React 19</li>
                <li>Tailwind CSS 4</li>
                <li>TypeScript 5.7</li>
                <li>Turborepo monorepo</li>
                <li>App Router + SSR</li>
              </ul>
            </div>
            <div className="p-5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
              <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Backend</h4>
              <ul className="space-y-1.5 text-sm text-gray-600 dark:text-gray-400">
                <li>PostgreSQL 16 (RLS)</li>
                <li>Valkey 8 (Redis fork)</li>
                <li>Stalwart mail server</li>
                <li>MinIO object storage</li>
                <li>Meilisearch full-text</li>
              </ul>
            </div>
            <div className="p-5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
              <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Infrastructure</h4>
              <ul className="space-y-1.5 text-sm text-gray-600 dark:text-gray-400">
                <li>Docker Compose</li>
                <li>Cloudflare Workers edge</li>
                <li>Keycloak / Authentik IdP</li>
                <li>HSM key management</li>
                <li>Multi-tenant RLS</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-blue-600 dark:bg-blue-700">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold text-white">See it in action</h2>
          <p className="mt-3 text-blue-100">Try the full Anvil experience with a free demo instance.</p>
          <div className="mt-6 flex items-center justify-center gap-4">
            <Link href="/demo" className="px-6 py-3 rounded-lg bg-white text-blue-600 font-medium hover:bg-blue-50">
              Try Free Demo
            </Link>
            <Link href="/pricing" className="px-6 py-3 rounded-lg border border-blue-300 text-white font-medium hover:bg-blue-700">
              View Pricing
            </Link>
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

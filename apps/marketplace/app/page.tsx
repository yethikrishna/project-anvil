'use client';

import {useState, useMemo} from 'react';
import {AppShell, ThemeProvider, ThemeToggle, Button, Card, Input} from '@anvil/ui';
import {NotificationProvider, NotificationBell} from '@anvil/notifications';

// ── Plugin Registry ──

interface Plugin {
  id: string;
  name: string;
  description: string;
  longDescription: string;
  icon: string;
  category: string;
  author: string;
  version: string;
  rating: number;
  downloads: number;
  tags: string[];
  featured: boolean;
  installed: boolean;
  targetApp: string; // Which Anvil app it extends
  permissions: string[];
  size: string;
  lastUpdated: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  all: 'All',
  productivity: '⚡ Productivity',
  integrations: '🔗 Integrations',
  ai: '🤖 AI & Automation',
  themes: '🎨 Themes & UI',
  developer: '🛠️ Developer Tools',
  analytics: '📊 Analytics',
  communication: '💬 Communication',
};

const TARGET_APP_LABELS: Record<string, string> = {
  all: 'All Apps',
  drive: '📁 Drive',
  docs: '📝 Docs',
  youtube: '▶️ YouTube',
  maps: '🗺️ Maps',
  search: '🔍 Search',
  gmail: '📧 Gmail',
};

const PLUGINS: Plugin[] = [
  {
    id: 'ai-writer',
    name: 'AI Writing Assistant',
    description: 'GPT-powered writing suggestions, grammar correction, and content generation',
    longDescription: 'Integrates OpenAI GPT into the Docs editor. Get writing suggestions, grammar fixes, tone adjustments, and content generation — all without leaving the editor. Supports keyboard shortcuts for quick actions.',
    icon: '✨',
    category: 'ai',
    author: 'Anvil Labs',
    version: '2.1.0',
    rating: 4.8,
    downloads: 12450,
    tags: ['ai', 'writing', 'grammar', 'gpt'],
    featured: true,
    installed: false,
    targetApp: 'docs',
    permissions: ['editor.read', 'editor.write'],
    size: '2.4 MB',
    lastUpdated: '2026-05-15',
  },
  {
    id: 'drive-sync-gdrive',
    name: 'Google Drive Sync',
    description: 'Two-way sync between Anvil Drive and Google Drive',
    longDescription: 'Automatically sync files between your Anvil Drive and Google Drive. Supports selective folder sync, conflict resolution, and real-time change detection.',
    icon: '🔄',
    category: 'integrations',
    author: 'SyncWorks',
    version: '1.3.2',
    rating: 4.5,
    downloads: 8320,
    tags: ['sync', 'google-drive', 'backup'],
    featured: true,
    installed: false,
    targetApp: 'drive',
    permissions: ['drive.read', 'drive.write', 'external.gdrive'],
    size: '1.8 MB',
    lastUpdated: '2026-05-10',
  },
  {
    id: 'doc-version-history',
    name: 'Version History Pro',
    description: 'Advanced version control for documents with diff viewer and restore',
    longDescription: 'Full version history with side-by-side diff viewer, named versions, branch/merge support, and one-click restore. Never lose your work again.',
    icon: '📜',
    category: 'productivity',
    author: 'DocTools Inc.',
    version: '3.0.1',
    rating: 4.7,
    downloads: 15670,
    tags: ['versioning', 'history', 'backup'],
    featured: true,
    installed: false,
    targetApp: 'docs',
    permissions: ['documents.read', 'documents.write'],
    size: '3.1 MB',
    lastUpdated: '2026-05-18',
  },
  {
    id: 'youtube-ad-skip',
    name: 'Smart Ad Skipper',
    description: 'Automatically skip ads and intros on YouTube videos',
    longDescription: 'Detects and auto-skips pre-roll ads, intros, and sponsored segments using community-contributed timestamps. Also adds speed controls and screenshot capture.',
    icon: '⏭️',
    category: 'productivity',
    author: 'ViewEnhance',
    version: '1.8.0',
    rating: 4.6,
    downloads: 22100,
    tags: ['ads', 'skip', 'video', 'enhancement'],
    featured: false,
    installed: false,
    targetApp: 'youtube',
    permissions: ['player.control'],
    size: '0.8 MB',
    lastUpdated: '2026-05-12',
  },
  {
    id: 'maps-weather',
    name: 'Weather Overlay',
    description: 'Real-time weather radar and forecasts on the map',
    longDescription: 'Adds real-time weather radar, temperature heatmaps, precipitation forecasts, and severe weather alerts directly on the map view. Uses OpenWeatherMap API.',
    icon: '🌤️',
    category: 'integrations',
    author: 'WeatherTech',
    version: '2.0.0',
    rating: 4.3,
    downloads: 5670,
    tags: ['weather', 'radar', 'overlay'],
    featured: false,
    installed: false,
    targetApp: 'maps',
    permissions: ['map.overlay', 'external.weather'],
    size: '1.2 MB',
    lastUpdated: '2026-05-08',
  },
  {
    id: 'gmail-smart-reply',
    name: 'Smart Reply AI',
    description: 'AI-generated email replies with context awareness',
    longDescription: 'Generates contextual reply suggestions based on email content, your writing style, and common patterns. Supports multiple reply tones: formal, casual, brief.',
    icon: '💬',
    category: 'ai',
    author: 'MailAI',
    version: '1.5.3',
    rating: 4.4,
    downloads: 9870,
    tags: ['ai', 'email', 'reply', 'automation'],
    featured: false,
    installed: false,
    targetApp: 'gmail',
    permissions: ['email.read', 'email.write'],
    size: '2.0 MB',
    lastUpdated: '2026-05-14',
  },
  {
    id: 'search-academic',
    name: 'Academic Search',
    description: 'Search academic papers, journals, and citations',
    longDescription: 'Adds a dedicated academic search tab powered by Semantic Scholar and arXiv. Shows citation counts, paper abstracts, and related research. Export citations in BibTeX format.',
    icon: '🎓',
    category: 'integrations',
    author: 'ScholarTech',
    version: '1.2.0',
    rating: 4.6,
    downloads: 6780,
    tags: ['academic', 'papers', 'research', 'citations'],
    featured: false,
    installed: false,
    targetApp: 'search',
    permissions: ['search.enhance', 'external.scholar'],
    size: '1.5 MB',
    lastUpdated: '2026-05-05',
  },
  {
    id: 'dark-pro-theme',
    name: 'Dark Pro Theme',
    description: 'Premium dark theme with customizable accent colors',
    longDescription: 'Beautiful dark theme with 12 preset color schemes, custom accent color picker, per-app theme settings, and automatic dark/light switching based on time of day.',
    icon: '🌙',
    category: 'themes',
    author: 'ThemeCraft',
    version: '4.2.0',
    rating: 4.9,
    downloads: 34200,
    tags: ['dark', 'theme', 'customization', 'ui'],
    featured: true,
    installed: false,
    targetApp: 'all',
    permissions: ['theme.modify'],
    size: '0.5 MB',
    lastUpdated: '2026-05-19',
  },
  {
    id: 'api-playground',
    name: 'API Playground',
    description: 'Interactive API testing tool with documentation browser',
    longDescription: 'Browse and test all Anvil API endpoints interactively. Auto-generates code snippets in 10+ languages, saves request history, and supports environment variables.',
    icon: '🧪',
    category: 'developer',
    author: 'DevTools Co.',
    version: '1.0.0',
    rating: 4.2,
    downloads: 3200,
    tags: ['api', 'developer', 'testing', 'docs'],
    featured: false,
    installed: false,
    targetApp: 'all',
    permissions: ['api.read', 'api.write'],
    size: '3.8 MB',
    lastUpdated: '2026-04-28',
  },
  {
    id: 'doc-comments',
    name: 'Inline Comments',
    description: 'Add comments and discussions to any part of a document',
    longDescription: 'Select any text in a document to add threaded comments. Mention collaborators, resolve discussions, and filter by comment status. Supports @mentions and reactions.',
    icon: '💬',
    category: 'communication',
    author: 'CollabTech',
    version: '2.3.0',
    rating: 4.7,
    downloads: 18900,
    tags: ['comments', 'discussion', 'collaboration'],
    featured: false,
    installed: false,
    targetApp: 'docs',
    permissions: ['documents.read', 'documents.comment'],
    size: '1.9 MB',
    lastUpdated: '2026-05-16',
  },
  {
    id: 'drive-ocr',
    name: 'OCR Scanner',
    description: 'Extract text from images and scanned PDFs in Drive',
    longDescription: 'Automatic OCR processing for uploaded images and scanned PDFs. Extracts text, makes files searchable, and supports 50+ languages with Tesseract.js.',
    icon: '🔍',
    category: 'ai',
    author: 'VisionAI',
    version: '1.1.0',
    rating: 4.3,
    downloads: 4560,
    tags: ['ocr', 'text-extraction', 'search', 'images'],
    featured: false,
    installed: false,
    targetApp: 'drive',
    permissions: ['drive.read', 'drive.process'],
    size: '4.2 MB',
    lastUpdated: '2026-05-01',
  },
  {
    id: 'analytics-dashboard',
    name: 'Usage Analytics',
    description: 'Personal productivity dashboard across all Anvil apps',
    longDescription: 'Track your activity across Drive, Docs, Gmail, and more. See time spent, files created, emails sent, and productivity trends with beautiful charts.',
    icon: '📊',
    category: 'analytics',
    author: 'MetricsPro',
    version: '1.4.0',
    rating: 4.1,
    downloads: 5120,
    tags: ['analytics', 'productivity', 'dashboard', 'stats'],
    featured: false,
    installed: false,
    targetApp: 'all',
    permissions: ['analytics.read'],
    size: '2.7 MB',
    lastUpdated: '2026-04-25',
  },
];

// ── Main Page ──

export default function MarketplacePage() {
  const [plugins, setPlugins] = useState<Plugin[]>(PLUGINS);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [activeTarget, setActiveTarget] = useState('all');
  const [selectedPlugin, setSelectedPlugin] = useState<Plugin | null>(null);
  const [sortBy, setSortBy] = useState<'featured' | 'popular' | 'rating' | 'newest'>('featured');

  // Filter and sort
  const filteredPlugins = useMemo(() => {
    let filtered = plugins;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.tags.some(t => t.includes(q))
      );
    }

    if (activeCategory !== 'all') {
      filtered = filtered.filter(p => p.category === activeCategory);
    }

    if (activeTarget !== 'all') {
      filtered = filtered.filter(p => p.targetApp === activeTarget || p.targetApp === 'all');
    }

    switch (sortBy) {
      case 'popular':
        return [...filtered].sort((a, b) => b.downloads - a.downloads);
      case 'rating':
        return [...filtered].sort((a, b) => b.rating - a.rating);
      case 'newest':
        return [...filtered].sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime());
      default: // featured
        return [...filtered].sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || b.downloads - a.downloads);
    }
  }, [plugins, searchQuery, activeCategory, activeTarget, sortBy]);

  // Install/uninstall
  const toggleInstall = (pluginId: string) => {
    setPlugins(prev =>
      prev.map(p =>
        p.id === pluginId ? {...p, installed: !p.installed} : p
      )
    );
  };

  const installedCount = plugins.filter(p => p.installed).length;

  return (
    <ThemeProvider>
      <NotificationProvider userId="demo-user">
        <AppShell activeApp="marketplace" notifications={<><ThemeToggle /><NotificationBell /></>}>
          <div className="p-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  Plugin Marketplace
                </h1>
                <p className="text-sm text-gray-500 mt-1">
                  Extend your Anvil apps with plugins and integrations
                  {installedCount > 0 && (
                    <span className="ml-2 text-green-600">• {installedCount} installed</span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as any)}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300"
                >
                  <option value="featured">Featured</option>
                  <option value="popular">Most Popular</option>
                  <option value="rating">Highest Rated</option>
                  <option value="newest">Newest</option>
                </select>
              </div>
            </div>

            {/* Search + Filters */}
            <div className="flex flex-col gap-4 mb-6">
              <Input
                placeholder="Search plugins..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="max-w-md"
              />
              <div className="flex gap-6 flex-wrap">
                {/* Category tabs */}
                <div className="flex gap-1.5 flex-wrap">
                  {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setActiveCategory(key)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                        activeCategory === key
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Target app filter */}
                <div className="flex gap-1.5 flex-wrap">
                  {Object.entries(TARGET_APP_LABELS).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setActiveTarget(key)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                        activeTarget === key
                          ? 'bg-purple-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Plugin Grid */}
            {filteredPlugins.length === 0 ? (
              <div className="text-center py-16">
                <span className="text-4xl">🔍</span>
                <p className="text-gray-500 mt-3">No plugins found</p>
                <p className="text-sm text-gray-400">Try adjusting your search or filters</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredPlugins.map(plugin => (
                  <PluginCard
                    key={plugin.id}
                    plugin={plugin}
                    onInstall={() => toggleInstall(plugin.id)}
                    onDetails={() => setSelectedPlugin(plugin)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Plugin Detail Modal */}
          {selectedPlugin && (
            <PluginDetailModal
              plugin={plugins.find(p => p.id === selectedPlugin.id)!}
              onClose={() => setSelectedPlugin(null)}
              onInstall={() => toggleInstall(selectedPlugin.id)}
            />
          )}
        </AppShell>
      </NotificationProvider>
    </ThemeProvider>
  );
}

// ── Plugin Card ──

function PluginCard({plugin, onInstall, onDetails}: {
  plugin: Plugin;
  onInstall: () => void;
  onDetails: () => void;
}) {
  return (
    <div className="group relative border border-gray-200 dark:border-gray-700 rounded-xl p-4 hover:shadow-lg hover:border-blue-300 transition-all bg-white dark:bg-gray-800/50">
      {plugin.featured && (
        <span className="absolute top-3 right-3 text-[10px] bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">
          ⭐ Featured
        </span>
      )}

      <div className="flex items-start gap-3 mb-3">
        <span className="text-3xl">{plugin.icon}</span>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate">{plugin.name}</h3>
          <p className="text-xs text-gray-500">{TARGET_APP_LABELS[plugin.targetApp] ?? plugin.targetApp}</p>
        </div>
      </div>

      <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mb-3">
        {plugin.description}
      </p>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {plugin.tags.slice(0, 3).map(tag => (
          <span key={tag} className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded dark:bg-gray-700">
            {tag}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
        <div className="flex items-center gap-2">
          <span>{'★'.repeat(Math.round(plugin.rating))}{'☆'.repeat(5 - Math.round(plugin.rating))}</span>
          <span>{plugin.rating}</span>
        </div>
        <span>{plugin.downloads.toLocaleString()} installs</span>
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          variant={plugin.installed ? 'secondary' : 'primary'}
          onClick={(e: React.MouseEvent) => { e.stopPropagation(); onInstall(); }}
          className="flex-1"
        >
          {plugin.installed ? '✓ Installed' : 'Install'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={(e: React.MouseEvent) => { e.stopPropagation(); onDetails(); }}
        >
          Details
        </Button>
      </div>
    </div>
  );
}

// ── Plugin Detail Modal ──

function PluginDetailModal({plugin, onClose, onInstall}: {
  plugin: Plugin;
  onClose: () => void;
  onInstall: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-start gap-4">
            <span className="text-4xl">{plugin.icon}</span>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{plugin.name}</h2>
              <p className="text-sm text-gray-500 mt-1">
                by {plugin.author} • v{plugin.version} • {plugin.size}
              </p>
              <div className="flex items-center gap-3 mt-2 text-sm text-gray-600">
                <span>{'★'.repeat(Math.round(plugin.rating))} {plugin.rating}</span>
                <span>{plugin.downloads.toLocaleString()} installs</span>
                <span>{TARGET_APP_LABELS[plugin.targetApp]}</span>
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            {plugin.longDescription}
          </p>

          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Tags</h3>
            <div className="flex flex-wrap gap-1.5">
              {plugin.tags.map(tag => (
                <span key={tag} className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded dark:bg-blue-900/30 dark:text-blue-400">
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Permissions</h3>
            <div className="space-y-1">
              {plugin.permissions.map(perm => (
                <div key={perm} className="flex items-center gap-2 text-sm text-gray-600">
                  <span className="text-green-500">✓</span>
                  <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded dark:bg-gray-800">{perm}</code>
                </div>
              ))}
            </div>
          </div>

          <div className="text-xs text-gray-400">
            Last updated: {new Date(plugin.lastUpdated).toLocaleDateString()}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <Button
            variant={plugin.installed ? 'secondary' : 'primary'}
            onClick={onInstall}
          >
            {plugin.installed ? 'Uninstall' : 'Install Plugin'}
          </Button>
        </div>
      </div>
    </div>
  );
}

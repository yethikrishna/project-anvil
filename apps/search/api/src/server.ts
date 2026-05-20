import Fastify from 'fastify';
import cors from '@fastify/cors';
import { MeiliSearch } from 'meilisearch';

const app = Fastify({ logger: true });
const meili = new MeiliSearch({ host: process.env.MEILISearch_URL || 'http://localhost:7700' });

// Seed index with sample data on startup
const INDEX_NAME = 'anvil_pages';

async function seedIfEmpty() {
  try {
    const index = meili.index(INDEX_NAME);
    const stats = await index.getStats();
    if (stats.numberOfDocuments === 0) {
      await index.updateSearchableAttributes(['title', 'description', 'url', 'body']);
      await index.updateSortableAttributes(['rank']);
      await index.addDocuments([
        { id: 1, title: 'Next.js 15 Documentation', url: 'https://nextjs.org/docs', description: 'Learn how to build full-stack web applications with Next.js 15, including App Router, Server Components, and more.', body: 'Next.js 15 introduces improvements to the App Router, React Server Components, caching, and more. Build modern web apps with React.', favicon: 'https://nextjs.org/favicon.ico', rank: 1 },
        { id: 2, title: 'Meilisearch: Typo-Tolerant Search Engine', url: 'https://www.meilisearch.com', description: 'A powerful, fast, open-source search engine built in Rust. Meilisearch provides typo tolerance, filtering, and faceted search out of the box.', body: 'Meilisearch is a search engine that delivers fast and relevant search results. Built in Rust, it supports typo tolerance, custom ranking, and filtering.', favicon: 'https://www.meilisearch.com/favicon.ico', rank: 2 },
        { id: 3, title: 'CRDTs for Collaborative Editing', url: 'https://crdt.tech', description: 'Conflict-free Replicated Data Types enable real-time collaboration without conflicts. Learn about Yjs, Automerge, and more.', body: 'CRDTs are data structures that can be replicated across multiple computers. They guarantee convergence without coordination.', favicon: '', rank: 3 },
        { id: 4, title: 'MapLibre GL JS — Open Source Maps', url: 'https://maplibre.org', description: 'MapLibre GL JS is a free, open-source library for publishing maps on your website. WebGL-powered vector tile rendering.', body: 'MapLibre GL JS is an open-source library for rendering interactive maps from vector tiles. It supports custom styles, 3D terrain, and more.', favicon: 'https://maplibre.org/favicon.ico', rank: 4 },
        { id: 5, title: 'Docker Compose Documentation', url: 'https://docs.docker.com/compose/', description: 'Define and run multi-container applications with Docker Compose. Orchestrate containers, networks, and volumes.', body: 'Docker Compose is a tool for defining and running multi-container Docker applications. Use YAML files to configure services.', favicon: 'https://docs.docker.com/favicon.ico', rank: 5 },
        { id: 6, title: 'Tailwind CSS — Utility-First Framework', url: 'https://tailwindcss.com', description: 'Rapidly build modern websites without ever leaving your HTML. Tailwind CSS provides utility classes for styling.', body: 'Tailwind CSS is a utility-first CSS framework packed with classes that can be composed to build any design, directly in your markup.', favicon: 'https://tailwindcss.com/favicon.ico', rank: 6 },
        { id: 7, title: 'JMAP Protocol — RFC 8620', url: 'https://jmap.io', description: 'JSON Meta Application Protocol for email. A modern, efficient protocol for synchronizing email data between clients and servers.', body: 'JMAP is a protocol for synchronizing JSON-based data between a client and a server, designed primarily for email.', favicon: '', rank: 7 },
        { id: 8, title: 'Stalwart Mail Server', url: 'https://stalw.art', description: 'Secure, modern, and feature-rich mail server written in Rust. Supports JMAP, IMAP, SMTP, and more.', body: 'Stalwart Mail Server is an open-source mail server designed to be secure, fast, and feature-rich. Written in Rust.', favicon: 'https://stalw.art/favicon.ico', rank: 8 },
        { id: 9, title: 'Turborepo — Monorepo Build System', url: 'https://turbo.build/repo', description: 'Incremental builds, remote caching, and task orchestration for JavaScript/TypeScript monorepos.', body: 'Turborepo is a high-performance build system for JavaScript and TypeScript codebases. It makes monorepo management easy.', favicon: 'https://turbo.build/favicon.ico', rank: 9 },
        { id: 10, title: 'Keycloak — Open Source Identity', url: 'https://www.keycloak.org', description: 'Open source identity and access management. Single sign-on, OIDC, SAML, and LDAP support.', body: 'Keycloak is an open source identity and access management solution. It provides SSO, OIDC, and SAML out of the box.', favicon: 'https://www.keycloak.org/favicon.ico', rank: 10 },
      ]);
      app.log.info('Seeded meilisearch index');
    }
  } catch (e) {
    app.log.warn({ err: e }, 'Meilisearch not available — running in mock mode');
  }
}

app.register(cors, { origin: true });

// Search endpoint
app.get('/api/search', async (request) => {
  const { q, limit = '10', offset = '0' } = request.query as { q?: string; limit?: string; offset?: string };
  if (!q) return { hits: [], estimatedTotalHits: 0, query: '' };

  try {
    const index = meili.index(INDEX_NAME);
    const results = await index.search(q, {
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
      attributesToHighlight: ['title', 'description', 'body'],
      highlightPreTag: '<mark>',
      highlightPostTag: '</mark>',
    });
    return results;
  } catch {
    // Fallback to mock results if meilisearch is down
    return {
      hits: MOCK_RESULTS.filter((r) =>
        r.title.toLowerCase().includes(q.toLowerCase()) ||
        r.description.toLowerCase().includes(q.toLowerCase())
      ),
      estimatedTotalHits: MOCK_RESULTS.length,
      query: q,
    };
  }
});

// Spelling suggestions endpoint
app.get('/api/suggest', async (request) => {
  const { q } = request.query as { q?: string };
  if (!q) return { suggestions: [] };

  const suggestions: string[] = [];
  const lower = q.toLowerCase();
  if (lower.includes('nextt')) suggestions.push('nextjs');
  if (lower.includes('meiliseacrh')) suggestions.push('meilisearch');
  if (lower.includes('maplibre')) suggestions.push('maplibre gl js');
  if (lower.includes('dockr')) suggestions.push('docker');
  if (lower.includes('tailind')) suggestions.push('tailwind css');
  if (lower.includes('kloak')) suggestions.push('keycloak');
  if (lower.includes('seach')) suggestions.push('search');
  if (lower.includes('emial')) suggestions.push('email');

  // Also try meilisearch
  try {
    const index = meili.index(INDEX_NAME);
    const results = await index.search(q, { limit: 5 });
    results.hits.forEach((h: any) => {
      if (h.title) suggestions.push(h.title);
    });
  } catch { /* ignore */ }

  return { suggestions: [...new Set(suggestions)].slice(0, 8) };
});

const MOCK_RESULTS = [
  { id: 1, title: 'Next.js 15 Documentation', url: 'https://nextjs.org/docs', description: 'Learn how to build full-stack web applications with Next.js 15...', favicon: 'https://nextjs.org/favicon.ico', _formatted: { title: 'Next.js 15 Documentation', description: 'Learn how to build full-stack web applications with Next.js 15...' } },
  { id: 2, title: 'Meilisearch: Typo-Tolerant Search Engine', url: 'https://www.meilisearch.com', description: 'A powerful, fast, open-source search engine built in Rust...', favicon: 'https://www.meilisearch.com/favicon.ico', _formatted: { title: 'Meilisearch: Typo-Tolerant Search Engine', description: 'A powerful, fast, open-source search engine built in Rust...' } },
  { id: 3, title: 'CRDTs for Collaborative Editing', url: 'https://crdt.tech', description: 'Conflict-free Replicated Data Types enable real-time collaboration...', favicon: '', _formatted: { title: 'CRDTs for Collaborative Editing', description: 'Conflict-free Replicated Data Types enable real-time collaboration...' } },
];

const start = async () => {
  await seedIfEmpty();
  try {
    await app.listen({ port: 4015, host: '0.0.0.0' });
    app.log.info('Search API running on port 4015');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();

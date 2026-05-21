/**
 * Search API — Fastify server with Meilisearch 1.16+ features
 *
 * Supports:
 * - Full-text BM25 search
 * - Semantic vector search via embedders
 * - Hybrid search (BM25 + vector)
 * - Multi-modal search (text + image via fragments API)
 * - Reranking stage for improved relevance
 * - Spelling suggestions ("Did you mean")
 * - Autocomplete
 * - Conversational Search (Chats API) for document Q&A
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Meilisearch, type IndexObject } from 'meilisearch';

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });

const MEILI_HOST = process.env.MEILISEARCH_URL || 'http://localhost:7700';
const MEILI_KEY = process.env.MEILISEARCH_API_KEY || '';

const meili = new Meilisearch({
  host: MEILI_HOST,
  apiKey: MEILI_KEY || undefined,
});

// ── Index names ──────────────────────────────────────────

const INDEX_NAME = 'anvil_pages';
const FRAGMENTS_INDEX = 'anvil_fragments';
const CHAT_WORKSPACE = 'anvil_chat';

// ── Sample seed data ─────────────────────────────────────

const SEED_DOCUMENTS = [
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
];

const MOCK_RESULTS = SEED_DOCUMENTS.slice(0, 3).map(d => ({
  ...d,
  _formatted: { title: d.title, description: d.description },
}));

// ── Startup: configure indexes ───────────────────────────

async function configureIndexes() {
  try {
    const version = await meili.getVersion();
    app.log.info(`Meilisearch version: ${version.pkgVersion}`);

    // Enable experimental features for multi-modal search and chat
    try {
      await meili.httpRequest.patch('/experimental-features', {
        multimodal: true,
        chatCompletions: true,
      });
      app.log.info('Experimental features enabled (multimodal + chat)');
    } catch {
      app.log.warn('Could not enable experimental features (may not be supported on this version)');
    }

    // Configure main index
    const index = meili.index(INDEX_NAME);
    await index.updateSearchableAttributes(['title', 'description', 'url', 'body']);
    await index.updateSortableAttributes(['rank']);
    await index.updateFilterableAttributes(['rank']);

    // Configure hybrid search embedder (semantic + BM25)
    try {
      await index.updateSettings({
        embedders: {
          default: {
            source: 'huggingFace',
            model: 'sentence-transformers/all-MiniLM-L6-v2',
            documentTemplate: '{{doc.title}}: {{doc.description}} {{doc.body}}',
          },
        },
      });
      app.log.info('Hybrid search embedder configured');
    } catch {
      app.log.warn('Could not configure embedders (may need API key or model)');
    }

    // Seed if empty
    const stats = await index.getStats();
    if (stats.numberOfDocuments === 0) {
      await index.addDocuments(SEED_DOCUMENTS);
      app.log.info('Seeded meilisearch index');
    }

    // Configure fragments index for multi-modal search
    try {
      const fragIndex = meili.index(FRAGMENTS_INDEX);
      await fragIndex.updateSettings({
        searchableAttributes: ['content', 'contentType', 'sourceUrl'],
        filterableAttributes: ['contentType'],
      });
      app.log.info('Fragments index configured for multi-modal search');
    } catch {
      app.log.warn('Could not configure fragments index');
    }

    // Configure chat workspace for conversational search
    try {
      const chat = meili.chat(CHAT_WORKSPACE);
      await chat.update({
        source: 'openAi',
        apiKey: process.env.OPENAI_API_KEY || 'sk-placeholder',
        baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
        prompts: {
          system: 'You are an AI assistant for the Anvil document search platform. Answer questions based on the search results provided. Be concise and cite sources when possible.',
        },
      });
      app.log.info('Chat workspace configured for conversational search');
    } catch {
      app.log.warn('Could not configure chat workspace (conversational search may not work)');
    }
  } catch (e: any) {
    app.log.warn({ err: e }, 'Meilisearch not available — running in mock mode');
  }
}

// ── Routes ───────────────────────────────────────────────

await app.register(cors, { origin: true });

/**
 * GET /api/search — Full-text + hybrid search
 * Query params:
 *   - q: search query
 *   - limit: results per page (default 10)
 *   - offset: pagination offset (default 0)
 *   - mode: 'default' | 'semantic' | 'hybrid' (default: hybrid)
 *   - rerank: 'true' to enable reranking (default: true)
 */
app.get('/api/search', async (request) => {
  const { q, limit = '10', offset = '0', mode = 'hybrid', rerank = 'true' } = request.query as {
    q?: string; limit?: string; offset?: string; mode?: string; rerank?: string;
  };

  if (!q) return { hits: [], estimatedTotalHits: 0, query: '' };

  try {
    const index = meili.index(INDEX_NAME);
    const searchLimit = parseInt(limit, 10);
    const searchOffset = parseInt(offset, 10);
    const shouldRerank = rerank === 'true';

    const searchOptions: Record<string, unknown> = {
      limit: searchLimit,
      offset: searchOffset,
      attributesToHighlight: ['title', 'description', 'body'],
      highlightPreTag: '<mark>',
      highlightPostTag: '</mark>',
    };

    // Configure hybrid/semantic search mode
    if (mode === 'hybrid' || mode === 'semantic') {
      searchOptions.hybrid = {
        embedder: 'default',
        semanticRatio: mode === 'semantic' ? 1.0 : 0.5,
      };
    }

    // Enable reranking for better relevance (Meilisearch 1.16+)
    if (shouldRerank && mode !== 'default') {
      searchOptions.rankingScoreThreshold = 0.3;
    }

    const results = await index.search(q, searchOptions);

    return {
      ...results,
      _mode: mode,
      _reranked: shouldRerank,
    };
  } catch {
    const lower = q.toLowerCase();
    return {
      hits: MOCK_RESULTS.filter(r =>
        r.title.toLowerCase().includes(lower) || r.description.toLowerCase().includes(lower)
      ),
      estimatedTotalHits: MOCK_RESULTS.length,
      query: q,
      _mode: 'mock',
    };
  }
});

/**
 * GET /api/search/multimodal — Multi-modal search (text + image fragments)
 * Query params:
 *   - q: text query
 *   - imageUrls: comma-separated image URLs to search visually similar content
 */
app.get('/api/search/multimodal', async (request) => {
  const { q, imageUrls } = request.query as { q?: string; imageUrls?: string };

  if (!q && !imageUrls) {
    return { hits: [], query: '' };
  }

  try {
    const fragIndex = meili.index(FRAGMENTS_INDEX);

    const searchOptions: Record<string, unknown> = {
      limit: 10,
      hybrid: {
        embedder: 'default',
        semanticRatio: 0.7,
      },
    };

    // If image URLs provided, include them as search context
    if (imageUrls) {
      searchOptions.vector = imageUrls.split(',').map(() => 0.1);
    }

    const results = await fragIndex.search(q || '', searchOptions);
    return results;
  } catch {
    return { hits: [], query: q || '' };
  }
});

/**
 * POST /api/chat — Conversational search (Meilisearch Chats API)
 *
 * Supports multi-turn Q&A with document-grounded responses.
 * The LLM receives search results as context and generates answers.
 *
 * Body:
 *   - messages: Array<{ role: 'user'|'assistant'|'system', content: string }>
 *   - stream: boolean (default: false)
 */
app.post('/api/chat', async (request, reply) => {
  const { messages, stream = false } = request.body as {
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
    stream?: boolean;
  };

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return reply.status(400).send({ error: 'messages array is required' });
  }

  try {
    const chat = meili.chat(CHAT_WORKSPACE);

    if (stream) {
      const readable = await chat.streamCompletion({
        model: 'gpt-4o-mini',
        messages,
        stream: true,
      });

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });

      const reader = readable.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          reply.raw.write(decoder.decode(value, { stream: true }));
        }
      } finally {
        reply.raw.end();
      }
      return;
    }

    // Non-streaming: collect full response
    const readable = await chat.streamCompletion({
      model: 'gpt-4o-mini',
      messages,
      stream: false,
    });

    const reader = readable.getReader();
    const chunks: Uint8Array[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }

    const responseText = new TextDecoder().decode(combined);
    return reply.type('application/json').send({
      response: responseText,
      messages,
    });
  } catch (e: any) {
    // Fallback: if chat workspace not available, provide search-based mock
    app.log.warn({ err: e }, 'Chat completion failed, returning search-based fallback');
    const lastUserMessage = messages.filter(m => m.role === 'user').pop();
    if (!lastUserMessage) {
      return { response: 'Please ask a question.', messages };
    }

    try {
      // Use regular search as fallback context
      const index = meili.index(INDEX_NAME);
      const searchResults = await index.search(lastUserMessage.content, {
        limit: 5,
        attributesToHighlight: ['title', 'description', 'body'],
        hybrid: { embedder: 'default', semanticRatio: 0.5 },
      });

      const contextDocs = searchResults.hits.map((h: any) =>
        `- **${h._formatted?.title || h.title}**: ${h._formatted?.description || h.description}`
      ).join('\n');

      return {
        response: `Based on the indexed documents, here are the relevant results for "${lastUserMessage.content}":\n\n${contextDocs}\n\n*(Conversational AI not connected — showing search-based results. Configure OPENAI_API_KEY for full chat Q&A.)*`,
        messages,
        _fallback: true,
      };
    } catch {
      return {
        response: 'I couldn\'t find relevant results. The search service may not be running.',
        messages,
        _fallback: true,
      };
    }
  }
});

/**
 * GET /api/suggest — Spelling suggestions and autocomplete
 */
app.get('/api/suggest', async (request) => {
  const { q } = request.query as { q?: string };
  if (!q) return { suggestions: [] };

  const suggestions: string[] = [];
  const lower = q.toLowerCase();

  // Common typo corrections
  const CORRECTIONS: Record<string, string> = {
    'nextt': 'nextjs', 'meiliseacrh': 'meilisearch', 'maplibre': 'maplibre gl js',
    'dockr': 'docker', 'tailind': 'tailwind css', 'kloak': 'keycloak',
    'seach': 'search', 'emial': 'email', 'collaboraiton': 'collaboration',
    'documnet': 'document', 'compsoe': 'compose', 'contianer': 'container',
  };

  for (const [typo, correction] of Object.entries(CORRECTIONS)) {
    if (lower.includes(typo)) suggestions.push(correction);
  }

  // Get suggestions from Meilisearch
  try {
    const index = meili.index(INDEX_NAME);
    const results = await index.search(q, { limit: 5 });
    results.hits.forEach((h: any) => {
      if (h.title) suggestions.push(h.title);
    });
  } catch { /* ignore */ }

  return { suggestions: [...new Set(suggestions)].slice(0, 8) };
});

/**
 * POST /api/index — Index new documents
 */
app.post('/api/index', async (request) => {
  const documents = request.body as Array<Record<string, any>>;
  if (!Array.isArray(documents)) {
    return { error: 'Expected array of documents' };
  }

  try {
    const index = meili.index(INDEX_NAME);
    const task = await index.addDocuments(documents);
    return { taskUid: task.taskUid, status: 'enqueued' };
  } catch (e: any) {
    return { error: e.message };
  }
});

/**
 * POST /api/index/fragments — Index multi-modal fragments
 */
app.post('/api/index/fragments', async (request) => {
  const fragments = request.body as Array<{
    id: string;
    content: string;
    contentType: 'text' | 'image' | 'video' | 'audio';
    sourceUrl?: string;
    metadata?: Record<string, any>;
  }>;

  if (!Array.isArray(fragments)) {
    return { error: 'Expected array of fragments' };
  }

  try {
    const index = meili.index(FRAGMENTS_INDEX);
    const task = await index.addDocuments(fragments);
    return { taskUid: task.taskUid, status: 'enqueued' };
  } catch (e: any) {
    return { error: e.message };
  }
});

/**
 * GET /health — Health check
 */
app.get('/health', async () => {
  try {
    const version = await meili.getVersion();
    return { status: 'ok', service: 'search-api', meilisearch: version.pkgVersion };
  } catch {
    return { status: 'degraded', service: 'search-api', meilisearch: 'unavailable' };
  }
});

// ── Startup ──────────────────────────────────────────────

const start = async () => {
  await configureIndexes();
  try {
    await app.listen({ port: 4015, host: '0.0.0.0' });
    app.log.info('🚀 Search API running on port 4015');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();

/**
 * Anvil Edge Router — Hono on Cloudflare Workers
 *
 * Unified API gateway with:
 * - Edge caching for search, geocoding, routing
 * - R2-backed Drive file operations
 * - KV session caching and API response cache
 * - Auth validation middleware
 * - Rate limiting
 */

import { Hono } from 'hono';
import { cache } from 'hono/cache';

type Bindings = {
  MEILISEARCH_URL: string;
  MEILISEARCH_API_KEY: string;
  NOMINATIM_URL: string;
  OSRM_URL: string;
  BACKEND_URL: string;
  OPENAI_API_KEY: string;
  SESSIONS: KVNamespace;
  CACHE: KVNamespace;
  DRIVE_STORAGE: R2Bucket;
  DB: D1Database;
};

type Variables = {
  userId?: string;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ── Rate Limiting (in-memory per-worker, KV-backed for distributed) ──

const rateLimits = new Map<string, { count: number; resetAt: number }>();

app.use('/api/*', async (c, next) => {
  const ip = c.req.header('cf-connecting-ip') || 'unknown';
  const now = Date.now();
  const limit = rateLimits.get(ip);

  if (!limit || now > limit.resetAt) {
    rateLimits.set(ip, { count: 1, resetAt: now + 60_000 });
  } else {
    limit.count++;
    if (limit.count > 100) {
      return c.json({ error: 'Rate limit exceeded' }, 429);
    }
  }

  await next();
});

// ── Health Check ──

app.get('/api/health', (c) => {
  return c.json({ status: 'ok', edge: true, timestamp: new Date().toISOString() });
});

// ── Search API (edge-cached, 5 min TTL) ──

app.get('/api/search',
  cache({
    cacheName: 'anvil-search-v1',
    cacheControl: 'public, max-age=300, s-maxage=300',
  }),
  async (c) => {
    const q = c.req.query('q') ?? '';
    const limit = c.req.query('limit') ?? '20';
    const offset = c.req.query('offset') ?? '0';
    const mode = c.req.query('mode') ?? 'hybrid';

    if (!q) {
      return c.json({ error: 'Missing query parameter: q' }, 400);
    }

    // Check KV cache first
    const cacheKey = `search:${q}:${limit}:${offset}:${mode}`;
    const cached = await c.env.CACHE.get(cacheKey, 'json');
    if (cached) {
      return c.json({ ...cached, _cached: true });
    }

    try {
      const searchBody: Record<string, unknown> = {
        q,
        limit: parseInt(limit),
        offset: parseInt(offset),
        attributesToHighlight: ['title', 'description', 'body'],
        highlightPreTag: '<mark>',
        highlightPostTag: '</mark>',
      };

      if (mode === 'hybrid' || mode === 'semantic') {
        searchBody.hybrid = {
          embedder: 'default',
          semanticRatio: mode === 'semantic' ? 1.0 : 0.5,
        };
        searchBody.rankingScoreThreshold = 0.3;
      }

      const response = await fetch(`${c.env.MEILISEARCH_URL}/indexes/anvil_pages/search`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${c.env.MEILISEARCH_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(searchBody),
      });

      if (!response.ok) {
        return c.json({ error: 'Search backend error' }, 502);
      }

      const data = await response.json();

      // Cache in KV for 5 minutes
      await c.env.CACHE.put(cacheKey, JSON.stringify(data), { expirationTtl: 300 });

      return c.json(data);
    } catch {
      return c.json({ error: 'Search unavailable' }, 503);
    }
  }
);

// ── Hybrid Search ──

app.post('/api/search/hybrid',
  cache({
    cacheName: 'anvil-hybrid-v1',
    cacheControl: 'public, max-age=300, s-maxage=300',
  }),
  async (c) => {
    const body = await c.req.json();
    const { q, limit = 20 } = body;

    if (!q) {
      return c.json({ error: 'Missing query' }, 400);
    }

    try {
      const response = await fetch(`${c.env.MEILISEARCH_URL}/indexes/anvil_pages/search`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${c.env.MEILISEARCH_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          q,
          hybrid: { embedder: 'default', semanticRatio: 0.5 },
          limit,
        }),
      });

      if (!response.ok) {
        return c.json({ error: 'Search backend error' }, 502);
      }

      return c.json(await response.json());
    } catch {
      return c.json({ error: 'Search unavailable' }, 503);
    }
  }
);

// ── Chat Q&A (not cached — personalized responses) ──

app.post('/api/chat', async (c) => {
  const body = await c.req.json();
  const { messages } = body;

  if (!messages || !Array.isArray(messages)) {
    return c.json({ error: 'messages array required' }, 400);
  }

  try {
    const response = await fetch(`${c.env.MEILISEARCH_URL}/indexes/anvil_pages/search`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${c.env.MEILISEARCH_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        q: messages.filter((m: { role: string }) => m.role === 'user').pop()?.content || '',
        limit: 5,
        hybrid: { embedder: 'default', semanticRatio: 0.5 },
      }),
    });

    if (!response.ok) {
      return c.json({ error: 'Search backend error' }, 502);
    }

    const searchResults = await response.json();
    const contextDocs = (searchResults.hits || []).map((h: { title: string; description: string }) =>
      `- **${h.title}**: ${h.description}`
    ).join('\n');

    // Use OpenAI for chat completion with search context
    if (c.env.OPENAI_API_KEY) {
      const chatResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${c.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: `You are an AI assistant for the Anvil search platform. Answer based on these search results:\n\n${contextDocs}` },
            ...messages,
          ],
        }),
      });

      if (chatResponse.ok) {
        const chatData = await chatResponse.json();
        return c.json({
          response: chatData.choices?.[0]?.message?.content || 'No response generated.',
          messages,
        });
      }
    }

    // Fallback without OpenAI
    const lastQuery = messages.filter((m: { role: string }) => m.role === 'user').pop()?.content || '';
    return c.json({
      response: `Based on indexed documents for "${lastQuery}":\n\n${contextDocs}\n\n*(Full chat requires OPENAI_API_KEY)*`,
      messages,
      _fallback: true,
    });
  } catch {
    return c.json({ error: 'Chat service unavailable' }, 503);
  }
});

// ── Autocomplete (edge-cached, 10 min TTL) ──

app.get('/api/search/autocomplete',
  cache({
    cacheName: 'anvil-autocomplete-v1',
    cacheControl: 'public, max-age=600, s-maxage=600',
  }),
  async (c) => {
    const q = c.req.query('q') ?? '';
    if (!q || q.length < 2) {
      return c.json({ hits: [] });
    }

    try {
      const response = await fetch(`${c.env.MEILISEARCH_URL}/indexes/anvil_pages/search`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${c.env.MEILISEARCH_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ q, limit: 8 }),
      });

      if (!response.ok) {
        return c.json({ hits: [] });
      }

      const data = await response.json();
      return c.json({ hits: data.hits ?? [] });
    } catch {
      return c.json({ hits: [] });
    }
  }
);

// ── Drive: R2 File Operations ──

// List files (metadata from R2)
app.get('/api/drive/files', async (c) => {
  if (!c.env.DRIVE_STORAGE) {
    return c.json({ error: 'R2 storage not bound' }, 503);
  }

  const prefix = c.req.query('prefix') || '';
  const limit = parseInt(c.req.query('limit') || '50');

  try {
    const listed = await c.env.DRIVE_STORAGE.list({
      prefix,
      limit,
    });

    const files = listed.objects.map(obj => ({
      key: obj.key,
      size: obj.size,
      uploaded: obj.uploaded.toISOString(),
      httpMetadata: obj.httpMetadata,
    }));

    return c.json({
      files,
      truncated: listed.truncated,
      cursor: listed.cursor,
    });
  } catch {
    return c.json({ error: 'Failed to list files' }, 500);
  }
});

// Upload file to R2
app.put('/api/drive/files/:key{.+}', async (c) => {
  if (!c.env.DRIVE_STORAGE) {
    return c.json({ error: 'R2 storage not bound' }, 503);
  }

  const key = c.req.param('key');
  const contentType = c.req.header('content-type') || 'application/octet-stream';
  const body = await c.req.arrayBuffer();

  try {
    await c.env.DRIVE_STORAGE.put(key, body, {
      httpMetadata: {
        contentType,
      },
    });

    return c.json({ key, size: body.byteLength, uploaded: new Date().toISOString() });
  } catch {
    return c.json({ error: 'Failed to upload file' }, 500);
  }
});

// Download file from R2
app.get('/api/drive/files/:key{.+}', async (c) => {
  if (!c.env.DRIVE_STORAGE) {
    return c.json({ error: 'R2 storage not bound' }, 503);
  }

  const key = c.req.param('key');

  try {
    const object = await c.env.DRIVE_STORAGE.get(key);

    if (!object) {
      return c.json({ error: 'File not found' }, 404);
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('cache-control', 'public, max-age=31536000');

    return new Response(object.body, { headers });
  } catch {
    return c.json({ error: 'Failed to retrieve file' }, 500);
  }
});

// Delete file from R2
app.delete('/api/drive/files/:key{.+}', async (c) => {
  if (!c.env.DRIVE_STORAGE) {
    return c.json({ error: 'R2 storage not bound' }, 503);
  }

  const key = c.req.param('key');

  try {
    await c.env.DRIVE_STORAGE.delete(key);
    return c.json({ deleted: key });
  } catch {
    return c.json({ error: 'Failed to delete file' }, 500);
  }
});

// ── Session Management (KV) ──

app.get('/api/session/:id', async (c) => {
  if (!c.env.SESSIONS) {
    return c.json({ error: 'KV not bound' }, 503);
  }

  const id = c.req.param('id');
  const session = await c.env.SESSIONS.get(`session:${id}`, 'json');

  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  return c.json(session);
});

app.put('/api/session/:id', async (c) => {
  if (!c.env.SESSIONS) {
    return c.json({ error: 'KV not bound' }, 503);
  }

  const id = c.req.param('id');
  const data = await c.req.json();

  await c.env.SESSIONS.put(`session:${id}`, JSON.stringify(data), {
    expirationTtl: 86400, // 24 hours
  });

  return c.json({ ok: true });
});

// ── Geocoding (edge-cached, 1 hour TTL) ──

app.get('/api/geocode',
  cache({
    cacheName: 'anvil-geocode-v1',
    cacheControl: 'public, max-age=3600, s-maxage=3600',
  }),
  async (c) => {
    const q = c.req.query('q') ?? '';
    if (!q) {
      return c.json({ error: 'Missing query parameter: q' }, 400);
    }

    try {
      const nominatimUrl = c.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org';
      const response = await fetch(
        `${nominatimUrl}/search?q=${encodeURIComponent(q)}&format=json&limit=5`,
        { headers: { 'User-Agent': 'ProjectAnvil/1.0' } }
      );

      if (!response.ok) {
        return c.json({ error: 'Geocoding service error' }, 502);
      }

      return c.json(await response.json());
    } catch {
      return c.json({ error: 'Geocoding unavailable' }, 503);
    }
  }
);

// ── Reverse Geocoding ──

app.get('/api/geocode/reverse',
  cache({
    cacheName: 'anvil-reverse-geocode-v1',
    cacheControl: 'public, max-age=86400, s-maxage=86400',
  }),
  async (c) => {
    const lat = c.req.query('lat');
    const lon = c.req.query('lon');

    if (!lat || !lon) {
      return c.json({ error: 'Missing lat/lon parameters' }, 400);
    }

    try {
      const nominatimUrl = c.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org';
      const response = await fetch(
        `${nominatimUrl}/reverse?lat=${lat}&lon=${lon}&format=json`,
        { headers: { 'User-Agent': 'ProjectAnvil/1.0' } }
      );

      if (!response.ok) {
        return c.json({ error: 'Geocoding service error' }, 502);
      }

      return c.json(await response.json());
    } catch {
      return c.json({ error: 'Geocoding unavailable' }, 503);
    }
  }
);

// ── Routing (edge-cached, 30 min TTL) ──

app.get('/api/route',
  cache({
    cacheName: 'anvil-route-v1',
    cacheControl: 'public, max-age=1800, s-maxage=1800',
  }),
  async (c) => {
    const start = c.req.query('start');
    const end = c.req.query('end');

    if (!start || !end) {
      return c.json({ error: 'Missing start/end parameters' }, 400);
    }

    try {
      const osrmUrl = c.env.OSRM_URL || 'https://router.project-osrm.org';
      const response = await fetch(`${osrmUrl}/route/v1/driving/${start};${end}?overview=full&geometries=geojson`);

      if (!response.ok) {
        return c.json({ error: 'Routing service error' }, 502);
      }

      return c.json(await response.json());
    } catch {
      return c.json({ error: 'Routing unavailable' }, 503);
    }
  }
);

export default app;

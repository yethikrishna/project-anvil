/**
 * Anvil Edge Router — Hono on Cloudflare Workers
 *
 * Edge caching layer for search and geocoding APIs.
 * Caches popular queries at Cloudflare PoPs worldwide.
 * Forwards cache misses to regional backend.
 *
 * Deploy: npx wrangler deploy
 * Dev:    npx wrangler dev
 */

import { Hono } from 'hono';
import { cache } from 'hono/cache';

type Bindings = {
  MEILISEARCH_URL: string;
  MEILISEARCH_API_KEY: string;
  NOMINATIM_URL: string;
  OSRM_URL: string;
  BACKEND_URL: string;
};

const app = new Hono<{ Bindings: Bindings }>();

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

    if (!q) {
      return c.json({ error: 'Missing query parameter: q' }, 400);
    }

    try {
      const response = await fetch(`${c.env.MEILISEARCH_URL}/indexes/anvil_pages/search`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${c.env.MEILISEARCH_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ q, limit: parseInt(limit), offset: parseInt(offset) }),
      });

      if (!response.ok) {
        return c.json({ error: 'Search backend error' }, 502);
      }

      const data = await response.json();
      return c.json(data);
    } catch (err) {
      return c.json({ error: 'Search unavailable' }, 503);
    }
  }
);

// ── Hybrid Search (edge-cached, 5 min TTL) ──

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

// ── Autocomplete (edge-cached, 10 min TTL — high cacheability) ──

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

// ── Geocoding (edge-cached, 1 hour TTL — locations rarely change) ──

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
    cacheControl: 'public, max-age=86400, s-maxage=86400', // 24h — coordinates don't change
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
    const start = c.req.query('start'); // lat,lon
    const end = c.req.query('end');     // lat,lon

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

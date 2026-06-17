/**
 * Anvil Chat — Service Worker
 *
 * Caching strategy:
 * - Static assets (JS/CSS/fonts): Cache First (long TTL)
 * - API routes (/api/attention, /api/ai-briefing): Network First with offline fallback
 * - Chat API (/api/chat): Network Only (streaming, never cache)
 * - Pages: Stale While Revalidate
 *
 * Offline capabilities:
 * - Conversation history (IndexedDB, no SW needed)
 * - Static UI shell (fully cached)
 * - Pending messages queue (outbox)
 */

const CACHE_VERSION = 'anvil-chat-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const API_CACHE = `${CACHE_VERSION}-api`;

const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  // Next.js static files are auto-hashed, so we use runtime caching
];

// ── Install ─────────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// ── Activate ────────────────────────────────────────────

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith('anvil-chat-') && k !== STATIC_CACHE && k !== API_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch ───────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never intercept: streaming endpoints, auth, hot reload
  if (
    url.pathname.startsWith('/api/chat') ||
    url.pathname.startsWith('/api/workflow') ||
    url.pathname.startsWith('/api/events') ||
    url.pathname.startsWith('/api/voice') ||
    url.pathname.includes('_next/webpack-hmr') ||
    url.pathname.includes('__nextjs') ||
    request.method !== 'GET'
  ) {
    return; // Let browser handle
  }

  // Static assets (_next/static): Cache First
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // API data endpoints: Network First with 5s timeout, fall back to cache
  if (
    url.pathname.startsWith('/api/attention') ||
    url.pathname.startsWith('/api/ai-briefing') ||
    url.pathname.startsWith('/api/weekly-summary') ||
    url.pathname.startsWith('/api/conversations')
  ) {
    event.respondWith(
      networkFirstWithFallback(request, API_CACHE, 5000)
    );
    return;
  }

  // Pages: Stale While Revalidate
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      staleWhileRevalidate(request, STATIC_CACHE)
    );
    return;
  }
});

// ── Strategies ──────────────────────────────────────────

async function networkFirstWithFallback(request, cacheName, timeoutMs) {
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Network timeout')), timeoutMs)
  );

  try {
    const response = await Promise.race([fetch(request), timeoutPromise]);
    if (response.ok) {
      const clone = response.clone();
      caches.open(cacheName).then((cache) => cache.put(request, clone));
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;

    // Offline fallback for API
    return new Response(
      JSON.stringify({ offline: true, error: 'You are offline. Showing cached data.', cached: true }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json', 'X-Anvil-Offline': 'true' },
      }
    );
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cached = await caches.match(request);

  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        const clone = response.clone();
        caches.open(cacheName).then((cache) => cache.put(request, clone));
      }
      return response;
    })
    .catch(() => null);

  return cached ?? (await fetchPromise) ?? offlineFallbackPage();
}

function offlineFallbackPage() {
  return new Response(
    `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Anvil AI — Offline</title>
      <style>
        body { font-family: system-ui; background: #0f0f14; color: #e5e5e5;
               display: flex; flex-direction: column; align-items: center;
               justify-content: center; min-height: 100vh; margin: 0; text-align: center; }
        h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
        p { color: #888; font-size: 0.875rem; max-width: 300px; }
        button { margin-top: 1.5rem; padding: 0.75rem 2rem; background: #4f46e5;
                 color: white; border: none; border-radius: 0.5rem; cursor: pointer;
                 font-size: 0.875rem; }
      </style>
    </head>
    <body>
      <h1>You're offline</h1>
      <p>Your past conversations are still available. Connect to the internet to send new messages.</p>
      <button onclick="location.reload()">Try Again</button>
    </body>
    </html>`,
    { headers: { 'Content-Type': 'text/html' } }
  );
}

// ── Push Notifications ──────────────────────────────────

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: 'Anvil AI', body: event.data.text() };
  }

  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Anvil AI', {
      body: data.body ?? '',
      icon: '/icons/icon-192x192.png',
      badge: '/icons/badge-72x72.png',
      data: { url: data.url ?? '/', conversationId: data.conversationId },
      actions: data.actions ?? [],
      requireInteraction: data.requireInteraction ?? false,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.postMessage({ type: 'NOTIFICATION_CLICK', url });
          return;
        }
      }
      clients.openWindow(url);
    })
  );
});

/**
 * smart-warmup.ts — Prefetch attention + briefing data on page load.
 *
 * Kicks off background fetches the moment the chat page loads.
 * Results are stored in memory so the first user query feels instant —
 * the AI engine can serve from cache instead of waiting on API calls.
 *
 * Architecture:
 * - On startup: fetch /api/quick-actions for instant status
 * - Pre-warm: fetch /api/attention so the badge shows immediately
 * - Pre-warm: fetch /api/ai-briefing so morning screen loads fast
 * - Cache: 5 minutes TTL, refreshed on focus
 */

interface WarmupCache {
  quickActions: Record<string, unknown> | null;
  attentionData: unknown | null;
  briefingData: unknown | null;
  lastFetched: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const cache: WarmupCache = {
  quickActions: null,
  attentionData: null,
  briefingData: null,
  lastFetched: 0,
};

let warmupPromise: Promise<void> | null = null;
let warmupScheduled = false;

async function runWarmup(userId = 'default'): Promise<void> {
  const now = Date.now();
  if (now - cache.lastFetched < CACHE_TTL_MS) return; // Fresh enough

  const fetches = [
    // Quick status for dashboard
    fetch('/api/quick-actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'unread_count', userId }),
      signal: AbortSignal.timeout(8_000),
    }).then(r => r.ok ? r.json() : null).then(data => {
      if (data) cache.quickActions = data as Record<string, unknown>;
    }).catch(() => {}),

    // Attention badge data
    fetch('/api/attention', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, limit: 10 }),
      signal: AbortSignal.timeout(12_000),
    }).then(r => r.ok ? r.json() : null).then(data => {
      if (data) cache.attentionData = data;
    }).catch(() => {}),

    // Morning briefing
    fetch(`/api/ai-briefing?userId=${encodeURIComponent(userId)}`, {
      signal: AbortSignal.timeout(20_000),
    }).then(r => r.ok ? r.json() : null).then(data => {
      if (data) cache.briefingData = data;
    }).catch(() => {}),
  ];

  await Promise.allSettled(fetches);
  cache.lastFetched = Date.now();
}

/**
 * Start background warmup. Safe to call multiple times — only runs once
 * per TTL window.
 */
export function startWarmup(userId = 'default'): void {
  if (warmupScheduled) return;
  warmupScheduled = true;

  // Small delay so we don't compete with initial render
  setTimeout(() => {
    warmupPromise = runWarmup(userId).finally(() => {
      warmupScheduled = false;
    });
  }, 800);
}

/**
 * Force a refresh (e.g., after user returns to tab).
 */
export function refreshWarmup(userId = 'default'): void {
  cache.lastFetched = 0; // Bust cache
  warmupScheduled = false;
  startWarmup(userId);
}

/**
 * Get cached quick-action data if fresh.
 */
export function getCachedQuickActions(): Record<string, unknown> | null {
  if (Date.now() - cache.lastFetched > CACHE_TTL_MS) return null;
  return cache.quickActions;
}

/**
 * Get cached attention data if fresh.
 */
export function getCachedAttention(): unknown {
  if (Date.now() - cache.lastFetched > CACHE_TTL_MS) return null;
  return cache.attentionData;
}

/**
 * Get cached briefing data if fresh.
 */
export function getCachedBriefing(): unknown {
  if (Date.now() - cache.lastFetched > CACHE_TTL_MS) return null;
  return cache.briefingData;
}

/**
 * Register a visibility-change handler to refresh when user returns to the tab.
 * Call once during app initialization.
 */
export function registerVisibilityRefresh(userId = 'default'): () => void {
  if (typeof document === 'undefined') return () => {};

  const handler = () => {
    if (document.visibilityState === 'visible') {
      const age = Date.now() - cache.lastFetched;
      if (age > CACHE_TTL_MS) {
        refreshWarmup(userId);
      }
    }
  };

  document.addEventListener('visibilitychange', handler);

  // Proactive scan poll — every 3 minutes while tab is visible
  let scanInterval: ReturnType<typeof setInterval> | null = null;

  async function runProactiveScan() {
    if (document.visibilityState !== 'visible') return;
    try {
      await fetch('/api/proactive-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch { /* ignore */ }
  }

  // First scan after 90s (let the page settle), then every 3 minutes
  const initialTimer = setTimeout(() => {
    runProactiveScan();
    scanInterval = setInterval(runProactiveScan, 3 * 60 * 1000);
  }, 90_000);

  return () => {
    document.removeEventListener('visibilitychange', handler);
    clearTimeout(initialTimer);
    if (scanInterval) clearInterval(scanInterval);
  };
}

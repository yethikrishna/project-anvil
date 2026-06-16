/**
 * useAttentionBadge — background scanner that fetches urgent attention items
 * and exposes a badge count + items list.
 *
 * Poll strategy:
 * - First fetch: immediate on mount
 * - Subsequent fetches: every POLL_INTERVAL_MS (default 5 min)
 * - Cached: server caches results for 5 min to avoid hammering Gmail/Calendar
 * - Pauses when document is hidden (tab not in focus)
 *
 * Returns:
 * - badgeCount: number of urgent items
 * - urgentItems: array of { label, priority, source }
 * - lastFetched: timestamp
 * - isLoading: boolean
 * - refresh(): manually trigger a re-fetch
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export interface AttentionItem {
  id: string;
  label: string;
  detail?: string;
  priority: 'critical' | 'high' | 'medium';
  source: 'mail' | 'calendar' | 'drive' | 'other';
  timestamp?: number;
  actionPrompt?: string;
}

interface UseAttentionBadgeOptions {
  userId?: string;
  pollIntervalMs?: number;
  /** Only fetch when enabled (e.g. after user is confirmed logged in) */
  enabled?: boolean;
}

interface UseAttentionBadgeReturn {
  badgeCount: number;
  urgentItems: AttentionItem[];
  lastFetched: number | null;
  isLoading: boolean;
  refresh: () => void;
}

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const ATTENTION_STORAGE_KEY = 'anvil:attention-cache';

function loadLocalCache(): { items: AttentionItem[]; fetchedAt: number } | null {
  try {
    const raw = sessionStorage.getItem(ATTENTION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { items: AttentionItem[]; fetchedAt: number };
    // Expire after 10 minutes in sessionStorage
    if (Date.now() - parsed.fetchedAt > 10 * 60 * 1000) return null;
    return parsed;
  } catch { return null; }
}

function saveLocalCache(items: AttentionItem[]): void {
  try {
    sessionStorage.setItem(ATTENTION_STORAGE_KEY, JSON.stringify({ items, fetchedAt: Date.now() }));
  } catch { /* ignore */ }
}

async function fetchAttentionItems(userId: string): Promise<AttentionItem[]> {
  // Check server-side cache first
  const cached = await fetch(`/api/memory?action=attention&userId=${userId}`).then(r => r.json()).catch(() => ({ cached: false })) as { cached: boolean; data?: unknown };

  if (cached.cached && Array.isArray((cached.data as { items?: unknown })?.items)) {
    return (cached.data as { items: AttentionItem[] }).items;
  }

  // Full attention scan via API
  const res = await fetch('/api/attention', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId,
      mode: 'badge', // lightweight mode: just counts + top items, no full digest
    }),
  });

  if (!res.ok) return [];

  const data = await res.json() as {
    items?: AttentionItem[];
    prioritized?: Array<{
      id?: string;
      title?: string;
      detail?: string;
      urgency?: string;
      category?: string;
      timestamp?: number;
    }>;
  };

  // Normalize response — attention API returns `prioritized` array
  if (data.prioritized) {
    const items: AttentionItem[] = data.prioritized.slice(0, 10).map((item, i) => ({
      id: item.id ?? `item-${i}`,
      label: item.title ?? 'Untitled',
      detail: item.detail,
      priority: (item.urgency === 'critical' ? 'critical'
        : item.urgency === 'high' ? 'high' : 'medium') as AttentionItem['priority'],
      source: (item.category === 'email' ? 'mail'
        : item.category === 'calendar' ? 'calendar'
        : item.category === 'drive' ? 'drive' : 'other') as AttentionItem['source'],
      timestamp: item.timestamp,
      actionPrompt: item.title ? `Tell me about: ${item.title}` : undefined,
    }));

    // Cache on server for other tabs/devices
    fetch('/api/memory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'cache_attention',
        userId,
        data: { items },
        ttlMs: 5 * 60 * 1000,
      }),
    }).catch(() => {});

    return items;
  }

  return data.items ?? [];
}

export function useAttentionBadge({
  userId = 'default',
  pollIntervalMs = POLL_INTERVAL_MS,
  enabled = true,
}: UseAttentionBadgeOptions = {}): UseAttentionBadgeReturn {
  const [urgentItems, setUrgentItems] = useState<AttentionItem[]>([]);
  const [lastFetched, setLastFetched] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fetchingRef = useRef(false);

  const doFetch = useCallback(async (force = false) => {
    if (!enabled || fetchingRef.current) return;

    // Check local sessionStorage cache first (unless forced)
    if (!force) {
      const cached = loadLocalCache();
      if (cached) {
        setUrgentItems(cached.items);
        setLastFetched(cached.fetchedAt);
        return;
      }
    }

    fetchingRef.current = true;
    setIsLoading(true);

    try {
      const items = await fetchAttentionItems(userId);
      setUrgentItems(items);
      setLastFetched(Date.now());
      saveLocalCache(items);
    } catch {
      // Silently fail — badge just stays empty
    } finally {
      fetchingRef.current = false;
      setIsLoading(false);
    }
  }, [enabled, userId]);

  const refresh = useCallback(() => doFetch(true), [doFetch]);

  // Initial fetch + poll setup
  useEffect(() => {
    if (!enabled) return;

    doFetch(false);

    timerRef.current = setInterval(() => {
      // Skip if tab is hidden
      if (document.hidden) return;
      doFetch(false);
    }, pollIntervalMs);

    // Also re-fetch when tab becomes visible after being hidden
    const handleVisibilityChange = () => {
      if (!document.hidden) doFetch(false);
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, pollIntervalMs, doFetch]);

  const badgeCount = urgentItems.filter(i => i.priority === 'critical' || i.priority === 'high').length;

  return { badgeCount, urgentItems, lastFetched, isLoading, refresh };
}

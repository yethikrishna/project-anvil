/**
 * useRealtimeEvents — React hook that connects to /api/events/stream (SSE)
 * and exposes live events to the UI.
 *
 * Usage:
 *   const { latestAlert, latestSuggestion } = useRealtimeEvents();
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import type { AttentionAlert, AISuggestion, BusEventType } from '@/lib/event-bus';

interface RealtimeState {
  latestAlert: AttentionAlert | null;
  latestSuggestion: AISuggestion | null;
  connected: boolean;
  lastEventTs: number;
  dismissAlert: () => void;
  dismissSuggestion: () => void;
}

export function useRealtimeEvents(): RealtimeState {
  const [latestAlert, setLatestAlert] = useState<AttentionAlert | null>(null);
  const [latestSuggestion, setLatestSuggestion] = useState<AISuggestion | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastEventTs, setLastEventTs] = useState(0);

  useEffect(() => {
    if (typeof EventSource === 'undefined') return;

    let source: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let lastId = '0';

    function connect() {
      source = new EventSource(`/api/events/stream`, { withCredentials: false });

      source.onopen = () => setConnected(true);

      source.onerror = () => {
        setConnected(false);
        source?.close();
        // Exponential backoff reconnect
        reconnectTimer = setTimeout(connect, 5_000);
      };

      // Handle specific event types
      const handlers: Partial<Record<BusEventType, (data: unknown) => void>> = {
        attention_alert: (data) => {
          setLatestAlert(data as AttentionAlert);
          setLastEventTs(Date.now());
        },
        ai_suggestion: (data) => {
          setLatestSuggestion(data as AISuggestion);
          setLastEventTs(Date.now());
        },
        briefing_refresh: () => {
          setLastEventTs(Date.now());
        },
      };

      for (const [type, handler] of Object.entries(handlers)) {
        source.addEventListener(type, (e: MessageEvent) => {
          lastId = e.lastEventId || lastId;
          try {
            handler(JSON.parse(e.data));
          } catch { /* malformed */ }
        });
      }
    }

    connect();

    return () => {
      source?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, []);

  const dismissAlert = useCallback(() => setLatestAlert(null), []);
  const dismissSuggestion = useCallback(() => setLatestSuggestion(null), []);

  return { latestAlert, latestSuggestion, connected, lastEventTs, dismissAlert, dismissSuggestion };
}

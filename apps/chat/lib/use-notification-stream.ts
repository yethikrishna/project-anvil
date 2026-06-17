/**
 * useNotificationStream — subscribes to /api/notifications/stream SSE.
 *
 * Returns:
 * - notifications: PushNotification[] queue (newest first)
 * - unreadCount: number of unread notifications
 * - markRead: dismiss/mark a notification as read
 * - clearAll: dismiss all notifications
 *
 * Reconnects automatically on disconnect.
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export interface PushNotification {
  id: string;
  type: 'email' | 'calendar' | 'tool_done' | 'ai_insight' | 'reminder';
  title: string;
  body: string;
  action?: string;
  urgency: 'critical' | 'high' | 'normal' | 'low';
  timestamp: number;
  read?: boolean;
}

interface StreamEvent {
  type: 'connected' | 'notification' | 'ping';
  payload?: PushNotification;
  timestamp?: number;
}

const MAX_NOTIFICATIONS = 20;
const RECONNECT_DELAY_MS = 5000;

export function useNotificationStream(enabled = true) {
  const [notifications, setNotifications] = useState<PushNotification[]>([]);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (!enabled || typeof window === 'undefined') return;

    const es = new EventSource('/api/notifications/stream');
    esRef.current = es;

    es.onopen = () => setConnected(true);

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as StreamEvent;
        if (data.type === 'notification' && data.payload) {
          setNotifications(prev => {
            // Deduplicate
            if (prev.some(n => n.id === data.payload!.id)) return prev;
            return [data.payload!, ...prev].slice(0, MAX_NOTIFICATIONS);
          });
        }
      } catch { /* malformed event */ }
    };

    es.onerror = () => {
      setConnected(false);
      es.close();
      esRef.current = null;

      // Reconnect after delay
      reconnectRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    connect();

    return () => {
      esRef.current?.close();
      esRef.current = null;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
    };
  }, [enabled, connect]);

  const markRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  return { notifications, connected, unreadCount, markRead, clearAll };
}

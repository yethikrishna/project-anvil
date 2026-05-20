'use client';

import { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';

// ── Types ──

export interface Notification {
  id: string;
  type: 'mail' | 'file_share' | 'doc_mention' | 'system' | 'comment';
  title: string;
  message: string;
  data?: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

export type NotificationEvent =
  | { event: 'initial'; payload: Notification[] }
  | { event: 'notification'; payload: Notification }
  | { event: 'notification_read'; payload: { ids: string[] } }
  | { event: 'notification_read_all'; payload: { ids: string[] } };

// ── Context ──

interface NotificationContextValue {
  notifications: Notification[];
  unreadCount: number;
  markRead: (ids: string[]) => void;
  markAllRead: () => void;
  connected: boolean;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within <NotificationProvider>');
  return ctx;
}

// ── Provider ──

export interface NotificationProviderProps {
  children: React.ReactNode;
  userId?: string;
  wsUrl?: string;
  apiUrl?: string;
}

export function NotificationProvider({
  children,
  userId,
  wsUrl = process.env.NEXT_PUBLIC_NOTIFICATIONS_WS ?? 'ws://localhost:4020/ws',
  apiUrl = process.env.NEXT_PUBLIC_NOTIFICATIONS_API ?? 'http://localhost:4020/api',
}: NotificationProviderProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();

  // WebSocket connection
  useEffect(() => {
    if (!userId) return;

    let disposed = false;

    function connect() {
      if (disposed) return;

      const url = `${wsUrl}?userId=${encodeURIComponent(userId)}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (disposed) return;
        setConnected(true);
      };

      ws.onmessage = (event) => {
        if (disposed) return;
        try {
          const data: NotificationEvent = JSON.parse(event.data);

          switch (data.event) {
            case 'initial':
              setNotifications(data.payload);
              break;
            case 'notification':
              setNotifications(prev => [data.payload, ...prev]);
              break;
            case 'notification_read':
              setNotifications(prev =>
                prev.map(n => data.payload.ids.includes(n.id) ? { ...n, read: true } : n)
              );
              break;
            case 'notification_read_all':
              setNotifications(prev => prev.map(n => ({ ...n, read: true })));
              break;
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        if (disposed) return;
        setConnected(false);
        // Reconnect after 3 seconds
        reconnectTimer.current = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      disposed = true;
      clearTimeout(reconnectTimer.current);
      ws.close();
    };
  }, [userId, wsUrl]);

  // Fallback: fetch from REST API on mount if no WS
  useEffect(() => {
    if (!userId || connected) return;
    fetch(`${apiUrl}/notifications?userId=${encodeURIComponent(userId)}`)
      .then(r => r.json())
      .then(data => {
        if (data.notifications) setNotifications(data.notifications);
      })
      .catch(() => {});
  }, [userId, apiUrl, connected]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markRead = useCallback(async (ids: string[]) => {
    setNotifications(prev =>
      prev.map(n => ids.includes(n.id) ? { ...n, read: true } : n)
    );
    try {
      await fetch(`${apiUrl}/notifications/read`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, ids }),
      });
    } catch {}
  }, [userId, apiUrl]);

  const markAllRead = useCallback(async () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    try {
      await fetch(`${apiUrl}/notifications/read-all`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
    } catch {}
  }, [userId, apiUrl]);

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, markRead, markAllRead, connected }}>
      {children}
    </NotificationContext.Provider>
  );
}

// ── Notification Bell Component ──

export interface NotificationBellProps {
  onClick?: () => void;
  className?: string;
}

export function NotificationBell({ onClick, className }: NotificationBellProps) {
  const { unreadCount } = useNotifications();

  return (
    <button
      onClick={onClick}
      className="relative p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
    >
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      {unreadCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
}

// ── Notification Dropdown Panel ──

export interface NotificationPanelProps {
  className?: string;
}

export function NotificationPanel({ className }: NotificationPanelProps) {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);

  const typeIcons: Record<string, string> = {
    mail: '✉️',
    file_share: '📁',
    doc_mention: '📝',
    system: '🔔',
    comment: '💬',
  };

  return (
    <div className="relative">
      <NotificationBell onClick={() => setOpen(o => !o)} />
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-50 w-96 max-h-[480px] overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Notifications</h3>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Mark all read
                </button>
              )}
            </div>
            <div className="overflow-y-auto max-h-[400px]">
              {notifications.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-gray-400">
                  No notifications
                </div>
              ) : (
                notifications.map(n => (
                  <div
                    key={n.id}
                    onClick={() => !n.read && markRead([n.id])}
                    className={cn(
                      'px-4 py-3 border-b border-gray-100 dark:border-gray-800 last:border-0',
                      'hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors',
                      !n.read && 'bg-blue-50/50 dark:bg-blue-900/10'
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-base mt-0.5">{typeIcons[n.type] ?? '🔔'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{n.title}</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400 truncate">{n.message}</div>
                        <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                          {new Date(n.createdAt).toLocaleString()}
                        </div>
                      </div>
                      {!n.read && (
                        <span className="w-2 h-2 rounded-full bg-blue-500 mt-2 shrink-0" />
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

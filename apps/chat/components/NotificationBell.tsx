/**
 * NotificationBell — header notification indicator + dropdown.
 *
 * Shows:
 * - Bell icon with unread count badge
 * - Dropdown with notification list
 * - Urgency-colored items (red = critical, orange = high)
 * - Click-to-action: clicking a notification sends a chat prompt
 * - Clear all button
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@anvil/ui';
import { useNotificationStream, type PushNotification } from '@/lib/use-notification-stream';

interface Props {
  onAction: (prompt: string) => void;
}

const URGENCY_STYLES: Record<PushNotification['urgency'], string> = {
  critical: 'border-l-2 border-red-500 bg-red-50 dark:bg-red-950/30',
  high: 'border-l-2 border-orange-500 bg-orange-50 dark:bg-orange-950/20',
  normal: 'border-l-2 border-blue-400 bg-blue-50/50 dark:bg-blue-950/20',
  low: 'border-l-0 bg-gray-50 dark:bg-gray-900/50',
};

const TYPE_ICONS: Record<PushNotification['type'], string> = {
  email: '📧',
  calendar: '📅',
  tool_done: '✅',
  ai_insight: '💡',
  reminder: '⏰',
};

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

export default function NotificationBell({ onAction }: Props) {
  const { notifications, unreadCount, markRead, clearAll } = useNotificationStream(true);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleClick = (n: PushNotification) => {
    markRead(n.id);
    if (n.action) {
      onAction(n.action);
      setOpen(false);
    }
  };

  const urgentCount = notifications.filter(n => !n.read && (n.urgency === 'critical' || n.urgency === 'high')).length;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(v => !v)}
        className={cn(
          'relative text-[11px] px-2.5 py-1 rounded-lg transition-colors',
          open
            ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300'
            : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500',
        )}
        title="Notifications"
      >
        🔔
        {unreadCount > 0 && (
          <span className={cn(
            'absolute -top-1 -right-1 min-w-[14px] h-3.5 rounded-full text-[9px] font-bold flex items-center justify-center px-0.5 text-white',
            urgentCount > 0 ? 'bg-red-500' : 'bg-indigo-500',
          )}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-80 bg-white dark:bg-gray-950 rounded-xl border border-gray-200 dark:border-gray-800 shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 dark:border-gray-800">
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
              Notifications
              {unreadCount > 0 && (
                <span className="ml-1.5 text-[10px] bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 px-1.5 py-0.5 rounded-full">
                  {unreadCount} new
                </span>
              )}
            </span>
            {notifications.length > 0 && (
              <button
                onClick={clearAll}
                className="text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                Clear all
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 gap-2">
                <span className="text-2xl opacity-40">🔔</span>
                <p className="text-xs text-gray-400">No notifications yet</p>
              </div>
            )}

            {notifications.map(n => (
              <div
                key={n.id}
                onClick={() => handleClick(n)}
                className={cn(
                  'px-4 py-3 cursor-pointer hover:brightness-95 dark:hover:brightness-110 transition-all',
                  URGENCY_STYLES[n.urgency],
                  n.read && 'opacity-60',
                )}
              >
                <div className="flex items-start gap-2">
                  <span className="text-sm shrink-0 mt-0.5">{TYPE_ICONS[n.type]}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <p className={cn(
                        'text-xs font-medium truncate',
                        n.read ? 'text-gray-500 dark:text-gray-400' : 'text-gray-800 dark:text-gray-200',
                      )}>
                        {n.title}
                      </p>
                      <span className="text-[9px] text-gray-400 shrink-0">{timeAgo(n.timestamp)}</span>
                    </div>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                      {n.body}
                    </p>
                    {n.action && !n.read && (
                      <p className="text-[10px] text-indigo-600 dark:text-indigo-400 mt-1 font-medium">
                        Tap to act →
                      </p>
                    )}
                  </div>
                  {!n.read && (
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0 mt-1" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

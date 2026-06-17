/**
 * AttentionToast — ambient notification for real-time alerts.
 *
 * Appears as a slide-in card at the bottom-right when:
 * - An urgent email arrives (attention_alert event)
 * - A meeting is starting in < 5 minutes
 * - AI has a proactive suggestion ready
 *
 * Features:
 * - Auto-dismiss after 8 seconds (with progress bar)
 * - "Act now" button sends the action prompt directly to chat
 * - Stacks up to 3 toasts (oldest auto-dismissed)
 * - Respects user's do-not-disturb hours (22:00–08:00)
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { cn } from '@anvil/ui';
import type { AttentionAlert } from '@/lib/event-bus';

const AUTO_DISMISS_MS = 8_000;

interface Toast {
  id: string;
  type: 'alert' | 'suggestion' | 'meeting';
  icon: string;
  title: string;
  body: string;
  actionLabel?: string;
  actionPrompt?: string;
  priority?: 'urgent' | 'high' | 'medium';
}

interface Props {
  alert: AttentionAlert | null;
  onAction: (prompt: string) => void;
  onDismiss: () => void;
}

function ToastCard({
  toast,
  onAction,
  onDismiss,
}: {
  toast: Toast;
  onAction: (prompt: string) => void;
  onDismiss: () => void;
}) {
  const [progress, setProgress] = useState(100);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef(Date.now());

  useEffect(() => {
    startRef.current = Date.now();
    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      const remaining = Math.max(0, 100 - (elapsed / AUTO_DISMISS_MS) * 100);
      setProgress(remaining);
      if (remaining === 0) {
        clearInterval(intervalRef.current!);
        onDismiss();
      }
    }, 50);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [onDismiss]);

  const priorityColors = {
    urgent: 'border-red-400 dark:border-red-600',
    high: 'border-orange-400 dark:border-orange-600',
    medium: 'border-blue-400 dark:border-blue-600',
  };

  return (
    <div className={cn(
      'relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border overflow-hidden',
      'w-80 animate-in slide-in-from-right duration-300',
      priorityColors[toast.priority ?? 'medium'],
    )}>
      {/* Progress bar */}
      <div className="absolute top-0 left-0 h-0.5 bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-50"
           style={{ width: `${progress}%` }} />

      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xl">{toast.icon}</span>
            <span className="text-xs font-bold text-gray-700 dark:text-gray-200">{toast.title}</span>
          </div>
          <button
            onClick={onDismiss}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xs leading-none mt-0.5"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <p className="text-xs text-gray-600 dark:text-gray-400 leading-snug mb-3">
          {toast.body}
        </p>

        {/* Action */}
        {toast.actionPrompt && (
          <button
            onClick={() => {
              onAction(toast.actionPrompt!);
              onDismiss();
            }}
            className={cn(
              'w-full text-xs font-semibold py-1.5 px-3 rounded-lg transition-colors',
              toast.priority === 'urgent'
                ? 'bg-red-500 hover:bg-red-600 text-white'
                : 'bg-indigo-500 hover:bg-indigo-600 text-white',
            )}
          >
            {toast.actionLabel ?? 'Handle now →'}
          </button>
        )}
      </div>
    </div>
  );
}

export default function AttentionToast({ alert, onAction, onDismiss }: Props) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Add new toast when alert changes
  useEffect(() => {
    if (!alert) return;

    // Check DND hours (22:00–08:00)
    const hour = new Date().getHours();
    if (hour >= 22 || hour < 8) return;

    const toast: Toast = {
      id: crypto.randomUUID(),
      type: 'alert',
      icon: alert.priority === 'urgent' ? '🚨' : '📬',
      title: alert.priority === 'urgent' ? 'Urgent email' : 'Important email',
      body: `${alert.from.split('<')[0].trim()}: ${alert.subject}`,
      actionLabel: 'Draft reply →',
      actionPrompt: alert.actionPrompt,
      priority: alert.priority,
    };

    setToasts(prev => {
      // Max 3 toasts at once
      const next = [...prev, toast];
      return next.slice(-3);
    });
  }, [alert]);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    onDismiss();
  }, [onDismiss]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map(toast => (
        <div key={toast.id} className="pointer-events-auto">
          <ToastCard
            toast={toast}
            onAction={onAction}
            onDismiss={() => dismissToast(toast.id)}
          />
        </div>
      ))}
    </div>
  );
}

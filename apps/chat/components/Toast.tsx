/**
 * Toast notifications for the chat app.
 *
 * Lightweight notification system for:
 * - Tool execution results (success/error)
 * - Approval confirmations
 * - Background action completion
 * - System messages
 *
 * Uses a global event bus so any component can dispatch toasts.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn } from '@anvil/ui';

// ── Types ──

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning' | 'tool';
  title: string;
  description?: string;
  duration?: number;
  action?: { label: string; onClick: () => void };
}

type ToastListener = (toast: Toast) => void;

// ── Global event bus ──

const listeners = new Set<ToastListener>();

export function dispatchToast(toast: Omit<Toast, 'id'>) {
  const fullToast: Toast = { ...toast, id: crypto.randomUUID() };
  listeners.forEach(fn => fn(fullToast));
}

export function toastSuccess(title: string, description?: string) {
  dispatchToast({ type: 'success', title, description, duration: 3000 });
}

export function toastError(title: string, description?: string) {
  dispatchToast({ type: 'error', title, description, duration: 5000 });
}

export function toastInfo(title: string, description?: string) {
  dispatchToast({ type: 'info', title, description, duration: 4000 });
}

export function toastTool(title: string, description?: string) {
  dispatchToast({ type: 'tool', title, description, duration: 4000 });
}

// ── Hook ──

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const handler: ToastListener = (toast) => {
      setToasts(prev => [...prev, toast]);

      // Auto-dismiss
      const duration = toast.duration ?? 3000;
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== toast.id));
      }, duration);
    };

    listeners.add(handler);
    return () => { listeners.delete(handler); };
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return { toasts, dismiss };
}

// ── Icons ──

const TYPE_ICONS = {
  success: '✓',
  error: '✗',
  info: 'ℹ',
  warning: '⚠',
  tool: '🔧',
};

const TYPE_COLORS = {
  success: 'border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-950 text-green-800 dark:text-green-200',
  error: 'border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-950 text-red-800 dark:text-red-200',
  info: 'border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-950 text-blue-800 dark:text-blue-200',
  warning: 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950 text-amber-800 dark:text-amber-200',
  tool: 'border-purple-300 bg-purple-50 dark:border-purple-700 dark:bg-purple-950 text-purple-800 dark:text-purple-200',
};

// ── Component ──

export function ToastContainer() {
  const { toasts, dismiss } = useToasts();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-20 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={cn(
            'rounded-lg border p-3 shadow-lg text-sm animate-slideIn',
            TYPE_COLORS[toast.type],
          )}
          style={{
            animation: 'slideIn 0.2s ease-out',
          }}
        >
          <div className="flex items-start gap-2">
            <span className="text-base shrink-0">{TYPE_ICONS[toast.type]}</span>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-xs">{toast.title}</p>
              {toast.description && (
                <p className="text-[11px] mt-0.5 opacity-80">{toast.description}</p>
              )}
            </div>
            <button
              onClick={() => dismiss(toast.id)}
              className="text-xs opacity-50 hover:opacity-100 shrink-0"
            >
              ✕
            </button>
          </div>

          {toast.action && (
            <button
              onClick={toast.action.onClick}
              className="mt-2 text-xs font-medium underline underline-offset-2"
            >
              {toast.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

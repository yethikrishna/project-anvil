/**
 * ConversationExportMenu — dropdown menu for exporting conversations.
 *
 * Renders inline in the conversation header toolbar.
 * Downloads the file directly in the browser.
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@anvil/ui';
import type { ExportFormat } from '@/lib/conversation-export';

const FORMATS: Array<{ id: ExportFormat; label: string; icon: string; desc: string }> = [
  { id: 'markdown', label: 'Markdown', icon: '📝', desc: '.md — readable anywhere' },
  { id: 'html', label: 'HTML', icon: '🌐', desc: '.html — styled for sharing' },
  { id: 'text', label: 'Plain text', icon: '📃', desc: '.txt — simple transcript' },
  { id: 'json', label: 'JSON', icon: '💾', desc: '.json — full data backup' },
];

interface Props {
  conversationId: string;
  conversationTitle: string;
  userId?: string;
  className?: string;
}

export default function ConversationExportMenu({
  conversationId,
  conversationTitle,
  userId = 'default',
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  async function handleExport(format: ExportFormat) {
    setExporting(format);
    setOpen(false);
    try {
      const res = await fetch('/api/conversations/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, format, userId }),
      });

      if (!res.ok) throw new Error('Export failed');

      // Trigger browser download
      const blob = await res.blob();
      const contentDisposition = res.headers.get('content-disposition') ?? '';
      const filenameMatch = contentDisposition.match(/filename="([^"]+)"/);
      const filename = filenameMatch?.[1] ?? `conversation.${format === 'markdown' ? 'md' : format}`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Silent fail — user can retry
    } finally {
      setExporting(null);
    }
  }

  return (
    <div ref={menuRef} className={cn('relative', className)}>
      <button
        onClick={() => setOpen(prev => !prev)}
        className={cn(
          'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors',
          'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200',
          'hover:bg-gray-100 dark:hover:bg-gray-800',
          open && 'bg-gray-100 dark:bg-gray-800',
        )}
        title="Export conversation"
      >
        <span>⬇️</span>
        <span>Export</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-52 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              Export as
            </p>
          </div>
          {FORMATS.map(fmt => (
            <button
              key={fmt.id}
              onClick={() => handleExport(fmt.id)}
              disabled={exporting !== null}
              className={cn(
                'w-full flex items-start gap-2.5 px-3 py-2.5 text-left transition-colors',
                'hover:bg-gray-50 dark:hover:bg-gray-800/60',
                exporting === fmt.id && 'opacity-50',
              )}
            >
              <span className="text-sm shrink-0 mt-0.5">{fmt.icon}</span>
              <div>
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                  {exporting === fmt.id ? 'Exporting…' : fmt.label}
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5">{fmt.desc}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

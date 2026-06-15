/**
 * SaveToDocsModal — quick modal to save AI-generated content to a Drive Doc.
 *
 * Lets the user:
 * - Name the document
 * - Pick a folder (optional)
 * - Preview the content (truncated)
 * - Save via POST /api/find-share (document_write tool)
 */

'use client';

import { useState } from 'react';
import { toastSuccess, toastError } from './Toast';

interface Props {
  content: string;
  onClose: () => void;
}

export default function SaveToDocsModal({ content, onClose }: Props) {
  const [title, setTitle] = useState('Anvil Notes — ' + new Date().toLocaleDateString());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/find-share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_doc',
          title: title.trim(),
          content,
        }),
      });
      if (!res.ok) throw new Error('Failed to save');
      const data = await res.json();
      setSaved(true);
      toastSuccess(`Saved "${title}" to Drive`);
      if (data.url) {
        window.open(data.url, '_blank', 'noopener');
      }
      setTimeout(onClose, 1500);
    } catch {
      toastError('Failed to save to Docs');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="font-semibold text-sm flex items-center gap-2">
            📄 Save to Docs
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
        </div>

        <div className="p-4 space-y-3">
          {/* Title */}
          <div>
            <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">
              Document title
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Document title..."
            />
          </div>

          {/* Content preview */}
          <div>
            <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">
              Content preview
            </label>
            <div className="p-3 rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 text-xs text-gray-600 dark:text-gray-400 max-h-40 overflow-y-auto leading-relaxed font-mono whitespace-pre-wrap">
              {content.length > 800 ? content.slice(0, 800) + '\n…' : content}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={handleSave}
            disabled={saving || !title.trim() || saved}
            className="text-xs px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
          >
            {saved ? '✓ Saved' : saving ? 'Saving...' : '💾 Save to Drive'}
          </button>
          <button
            onClick={onClose}
            className="text-xs px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 font-medium transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

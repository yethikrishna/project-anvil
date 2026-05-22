/**
 * DraftPreviewModal — preview and edit AI-generated email drafts.
 *
 * Features:
 * - Rich preview of To, Subject, CC, Body
 * - Inline editing of all fields
 * - Tone selector (professional, friendly, casual, formal)
 * - Send or save as draft
 * - Regenerate with different tone
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import type { DraftReply } from '@/lib/types';
import { toastSuccess, toastError } from './Toast';

interface Props {
  threadId?: string;
  initialDraft?: DraftReply;
  onClose: () => void;
  onSend?: (draft: DraftReply) => void;
}

const TONES = [
  { id: 'professional', label: 'Professional', icon: '👔' },
  { id: 'friendly', label: 'Friendly', icon: '😊' },
  { id: 'casual', label: 'Casual', icon: '🤙' },
  { id: 'formal', label: 'Formal', icon: '📜' },
] as const;

export default function DraftPreviewModal({ threadId, initialDraft, onClose, onSend }: Props) {
  const [draft, setDraft] = useState<DraftReply>(initialDraft ?? {
    to: '',
    subject: '',
    body: '',
    tone: 'professional',
  });
  const [loading, setLoading] = useState(!initialDraft && !!threadId);
  const [sending, setSending] = useState(false);
  const [tone, setTone] = useState<DraftReply['tone']>(draft.tone ?? 'professional');

  // Generate draft from thread if no initial draft
  const generateDraft = useCallback(async () => {
    if (!threadId) return;
    setLoading(true);
    try {
      const res = await fetch('/api/draft-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId, tone }),
      });
      if (!res.ok) throw new Error('Failed to generate draft');
      const data = await res.json();
      setDraft(data.draft);
    } catch (err) {
      toastError('Failed to generate draft');
    } finally {
      setLoading(false);
    }
  }, [threadId, tone]);

  useEffect(() => {
    if (!initialDraft && threadId) generateDraft();
  }, [initialDraft, threadId, generateDraft]);

  const handleToneChange = async (newTone: DraftReply['tone']) => {
    setTone(newTone);
    if (threadId) {
      await generateDraft();
    }
  };

  const handleSend = async () => {
    setSending(true);
    try {
      const res = await fetch('/api/draft-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId,
          tone,
          action: 'send',
          ...draft,
        }),
      });
      if (!res.ok) throw new Error('Failed to send');
      toastSuccess('Email sent');
      onSend?.(draft);
      onClose();
    } catch {
      toastError('Failed to send email');
    } finally {
      setSending(false);
    }
  };

  const handleSaveDraft = async () => {
    setSending(true);
    try {
      const res = await fetch('/api/draft-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId,
          tone,
          action: 'save',
          ...draft,
        }),
      });
      if (!res.ok) throw new Error('Failed to save draft');
      toastSuccess('Draft saved');
      onClose();
    } catch {
      toastError('Failed to save draft');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <h2 className="font-semibold text-sm flex items-center gap-2">
            ✉️ Email Draft
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        {/* Tone selector */}
        <div className="flex gap-1.5 px-4 py-2.5 border-b border-gray-100 dark:border-gray-800 shrink-0">
          {TONES.map(t => (
            <button
              key={t.id}
              onClick={() => handleToneChange(t.id)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                tone === t.id
                  ? 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                  : 'bg-gray-50 dark:bg-gray-800 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Form */}
        {loading ? (
          <div className="p-8 text-center">
            <div className="flex justify-center gap-1 mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <p className="text-sm text-gray-400">Generating draft reply...</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <div>
              <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">To</label>
              <input
                type="email"
                value={draft.to}
                onChange={(e) => setDraft({ ...draft, to: e.target.value })}
                className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 mt-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Subject</label>
              <input
                type="text"
                value={draft.subject}
                onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
                className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 mt-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Body</label>
              <textarea
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                rows={10}
                className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 mt-1 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y min-h-[200px] font-mono"
              />
            </div>

            {draft.body && (
              <div>
                <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Preview</label>
                <div className="mt-1 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm whitespace-pre-wrap leading-relaxed">
                  {draft.body}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 p-4 border-t border-gray-200 dark:border-gray-700 shrink-0">
          <button
            onClick={handleSend}
            disabled={sending || loading || !draft.to || !draft.body}
            className="text-xs px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
          >
            {sending ? 'Sending...' : '📤 Send'}
          </button>
          <button
            onClick={handleSaveDraft}
            disabled={sending || loading || !draft.body}
            className="text-xs px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 font-medium transition-colors"
          >
            💾 Save Draft
          </button>
          <button
            onClick={generateDraft}
            disabled={loading}
            className="text-xs px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 font-medium transition-colors ml-auto"
          >
            🔄 Regenerate
          </button>
        </div>
      </div>
    </div>
  );
}

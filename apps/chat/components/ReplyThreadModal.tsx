/**
 * ReplyThreadModal — Review and send/discard an AI-drafted email reply.
 *
 * Triggered when the AI calls email_reply with send=false (draft mode).
 * Shows:
 * - The original thread snippet (last 2 messages)
 * - AI-drafted reply (editable)
 * - Send / Save to Drafts / Discard actions
 *
 * The modal integrates with the tool approval system — clicking "Send"
 * re-triggers the email_reply tool with send=true.
 */

'use client';

import React, { useState, useRef, useEffect } from 'react';

export interface ReplyDraft {
  threadId: string;
  to: string;
  subject: string;
  body: string;
  tone: string;
  threadSnippet?: string;
}

interface ReplyThreadModalProps {
  draft: ReplyDraft;
  onSend: (body: string) => void;
  onSaveDraft: (body: string) => void;
  onDiscard: () => void;
}

export function ReplyThreadModal({ draft, onSend, onSaveDraft, onDiscard }: ReplyThreadModalProps) {
  const [body, setBody] = useState(draft.body);
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
    // Auto-resize textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, []);

  function handleInput() {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }

  async function handleSend() {
    setSending(true);
    try {
      onSend(body);
    } finally {
      setSending(false);
    }
  }

  const TONE_COLORS: Record<string, string> = {
    professional: 'bg-blue-500/20 text-blue-300',
    casual: 'bg-green-500/20 text-green-300',
    brief: 'bg-yellow-500/20 text-yellow-300',
    formal: 'bg-purple-500/20 text-purple-300',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onDiscard} />

      <div className="relative w-full max-w-xl bg-[#0f1117] border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
          <div>
            <h2 className="text-sm font-semibold text-white">Draft Reply</h2>
            <p className="text-xs text-white/40 mt-0.5 truncate max-w-xs">{draft.subject}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TONE_COLORS[draft.tone] ?? 'bg-white/10 text-white/50'}`}>
              {draft.tone ?? 'professional'}
            </span>
            <button onClick={onDiscard} className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/8 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* To / Subject */}
        <div className="px-5 py-3 border-b border-white/8 space-y-1.5 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-white/30 w-12">To</span>
            <span className="text-white/80 font-medium">{draft.to}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-white/30 w-12">Subject</span>
            <span className="text-white/80">{draft.subject}</span>
          </div>
        </div>

        {/* Thread snippet */}
        {draft.threadSnippet && (
          <div className="mx-5 mt-4 px-3 py-2.5 bg-white/4 border border-white/8 rounded-lg">
            <div className="text-xs text-white/30 mb-1.5 font-medium uppercase tracking-wide">Previous message</div>
            <p className="text-xs text-white/50 leading-relaxed line-clamp-3">{draft.threadSnippet}</p>
          </div>
        )}

        {/* Reply body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="text-xs text-white/30 mb-2 font-medium uppercase tracking-wide">Your reply (editable)</div>
          <textarea
            ref={textareaRef}
            value={body}
            onChange={e => setBody(e.target.value)}
            onInput={handleInput}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white/90 placeholder-white/25 outline-none focus:border-blue-500/50 focus:bg-white/8 resize-none transition-colors min-h-[120px]"
            placeholder="Write your reply…"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-white/8 bg-black/20">
          <button
            onClick={onDiscard}
            className="px-4 py-2 text-sm text-white/40 hover:text-white/70 transition-colors"
          >
            Discard
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onSaveDraft(body)}
              className="px-4 py-2 text-sm bg-white/8 hover:bg-white/12 text-white/70 hover:text-white rounded-lg transition-colors border border-white/10"
            >
              Save to Drafts
            </button>
            <button
              onClick={handleSend}
              disabled={sending || !body.trim()}
              className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/40 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              {sending ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Sending…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                  Send Reply
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ReplyThreadModal;

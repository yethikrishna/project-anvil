/**
 * SmartCompose — AI-powered email composition overlay.
 *
 * Not just a draft box — a full email co-pilot:
 * 1. Infers recipient from context
 * 2. Suggests subject from conversation
 * 3. Generates draft body with AI
 * 4. Surfaces relevant context (prior emails, calendar, files)
 * 5. Saves to Gmail drafts or sends directly
 * 6. Supports inline editing with AI refinement commands
 *
 * Triggered by "Compose email", "Email X about Y", or clicking Draft Reply.
 */

'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { cn } from '@anvil/ui';
import type { ChatMessage } from '@/lib/types';

interface SmartComposeProps {
  messages: ChatMessage[];
  initialDraft?: {
    to?: string;
    subject?: string;
    body?: string;
  };
  onSend: (prompt: string) => void;
  onClose: () => void;
}

interface DraftState {
  to: string;
  subject: string;
  body: string;
}

type GenerateStep = 'idle' | 'analyzing' | 'drafting' | 'done' | 'error';

const REFINE_COMMANDS = [
  { label: 'Make shorter', prompt: 'Make this email shorter and more concise.' },
  { label: 'More formal', prompt: 'Make this email more formal and professional.' },
  { label: 'More friendly', prompt: 'Make this email warmer and friendlier.' },
  { label: 'Add urgency', prompt: 'Add a sense of urgency to this email.' },
  { label: 'Add bullet points', prompt: 'Convert the key points into a bullet list.' },
  { label: 'Add deadline', prompt: 'Add a clear deadline or call-to-action.' },
];

async function generateDraft(
  messages: ChatMessage[],
  initialDraft: SmartComposeProps['initialDraft'],
  onProgress: (step: GenerateStep, partial?: string) => void,
): Promise<DraftState> {
  onProgress('analyzing');

  const context = messages
    .filter(m => m.role !== 'system')
    .slice(-10)
    .map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content}`)
    .join('\n\n');

  const res = await fetch('/api/draft-reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      context,
      to: initialDraft?.to ?? '',
      subject: initialDraft?.subject ?? '',
      hint: 'Generate a professional email draft based on the conversation context.',
    }),
  });

  if (!res.ok) throw new Error('Draft generation failed');

  onProgress('drafting');
  const data = await res.json() as { to?: string; subject?: string; body?: string; draft?: string };

  onProgress('done');

  return {
    to: data.to ?? initialDraft?.to ?? '',
    subject: data.subject ?? initialDraft?.subject ?? '',
    body: data.body ?? data.draft ?? '',
  };
}

async function refineDraft(
  current: DraftState,
  command: string,
): Promise<string> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [
        {
          role: 'user',
          content: `Here is an email draft:\n\nTo: ${current.to}\nSubject: ${current.subject}\n\n${current.body}\n\n${command} Return only the refined email body, no explanation.`,
        },
      ],
      stream: false,
    }),
  });
  if (!res.ok) throw new Error('Refinement failed');
  const data = await res.json() as { message?: string; content?: string };
  return data.message ?? data.content ?? current.body;
}

export default function SmartCompose({ messages, initialDraft, onSend, onClose }: SmartComposeProps) {
  const [draft, setDraft] = useState<DraftState>({
    to: initialDraft?.to ?? '',
    subject: initialDraft?.subject ?? '',
    body: initialDraft?.body ?? '',
  });
  const [step, setStep] = useState<GenerateStep>('idle');
  const [refining, setRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // Auto-generate on open if no initial body
  useEffect(() => {
    if (!initialDraft?.body && messages.length > 2) {
      handleGenerate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGenerate = useCallback(async () => {
    setError(null);
    try {
      const result = await generateDraft(messages, initialDraft, (s) => setStep(s));
      setDraft(result);
    } catch {
      setStep('error');
      setError('Could not generate draft. Try again or write manually.');
    }
  }, [messages, initialDraft]);

  const handleRefine = useCallback(async (command: string) => {
    if (refining) return;
    setRefining(true);
    try {
      const refined = await refineDraft(draft, command);
      setDraft(prev => ({ ...prev, body: refined }));
    } catch {
      setError('Refinement failed. Try again.');
    } finally {
      setRefining(false);
    }
  }, [draft, refining]);

  const handleSaveDraft = useCallback(() => {
    const prompt = `Save this email as a draft in Gmail:
To: ${draft.to}
Subject: ${draft.subject}

${draft.body}`;
    onSend(prompt);
    onClose();
  }, [draft, onSend, onClose]);

  const handleSendNow = useCallback(() => {
    const prompt = `Send this email now:
To: ${draft.to}
Subject: ${draft.subject}

${draft.body}`;
    onSend(prompt);
    onClose();
  }, [draft, onSend, onClose]);

  const isGenerating = step === 'analyzing' || step === 'drafting';
  const stepLabels: Record<GenerateStep, string> = {
    idle: '',
    analyzing: 'Analyzing conversation…',
    drafting: 'Writing email…',
    done: '',
    error: '',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-white dark:bg-gray-950 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <span>✉️</span>
            <span className="font-semibold text-gray-800 dark:text-gray-200">Smart Compose</span>
            {isGenerating && (
              <span className="text-xs text-indigo-500 animate-pulse">{stepLabels[step]}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              ↻ Regenerate
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">✕</button>
          </div>
        </div>

        {/* Fields */}
        <div className="flex flex-col gap-0 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-3 px-5 py-2.5 border-b border-gray-100 dark:border-gray-800">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 w-16 shrink-0">To</label>
            <input
              type="text"
              value={draft.to}
              onChange={e => setDraft(prev => ({ ...prev, to: e.target.value }))}
              placeholder="recipient@example.com"
              className="flex-1 text-sm bg-transparent outline-none text-gray-800 dark:text-gray-200 placeholder-gray-400"
            />
          </div>
          <div className="flex items-center gap-3 px-5 py-2.5">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 w-16 shrink-0">Subject</label>
            <input
              type="text"
              value={draft.subject}
              onChange={e => setDraft(prev => ({ ...prev, subject: e.target.value }))}
              placeholder="Email subject"
              className="flex-1 text-sm bg-transparent outline-none text-gray-800 dark:text-gray-200 placeholder-gray-400"
            />
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden relative">
          {isGenerating && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-gray-950/80 z-10">
              <div className="flex flex-col items-center gap-3">
                <div className="flex gap-1.5">
                  {[0, 150, 300].map(d => (
                    <span key={d} className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: `${d}ms` }} />
                  ))}
                </div>
                <p className="text-sm text-gray-500">{stepLabels[step]}</p>
              </div>
            </div>
          )}
          {refining && (
            <div className="absolute top-2 right-3 z-10">
              <span className="text-[10px] text-indigo-500 animate-pulse">Refining…</span>
            </div>
          )}
          <textarea
            ref={bodyRef}
            value={draft.body}
            onChange={e => setDraft(prev => ({ ...prev, body: e.target.value }))}
            placeholder="Email body will appear here…"
            className="w-full h-full min-h-48 p-5 text-sm bg-transparent outline-none resize-none text-gray-800 dark:text-gray-200 placeholder-gray-400 font-mono leading-relaxed"
          />
        </div>

        {error && (
          <div className="px-5 py-2 border-t border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30">
            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Refine commands */}
        <div className="px-5 py-2.5 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-gray-400 shrink-0">Refine:</span>
            {REFINE_COMMANDS.map(cmd => (
              <button
                key={cmd.label}
                onClick={() => handleRefine(cmd.prompt)}
                disabled={refining || isGenerating}
                className="text-[10px] px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-800 transition-colors disabled:opacity-40"
              >
                {cmd.label}
              </button>
            ))}
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-gray-200 dark:border-gray-800">
          <div className="text-[11px] text-gray-400">
            {draft.body ? `${draft.body.split(/\s+/).length} words` : 'No content'}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveDraft}
              disabled={!draft.body || isGenerating}
              className="text-xs px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              Save to drafts
            </button>
            <button
              onClick={handleSendNow}
              disabled={!draft.to || !draft.body || isGenerating}
              className="text-xs px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 font-medium"
            >
              Send now →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

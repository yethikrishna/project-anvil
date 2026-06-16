/**
 * ProactiveNotifications — surfaces pending AI commitments as action items.
 *
 * When the AI says "I'll send the email" or "I'll schedule that meeting",
 * this component captures those commitments and shows them as chips
 * the user can click to execute the promised action.
 *
 * This bridges the gap between "AI said it would do X" and actually doing X.
 */

'use client';

import { useState, useEffect } from 'react';
import { cn } from '@anvil/ui';
import { extractCommitments } from '@/lib/proactive-context';
import type { ChatMessage } from '@/lib/types';

interface PendingCommitment {
  id: string;
  text: string;
  suggestedPrompt: string;
  addedAt: number;
  dismissed: boolean;
}

interface Props {
  messages: ChatMessage[];
  onExecute: (prompt: string) => void;
}

// Map commitment text to an actionable prompt
function toActionPrompt(commitment: string): string {
  const lower = commitment.toLowerCase();
  if (/send.*(email|mail)/i.test(lower)) return `Go ahead and send the email now`;
  if (/draft.*(reply|response)/i.test(lower)) return `Draft that reply now`;
  if (/schedule.*(meeting|call)/i.test(lower)) return `Schedule that meeting now`;
  if (/create.*(doc|document)/i.test(lower)) return `Create that document now`;
  if (/find.*(file|document)/i.test(lower)) return `Find that file now`;
  if (/follow up/i.test(lower)) return `Follow up on this now`;
  if (/remind you/i.test(lower)) return `Let's address this now`;
  if (/check.*(calendar|schedule)/i.test(lower)) return `Check the calendar now`;
  return `Complete: ${commitment.slice(0, 60)}`;
}

export default function ProactiveNotifications({ messages, onExecute }: Props) {
  const [commitments, setCommitments] = useState<PendingCommitment[]>([]);

  // Scan new AI messages for commitments
  useEffect(() => {
    const lastAI = [...messages].reverse().find(m => m.role === 'assistant');
    if (!lastAI) return;

    const found = extractCommitments(lastAI.content);
    if (found.length === 0) return;

    setCommitments(prev => {
      const existingTexts = new Set(prev.map(c => c.text));
      const newOnes = found
        .filter(f => !existingTexts.has(f))
        .map(f => ({
          id: crypto.randomUUID(),
          text: f,
          suggestedPrompt: toActionPrompt(f),
          addedAt: Date.now(),
          dismissed: false,
        }));

      if (newOnes.length === 0) return prev;

      // Keep max 5 commitments total
      return [...prev.filter(c => !c.dismissed), ...newOnes].slice(-5);
    });
  }, [messages]);

  const visible = commitments.filter(c => !c.dismissed);
  if (visible.length === 0) return null;

  const dismiss = (id: string) => {
    setCommitments(prev =>
      prev.map(c => c.id === id ? { ...c, dismissed: true } : c)
    );
  };

  const execute = (c: PendingCommitment) => {
    dismiss(c.id);
    onExecute(c.suggestedPrompt);
  };

  return (
    <div className="px-4 pb-2 flex flex-col gap-1.5">
      <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
        Pending actions
      </div>
      <div className="flex flex-wrap gap-1.5">
        {visible.map(c => (
          <div
            key={c.id}
            className={cn(
              'flex items-center gap-1.5 rounded-full border',
              'border-amber-200 dark:border-amber-800',
              'bg-amber-50 dark:bg-amber-950/30',
              'text-amber-800 dark:text-amber-300',
              'text-xs font-medium',
            )}
          >
            <button
              onClick={() => execute(c)}
              className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 hover:bg-amber-100 dark:hover:bg-amber-900/30 rounded-l-full transition-colors"
              title={`Execute: ${c.suggestedPrompt}`}
            >
              <span className="text-[10px]">⚡</span>
              <span className="truncate max-w-[200px]">{c.text.slice(0, 60)}{c.text.length > 60 ? '…' : ''}</span>
            </button>
            <button
              onClick={() => dismiss(c.id)}
              className="pr-2 pl-1 py-1 text-amber-500 hover:text-amber-700 dark:hover:text-amber-200 transition-colors text-[10px]"
              title="Dismiss"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

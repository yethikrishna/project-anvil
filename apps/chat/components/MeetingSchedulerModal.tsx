/**
 * MeetingSchedulerModal — schedule meetings with AI assistance.
 *
 * Flow:
 * 1. User enters meeting details (title, duration, attendees)
 * 2. AI checks calendar availability and proposes times
 * 3. User selects a time or picks an alternative
 * 4. AI creates the calendar event and sends invites
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { toastSuccess, toastError } from './Toast';

interface MeetingProposal {
  title: string;
  start: string;
  end: string;
  attendees: string[];
  description?: string;
  reasoning: string;
  alternatives?: Array<{ start: string; end: string; reasoning: string }>;
}

interface Props {
  onClose: () => void;
  onScheduled?: (event: unknown) => void;
}

type Step = 'details' | 'proposing' | 'confirm' | 'creating' | 'done';

export default function MeetingSchedulerModal({ onClose, onScheduled }: Props) {
  const [step, setStep] = useState<Step>('details');
  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState(30);
  const [attendeesInput, setAttendeesInput] = useState('');
  const [description, setDescription] = useState('');
  const [proposal, setProposal] = useState<MeetingProposal | null>(null);
  const [selectedAlt, setSelectedAlt] = useState<number | null>(null);

  const proposeMeeting = useCallback(async () => {
    if (!title.trim()) return;
    setStep('proposing');

    try {
      const res = await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          duration,
          attendees: attendeesInput.split(/[,\s]+/).filter(Boolean),
          description,
        }),
      });

      if (!res.ok) throw new Error('Failed to find time');
      const data = await res.json();

      if (data.proposal) {
        setProposal(data.proposal);
        setStep('confirm');
      } else {
        toastError('Could not find a suitable time slot');
        setStep('details');
      }
    } catch {
      toastError('Failed to check availability');
      setStep('details');
    }
  }, [title, duration, attendeesInput, description]);

  const confirmMeeting = useCallback(async () => {
    if (!proposal) return;
    setStep('creating');

    const selected = selectedAlt !== null && proposal.alternatives?.[selectedAlt]
      ? proposal.alternatives[selectedAlt]
      : proposal;

    try {
      const res = await fetch('/api/schedule', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: proposal.title,
          start: selected.start,
          end: selected.end,
          attendees: proposal.attendees,
          description: proposal.description,
        }),
      });

      if (!res.ok) throw new Error('Failed to create event');
      const data = await res.json();

      toastSuccess('Meeting scheduled!');
      onScheduled?.(data.event);
      setStep('done');
    } catch {
      toastError('Failed to create event');
      setStep('confirm');
    }
  }, [proposal, selectedAlt, onScheduled]);

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="font-semibold text-sm flex items-center gap-2">
            📅 Schedule Meeting
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        {/* Step: Details */}
        {step === 'details' && (
          <div className="p-4 space-y-3">
            <div>
              <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Meeting Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Product sync with design team"
                className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 mt-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                autoFocus
              />
            </div>

            <div>
              <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Duration</label>
              <div className="flex gap-2 mt-1">
                {[15, 30, 45, 60, 90].map(d => (
                  <button
                    key={d}
                    onClick={() => setDuration(d)}
                    className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                      duration === d
                        ? 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                        : 'bg-gray-50 dark:bg-gray-800 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    {d}m
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Attendees (comma-separated emails)</label>
              <input
                type="text"
                value={attendeesInput}
                onChange={(e) => setAttendeesInput(e.target.value)}
                placeholder="alice@example.com, bob@example.com"
                className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 mt-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Description (optional)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 mt-1 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
              />
            </div>

            <button
              onClick={proposeMeeting}
              disabled={!title.trim()}
              className="w-full text-sm px-4 py-2.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 font-medium transition-colors"
            >
              Find Best Time →
            </button>
          </div>
        )}

        {/* Step: Proposing */}
        {step === 'proposing' && (
          <div className="p-8 text-center">
            <div className="flex justify-center gap-1 mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <p className="text-sm text-gray-400">Checking calendars and finding the best time...</p>
          </div>
        )}

        {/* Step: Confirm */}
        {step === 'confirm' && proposal && (
          <div className="p-4 space-y-3">
            <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm">📅</span>
                <span className="text-sm font-semibold">{proposal.title}</span>
              </div>
              <div className="space-y-1 text-xs">
                <div className="text-gray-600 dark:text-gray-400">
                  <span className="font-medium">When:</span> {formatTime(proposal.start)} – {formatTime(proposal.end)}
                </div>
                {proposal.attendees.length > 0 && (
                  <div className="text-gray-600 dark:text-gray-400">
                    <span className="font-medium">Who:</span> {proposal.attendees.join(', ')}
                  </div>
                )}
                {proposal.description && (
                  <div className="text-gray-600 dark:text-gray-400">
                    <span className="font-medium">Notes:</span> {proposal.description}
                  </div>
                )}
              </div>
              <p className="text-[10px] text-blue-600 dark:text-blue-400 mt-2 italic">
                💡 {proposal.reasoning}
              </p>
            </div>

            {/* Alternatives */}
            {proposal.alternatives && proposal.alternatives.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1.5">Alternative times</p>
                <div className="space-y-1.5">
                  {proposal.alternatives.map((alt, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedAlt(selectedAlt === i ? null : i)}
                      className={`w-full text-left p-2.5 rounded-lg text-xs transition-colors ${
                        selectedAlt === i
                          ? 'bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800'
                          : 'bg-gray-50 dark:bg-gray-800 border border-transparent hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      <span className="font-medium">{formatTime(alt.start)} – {formatTime(alt.end)}</span>
                      <span className="text-gray-400 block mt-0.5">{alt.reasoning}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setStep('details')}
                className="text-xs px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 font-medium"
              >
                ← Back
              </button>
              <button
                onClick={confirmMeeting}
                className="flex-1 text-xs px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-medium transition-colors"
              >
                ✓ Schedule This Time
              </button>
            </div>
          </div>
        )}

        {/* Step: Creating */}
        {step === 'creating' && (
          <div className="p-8 text-center">
            <div className="flex justify-center gap-1 mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <p className="text-sm text-gray-400">Creating event and sending invites...</p>
          </div>
        )}

        {/* Step: Done */}
        {step === 'done' && (
          <div className="p-6 text-center">
            <span className="text-4xl">✅</span>
            <p className="text-sm font-medium mt-3">Meeting Scheduled!</p>
            {proposal && (
              <p className="text-xs text-gray-500 mt-1">
                {proposal.title} · {formatTime(proposal.start)}
              </p>
            )}
            <button
              onClick={onClose}
              className="mt-4 text-xs px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 font-medium"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

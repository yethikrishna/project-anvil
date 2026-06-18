/**
 * CalendarEventManager — Inline event editor/canceller.
 *
 * Shown when the AI calls calendar_update_event or calendar_cancel_event
 * (after approval). Allows the user to review and confirm changes.
 *
 * Features:
 * - Edit title, time, description, attendees
 * - Cancel event with optional message to attendees
 * - Quick reschedule (+30min, +1h, tomorrow same time)
 */

'use client';

import React, { useState } from 'react';

export interface CalendarEvent {
  eventId: string;
  title: string;
  startTime: string;
  endTime?: string;
  attendees?: string[];
  description?: string;
  location?: string;
}

interface CalendarEventManagerProps {
  event: CalendarEvent;
  mode: 'update' | 'cancel';
  onConfirm: (action: 'update' | 'cancel', data: Record<string, unknown>) => void;
  onClose: () => void;
}

export function CalendarEventManager({ event, mode, onConfirm, onClose }: CalendarEventManagerProps) {
  const [title, setTitle] = useState(event.title);
  const [startTime, setStartTime] = useState(event.startTime);
  const [endTime, setEndTime] = useState(event.endTime ?? '');
  const [description, setDescription] = useState(event.description ?? '');
  const [cancelReason, setCancelReason] = useState('');
  const [notifyAttendees, setNotifyAttendees] = useState(true);
  const [saving, setSaving] = useState(false);

  async function handleConfirm() {
    setSaving(true);
    try {
      if (mode === 'cancel') {
        onConfirm('cancel', {
          event_id: event.eventId,
          notify_attendees: notifyAttendees,
          reason: cancelReason,
        });
      } else {
        const updates: Record<string, unknown> = { event_id: event.eventId };
        if (title !== event.title) updates.title = title;
        if (startTime !== event.startTime) updates.start_time = startTime;
        if (endTime !== event.endTime) updates.end_time = endTime;
        if (description !== event.description) updates.description = description;
        onConfirm('update', updates);
      }
    } finally {
      setSaving(false);
    }
  }

  function quickReschedule(offsetMs: number) {
    const d = new Date(startTime);
    d.setTime(d.getTime() + offsetMs);
    setStartTime(d.toISOString().slice(0, 16));
    if (endTime) {
      const e = new Date(endTime);
      e.setTime(e.getTime() + offsetMs);
      setEndTime(e.toISOString().slice(0, 16));
    }
  }

  const QUICK_RESCHEDULE = [
    { label: '+30 min', ms: 30 * 60 * 1000 },
    { label: '+1 hour', ms: 60 * 60 * 1000 },
    { label: '+1 day', ms: 24 * 60 * 60 * 1000 },
    { label: 'Next week', ms: 7 * 24 * 60 * 60 * 1000 },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-lg bg-[#0f1117] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
          <div className="flex items-center gap-2">
            <span className="text-xl">{mode === 'cancel' ? '🗑️' : '✏️'}</span>
            <div>
              <h2 className="text-sm font-semibold text-white">
                {mode === 'cancel' ? 'Cancel Event' : 'Update Event'}
              </h2>
              <p className="text-xs text-white/40 mt-0.5">{event.title}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/8 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {mode === 'update' ? (
            <>
              {/* Title */}
              <div>
                <label className="text-xs text-white/40 mb-1 block">Title</label>
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50 transition-colors"
                />
              </div>

              {/* Quick reschedule */}
              <div>
                <label className="text-xs text-white/40 mb-1.5 block">Quick reschedule</label>
                <div className="flex gap-2 flex-wrap">
                  {QUICK_RESCHEDULE.map(opt => (
                    <button
                      key={opt.label}
                      onClick={() => quickReschedule(opt.ms)}
                      className="px-3 py-1.5 text-xs bg-white/8 hover:bg-white/14 text-white/70 hover:text-white rounded-lg transition-colors border border-white/10"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Times */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-white/40 mb-1 block">Start time</label>
                  <input
                    type="datetime-local"
                    value={startTime.slice(0, 16)}
                    onChange={e => setStartTime(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-blue-500/50 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-xs text-white/40 mb-1 block">End time</label>
                  <input
                    type="datetime-local"
                    value={endTime.slice(0, 16)}
                    onChange={e => setEndTime(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-blue-500/50 transition-colors"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="text-xs text-white/40 mb-1 block">Notes / Agenda</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={3}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80 outline-none focus:border-blue-500/50 resize-none transition-colors"
                  placeholder="Optional agenda or notes…"
                />
              </div>

              {event.attendees && event.attendees.length > 0 && (
                <div>
                  <label className="text-xs text-white/40 mb-1 block">Attendees</label>
                  <div className="flex flex-wrap gap-1.5">
                    {event.attendees.map(a => (
                      <span key={a} className="px-2.5 py-1 bg-white/8 rounded-full text-xs text-white/60">{a}</span>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Cancel mode */}
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                <p className="text-sm text-red-300">
                  This will cancel <strong>{event.title}</strong>
                  {event.attendees && event.attendees.length > 0
                    ? ` and notify ${event.attendees.length} attendee${event.attendees.length > 1 ? 's' : ''}.`
                    : '.'}
                </p>
              </div>

              <div>
                <label className="text-xs text-white/40 mb-1 block">Cancellation reason (optional)</label>
                <textarea
                  value={cancelReason}
                  onChange={e => setCancelReason(e.target.value)}
                  rows={3}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80 outline-none focus:border-red-500/40 resize-none transition-colors"
                  placeholder="e.g. Rescheduling due to conflict…"
                />
              </div>

              {event.attendees && event.attendees.length > 0 && (
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifyAttendees}
                    onChange={e => setNotifyAttendees(e.target.checked)}
                    className="w-4 h-4 rounded accent-red-500"
                  />
                  <span className="text-sm text-white/70">Notify attendees</span>
                </label>
              )}
            </>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-between items-center px-5 py-4 border-t border-white/8 bg-black/20">
          <button onClick={onClose} className="px-4 py-2 text-sm text-white/40 hover:text-white/70 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving}
            className={`px-5 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${
              mode === 'cancel'
                ? 'bg-red-600 hover:bg-red-500 text-white'
                : 'bg-blue-600 hover:bg-blue-500 text-white'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {saving ? 'Saving…' : mode === 'cancel' ? 'Confirm Cancellation' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default CalendarEventManager;

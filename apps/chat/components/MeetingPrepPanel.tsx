/**
 * MeetingPrepPanel — AI-generated meeting briefing.
 *
 * Shows:
 * - Meeting summary + attendee sentiment
 * - Suggested agenda (editable)
 * - Key talking points
 * - Open action items from email threads
 * - Relevant Drive files with quick-open
 * - Risks/concerns the AI flagged
 *
 * Generates briefing via /api/meeting-prep, renders as a rich panel
 * that can be printed, exported, or shared.
 */

'use client';

import { useState, useCallback } from 'react';
import { cn } from '@anvil/ui';
import { toastSuccess, toastError } from './Toast';

interface AttendeeProfile {
  email: string;
  name?: string;
  recentTopics: string[];
  sentiment: 'positive' | 'neutral' | 'needs-attention';
  openItems: string[];
}

interface RelevantFile {
  name: string;
  id: string;
  snippet: string;
}

interface MeetingBrief {
  title: string;
  startTime: string;
  duration: number;
  attendees: AttendeeProfile[];
  relevantFiles: RelevantFile[];
  suggestedAgenda: string[];
  talkingPoints: string[];
  openActionItems: string[];
  risks: string[];
  summary: string;
}

interface Props {
  eventId?: string;
  eventTitle?: string;
  startTime?: string;
  attendees?: string[];
  onClose: () => void;
  onAction?: (prompt: string) => void;
}

const SENTIMENT_CONFIG = {
  positive: { icon: '🟢', label: 'Good rapport', cls: 'text-green-600 dark:text-green-400' },
  neutral: { icon: '🔵', label: 'Neutral', cls: 'text-blue-500 dark:text-blue-400' },
  'needs-attention': { icon: '🟡', label: 'Needs attention', cls: 'text-yellow-600 dark:text-yellow-400' },
};

function Section({ title, icon, children, className }: {
  title: string;
  icon: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-4', className)}>
      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
        <span>{icon}</span> {title}
      </h3>
      {children}
    </div>
  );
}

function AgendaEditor({ items, onChange }: { items: string[]; onChange: (items: string[]) => void }) {
  const [editing, setEditing] = useState<number | null>(null);
  const [editVal, setEditVal] = useState('');

  return (
    <ol className="space-y-1">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 group">
          <span className="text-[10px] font-bold text-gray-400 mt-0.5 w-4 shrink-0">{i + 1}.</span>
          {editing === i ? (
            <input
              autoFocus
              value={editVal}
              onChange={e => setEditVal(e.target.value)}
              onBlur={() => {
                const updated = [...items];
                updated[i] = editVal.trim() || item;
                onChange(updated);
                setEditing(null);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === 'Escape') {
                  const updated = [...items];
                  if (editVal.trim()) updated[i] = editVal.trim();
                  onChange(updated);
                  setEditing(null);
                }
              }}
              className="flex-1 text-[11px] bg-transparent border-b border-indigo-300 dark:border-indigo-600 outline-none text-gray-800 dark:text-gray-200 pb-0.5"
            />
          ) : (
            <div className="flex items-center gap-1 flex-1">
              <span className="text-[11px] text-gray-700 dark:text-gray-300">{item}</span>
              <button
                onClick={() => { setEditing(i); setEditVal(item); }}
                className="opacity-0 group-hover:opacity-100 text-[9px] text-gray-400 hover:text-gray-600 ml-auto transition-opacity"
              >
                ✏️
              </button>
              <button
                onClick={() => onChange(items.filter((_, idx) => idx !== i))}
                className="opacity-0 group-hover:opacity-100 text-[9px] text-red-400 hover:text-red-600 transition-opacity"
              >
                ✕
              </button>
            </div>
          )}
        </li>
      ))}
      <li>
        <button
          onClick={() => {
            const newItems = [...items, 'New agenda item'];
            onChange(newItems);
            setEditing(newItems.length - 1);
            setEditVal('New agenda item');
          }}
          className="text-[10px] text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-300 mt-1"
        >
          + Add item
        </button>
      </li>
    </ol>
  );
}

export default function MeetingPrepPanel({ eventId, eventTitle, startTime, attendees, onClose, onAction }: Props) {
  const [brief, setBrief] = useState<MeetingBrief | null>(null);
  const [loading, setLoading] = useState(false);
  const [agenda, setAgenda] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'brief' | 'agenda' | 'attendees' | 'files'>('brief');

  const generate = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/meeting-prep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, title: eventTitle, startTime, attendees }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data: MeetingBrief = await res.json();
      setBrief(data);
      setAgenda(data.suggestedAgenda);
      toastSuccess('Meeting brief ready');
    } catch (err) {
      toastError('Failed to generate brief');
    } finally {
      setLoading(false);
    }
  }, [eventId, eventTitle, startTime, attendees]);

  // Auto-generate on mount
  useState(() => {
    generate();
  });

  const exportBrief = () => {
    if (!brief) return;
    const md = [
      `# Meeting Brief: ${brief.title}`,
      `**When:** ${new Date(brief.startTime).toLocaleString()}`,
      `**Attendees:** ${brief.attendees.map(a => a.email).join(', ')}`,
      '',
      `## Summary`,
      brief.summary,
      '',
      `## Agenda`,
      agenda.map((item, i) => `${i + 1}. ${item}`).join('\n'),
      '',
      `## Talking Points`,
      brief.talkingPoints.map(p => `- ${p}`).join('\n'),
      '',
      `## Open Action Items`,
      brief.openActionItems.map(a => `- [ ] ${a}`).join('\n'),
      brief.risks.length > 0 ? `\n## Risks\n${brief.risks.map(r => `- ⚠️ ${r}`).join('\n')}` : '',
    ].filter(Boolean).join('\n');

    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meeting-brief-${brief.title.replace(/\s+/g, '-').toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
    toastSuccess('Brief exported as Markdown');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-950 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden border border-gray-200 dark:border-gray-800">
        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-3 border-b border-gray-100 dark:border-gray-800">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              📋 Meeting Brief
            </h2>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {eventTitle ?? 'Meeting'}{startTime ? ` · ${new Date(startTime).toLocaleDateString()}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {brief && (
              <>
                <button
                  onClick={exportBrief}
                  className="text-[11px] px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  ↓ Export
                </button>
                <button
                  onClick={generate}
                  className="text-[11px] px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  ↺ Refresh
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg leading-none"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 py-12">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center animate-pulse">
              <span className="text-white text-lg">📋</span>
            </div>
            <div className="text-sm text-gray-500 text-center">
              <p>Generating meeting brief...</p>
              <p className="text-[11px] text-gray-400 mt-1">Scanning emails, Drive, and calendar history</p>
            </div>
            <div className="flex gap-2 mt-2">
              {['📧 Emails', '📁 Drive', '📅 Calendar'].map(label => (
                <span key={label} className="text-[10px] px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded-full text-gray-500 animate-pulse">
                  {label}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Content */}
        {!loading && brief && (
          <>
            {/* Tabs */}
            <div className="flex border-b border-gray-100 dark:border-gray-800 px-4 pt-2">
              {([
                { id: 'brief', label: '📄 Brief' },
                { id: 'agenda', label: '📋 Agenda' },
                { id: 'attendees', label: `👥 People (${brief.attendees.length})` },
                { id: 'files', label: `📁 Files (${brief.relevantFiles.length})` },
              ] as const).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'text-[11px] px-3 py-2 border-b-2 -mb-px transition-colors',
                    activeTab === tab.id
                      ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400 font-medium'
                      : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Brief tab */}
              {activeTab === 'brief' && (
                <div>
                  {/* Summary */}
                  <div className="bg-indigo-50 dark:bg-indigo-950/30 rounded-xl p-4 mb-4 border border-indigo-100 dark:border-indigo-900">
                    <p className="text-[12px] text-indigo-800 dark:text-indigo-200 leading-relaxed">
                      {brief.summary}
                    </p>
                  </div>

                  {/* Talking points */}
                  {brief.talkingPoints.length > 0 && (
                    <Section title="Key talking points" icon="💬">
                      <ul className="space-y-1">
                        {brief.talkingPoints.map((p, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="text-indigo-400 mt-0.5 text-xs">▸</span>
                            <span className="text-[11px] text-gray-700 dark:text-gray-300">{p}</span>
                          </li>
                        ))}
                      </ul>
                    </Section>
                  )}

                  {/* Action items */}
                  {brief.openActionItems.length > 0 && (
                    <Section title="Open action items" icon="✅">
                      <ul className="space-y-1">
                        {brief.openActionItems.map((item, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <input type="checkbox" className="mt-0.5 h-3 w-3 accent-indigo-500" />
                            <span className="text-[11px] text-gray-700 dark:text-gray-300">{item}</span>
                          </li>
                        ))}
                      </ul>
                    </Section>
                  )}

                  {/* Risks */}
                  {brief.risks.length > 0 && (
                    <Section title="Risks & concerns" icon="⚠️">
                      <ul className="space-y-1">
                        {brief.risks.map((risk, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="text-yellow-500 text-xs mt-0.5">⚠</span>
                            <span className="text-[11px] text-gray-600 dark:text-gray-400">{risk}</span>
                          </li>
                        ))}
                      </ul>
                    </Section>
                  )}

                  {/* Quick actions */}
                  {onAction && (
                    <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                      <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-2">Quick actions</p>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          onClick={() => onAction(`Send a prep email to the attendees of the "${brief.title}" meeting with the agenda`)}
                          className="text-[10px] px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-800/50 transition-colors"
                        >
                          📧 Send prep email
                        </button>
                        <button
                          onClick={() => onAction(`Create a meeting notes document for "${brief.title}" with the agenda and attendees`)}
                          className="text-[10px] px-2.5 py-1 rounded-lg bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 border border-green-100 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-800/50 transition-colors"
                        >
                          📝 Create notes doc
                        </button>
                        <button
                          onClick={() => onAction(`Find all emails about "${brief.title}" from the past month`)}
                          className="text-[10px] px-2.5 py-1 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-100 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        >
                          📧 Find all emails
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Agenda tab */}
              {activeTab === 'agenda' && (
                <div>
                  <p className="text-[11px] text-gray-500 mb-3">Click any item to edit. Drag to reorder.</p>
                  <AgendaEditor items={agenda} onChange={setAgenda} />

                  <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800">
                    <button
                      onClick={exportBrief}
                      className="text-[11px] px-3 py-1.5 rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 transition-colors"
                    >
                      ↓ Export with this agenda
                    </button>
                  </div>
                </div>
              )}

              {/* Attendees tab */}
              {activeTab === 'attendees' && (
                <div className="space-y-3">
                  {brief.attendees.length === 0 && (
                    <p className="text-[11px] text-gray-400 text-center py-4">No attendees found</p>
                  )}
                  {brief.attendees.map((attendee, i) => {
                    const sentiment = SENTIMENT_CONFIG[attendee.sentiment];
                    return (
                      <div key={i} className="rounded-xl border border-gray-100 dark:border-gray-800 p-3">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="text-[12px] font-medium text-gray-800 dark:text-gray-200">
                              {attendee.name ?? attendee.email}
                            </p>
                            {attendee.name && (
                              <p className="text-[10px] text-gray-400">{attendee.email}</p>
                            )}
                          </div>
                          <span className={cn('text-[10px] font-medium', sentiment.cls)}>
                            {sentiment.icon} {sentiment.label}
                          </span>
                        </div>
                        {attendee.recentTopics.length > 0 && (
                          <div className="mb-2">
                            <p className="text-[9px] font-medium text-gray-400 uppercase tracking-wide mb-1">Recent topics</p>
                            <div className="flex flex-wrap gap-1">
                              {attendee.recentTopics.map((t, j) => (
                                <span key={j} className="text-[10px] px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-gray-600 dark:text-gray-400">
                                  {t}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {attendee.openItems.length > 0 && (
                          <div>
                            <p className="text-[9px] font-medium text-gray-400 uppercase tracking-wide mb-1">Open items</p>
                            <ul className="space-y-0.5">
                              {attendee.openItems.map((item, j) => (
                                <li key={j} className="text-[10px] text-yellow-700 dark:text-yellow-400 flex gap-1">
                                  <span>•</span> {item}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {onAction && (
                          <button
                            onClick={() => onAction(`Find all recent emails from ${attendee.email}`)}
                            className="mt-2 text-[9px] text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-300"
                          >
                            View email history →
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Files tab */}
              {activeTab === 'files' && (
                <div className="space-y-2">
                  {brief.relevantFiles.length === 0 && (
                    <div className="text-center py-6">
                      <p className="text-[11px] text-gray-400">No relevant files found</p>
                      {onAction && (
                        <button
                          onClick={() => onAction(`Search Drive for files related to "${brief.title}"`)}
                          className="mt-2 text-[11px] text-indigo-500 hover:text-indigo-700"
                        >
                          Search Drive →
                        </button>
                      )}
                    </div>
                  )}
                  {brief.relevantFiles.map((file, i) => (
                    <div key={i} className="flex items-start gap-3 rounded-xl border border-gray-100 dark:border-gray-800 p-3">
                      <span className="text-2xl mt-0.5">📄</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium text-gray-800 dark:text-gray-200 truncate">
                          {file.name}
                        </p>
                        {file.snippet && (
                          <p className="text-[10px] text-gray-400 mt-0.5">{file.snippet}</p>
                        )}
                      </div>
                      {onAction && (
                        <button
                          onClick={() => onAction(`Read and summarize "${file.name}"${file.id ? ` (ID: ${file.id})` : ''}`)}
                          className="text-[10px] text-indigo-500 hover:text-indigo-700 shrink-0"
                        >
                          Open →
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Error / empty state */}
        {!loading && !brief && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 py-8">
            <button
              onClick={generate}
              className="px-4 py-2 rounded-xl bg-indigo-500 text-white text-sm hover:bg-indigo-600 transition-colors"
            >
              Generate Brief
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * EmailCoachWidget — inline AI quality review for outgoing emails.
 *
 * Used inside DraftPreviewModal to give real-time coaching:
 * - Overall quality score (0-100)
 * - Tone + clarity indicators
 * - Specific improvement suggestions with fixes
 * - Send signal: ✅ Send it | ⚠️ Review first | 🛑 Hold
 * - One-click "Apply suggestion" for each fix
 *
 * Calls /api/email-coach and updates live when the draft changes.
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { cn } from '@anvil/ui';

interface CoachFeedback {
  score: number;
  tone: { label: string; issues: string[] };
  clarity: { score: number; issues: string[] };
  completeness: { score: number; issues: string[] };
  subjectLine: { rating: 'good' | 'ok' | 'weak'; suggestion?: string };
  highlights: string[];
  improvements: Array<{
    severity: 'critical' | 'suggestion' | 'minor';
    text: string;
    fix?: string;
  }>;
  revisedDraft?: string;
  sendSignal: 'send-it' | 'review-first' | 'hold';
  sendSignalReason: string;
}

interface Props {
  subject: string;
  body: string;
  to?: string;
  tone?: string;
  onApplyRewrite?: (draft: string) => void;
}

const SIGNAL_CONFIG = {
  'send-it': {
    icon: '✅',
    label: 'Good to send',
    cls: 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400',
  },
  'review-first': {
    icon: '⚠️',
    label: 'Review first',
    cls: 'bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800 text-yellow-700 dark:text-yellow-400',
  },
  'hold': {
    icon: '🛑',
    label: 'Hold — needs work',
    cls: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400',
  },
};

const SEVERITY_CONFIG = {
  critical: { icon: '🔴', cls: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-950/20 border-red-100 dark:border-red-900' },
  suggestion: { icon: '🟡', cls: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-950/20 border-yellow-100 dark:border-yellow-900' },
  minor: { icon: '🔵', cls: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/20 border-blue-100 dark:border-blue-900' },
};

function ScoreRing({ score }: { score: number }) {
  const r = 20;
  const circ = 2 * Math.PI * r;
  const progress = (score / 100) * circ;
  const color = score >= 80 ? '#22c55e' : score >= 60 ? '#eab308' : '#ef4444';

  return (
    <svg width="52" height="52" viewBox="0 0 52 52" className="shrink-0">
      <circle cx="26" cy="26" r={r} fill="none" stroke="#e5e7eb" strokeWidth="4" className="dark:stroke-gray-700" />
      <circle
        cx="26" cy="26" r={r} fill="none"
        stroke={color} strokeWidth="4"
        strokeDasharray={`${progress} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 26 26)"
        style={{ transition: 'stroke-dasharray 0.5s ease' }}
      />
      <text x="26" y="30" textAnchor="middle" fontSize="11" fontWeight="700" fill={color}>
        {score}
      </text>
    </svg>
  );
}

export default function EmailCoachWidget({ subject, body, to, tone, onApplyRewrite }: Props) {
  const [feedback, setFeedback] = useState<CoachFeedback | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastBodyRef = useRef('');

  const analyze = useCallback(async (s: string, b: string) => {
    if (b.trim().length < 20) return; // Too short to analyze
    if (b === lastBodyRef.current) return; // No change
    lastBodyRef.current = b;

    setLoading(true);
    try {
      const res = await fetch('/api/email-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: s, body: b, to, tone }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setFeedback(await res.json());
    } catch {
      // Silently fail — coaching is best-effort
    } finally {
      setLoading(false);
    }
  }, [to, tone]);

  // Debounced analysis when content changes
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => analyze(subject, body), 1500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [subject, body, analyze]);

  if (!feedback && !loading) {
    return (
      <div className="text-[10px] text-gray-400 text-center py-2 animate-pulse">
        AI coach analyzing your draft...
      </div>
    );
  }

  if (loading && !feedback) {
    return (
      <div className="flex items-center gap-2 py-2">
        <div className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '0ms' }} />
        <div className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '150ms' }} />
        <div className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '300ms' }} />
        <span className="text-[10px] text-gray-400">AI coach reviewing...</span>
      </div>
    );
  }

  if (!feedback) return null;

  const signal = SIGNAL_CONFIG[feedback.sendSignal];

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <ScoreRing score={feedback.score} />
        <div className="flex-1 text-left">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-gray-800 dark:text-gray-200">
              AI Email Coach
            </span>
            {loading && (
              <span className="text-[9px] text-gray-400 animate-pulse">updating...</span>
            )}
          </div>
          <p className="text-[10px] text-gray-500 mt-0.5">
            Tone: {feedback.tone.label} · Clarity: {feedback.clarity.score}/100
          </p>
        </div>
        <span className={cn(
          'text-[10px] px-2 py-0.5 rounded-md border font-medium',
          signal.cls,
        )}>
          {signal.icon} {signal.label}
        </span>
        <span className="text-gray-400 text-xs">{expanded ? '▲' : '▼'}</span>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-gray-100 dark:border-gray-800 p-3 space-y-3">
          {/* Send signal explanation */}
          <div className={cn('rounded-lg border px-3 py-2 text-[11px]', signal.cls)}>
            {signal.icon} {feedback.sendSignalReason}
          </div>

          {/* Highlights */}
          {feedback.highlights.length > 0 && (
            <div>
              <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">✨ What works</p>
              <ul className="space-y-0.5">
                {feedback.highlights.map((h, i) => (
                  <li key={i} className="text-[10px] text-gray-600 dark:text-gray-400 flex gap-1.5">
                    <span className="text-green-500">✓</span> {h}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Improvements */}
          {feedback.improvements.length > 0 && (
            <div>
              <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">🔧 Improvements</p>
              <div className="space-y-1.5">
                {feedback.improvements.map((imp, i) => {
                  const sev = SEVERITY_CONFIG[imp.severity];
                  return (
                    <div key={i} className={cn('rounded-lg border p-2.5', sev.bg)}>
                      <div className="flex items-start gap-1.5">
                        <span className="text-xs">{sev.icon}</span>
                        <div className="flex-1">
                          <p className={cn('text-[11px] font-medium', sev.cls)}>{imp.text}</p>
                          {imp.fix && (
                            <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 italic">
                              Suggestion: &ldquo;{imp.fix}&rdquo;
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Subject line */}
          {feedback.subjectLine.rating !== 'good' && feedback.subjectLine.suggestion && (
            <div className="bg-yellow-50 dark:bg-yellow-950/20 rounded-lg border border-yellow-100 dark:border-yellow-900 p-2.5">
              <p className="text-[10px] font-medium text-yellow-700 dark:text-yellow-400">
                📌 Subject line suggestion
              </p>
              <p className="text-[11px] text-gray-700 dark:text-gray-300 mt-1 italic">
                &ldquo;{feedback.subjectLine.suggestion}&rdquo;
              </p>
            </div>
          )}

          {/* Rewrite button */}
          {onApplyRewrite && (
            <div className="pt-1 border-t border-gray-100 dark:border-gray-800 flex gap-2">
              <button
                onClick={async () => {
                  setLoading(true);
                  try {
                    const res = await fetch('/api/email-coach', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ subject, body, to, tone, includeRewrite: true }),
                    });
                    if (!res.ok) throw new Error(`${res.status}`);
                    const data: CoachFeedback = await res.json();
                    setFeedback(data);
                    if (data.revisedDraft) onApplyRewrite(data.revisedDraft);
                  } catch { /* ignore */ }
                  finally { setLoading(false); }
                }}
                disabled={loading}
                className="text-[10px] px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-800/50 transition-colors disabled:opacity-50"
              >
                ✨ AI rewrite
              </button>
              <span className="text-[9px] text-gray-400 self-center">
                Applies suggestions automatically
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

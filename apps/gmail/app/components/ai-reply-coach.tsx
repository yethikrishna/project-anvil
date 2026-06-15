'use client';

/**
 * AI Reply Coach — Pre-send review of your drafted email.
 *
 * Powered by @anvil/ai. Before you hit Send, the coach:
 *   1. Scores your draft on Clarity, Tone, Completeness, Brevity
 *   2. Flags potential issues (too aggressive, unclear ask, missing context)
 *   3. Suggests a one-tap improved version
 *   4. Shows reading-level + estimated read-time
 *
 * Usage:
 *   <AIReplyCoach
 *     draft="..."
 *     threadMessages={[...]}
 *     onImprove={(improved) => setDraft(improved)}
 *     onDismiss={() => setShowCoach(false)}
 *   />
 */

import { useState, useCallback, useEffect } from 'react';

// ── Types ──

export interface CoachScore {
  clarity: number;       // 0-100
  tone: number;          // 0-100
  completeness: number;  // 0-100
  brevity: number;       // 0-100
  overall: number;       // 0-100
}

export interface CoachIssue {
  type: 'warning' | 'suggestion' | 'info';
  icon: string;
  title: string;
  detail: string;
}

export interface CoachResult {
  scores: CoachScore;
  issues: CoachIssue[];
  improvedDraft?: string;
  readingLevel: string;
  estimatedReadTime: string;
  subjectSuggestion?: string;
  summary: string;
}

interface ThreadMessage {
  from: { name: string; email: string };
  body: string;
  date: string;
}

interface AIReplyCoachProps {
  draft: string;
  subject: string;
  threadMessages?: ThreadMessage[];
  onImprove: (improved: string) => void;
  onDismiss: () => void;
}

// ── Helpers ──

function scoreColor(score: number): string {
  if (score >= 80) return 'text-green-600';
  if (score >= 60) return 'text-yellow-600';
  return 'text-red-600';
}

function scoreBg(score: number): string {
  if (score >= 80) return 'bg-green-500';
  if (score >= 60) return 'bg-yellow-500';
  return 'bg-red-500';
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 w-24 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${scoreBg(score)}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className={`text-xs font-semibold w-8 text-right ${scoreColor(score)}`}>{score}</span>
    </div>
  );
}

// ── Local instant analysis (no API call needed) ──

function localAnalyze(draft: string, subject: string, thread?: ThreadMessage[]): Partial<CoachResult> {
  const words = draft.trim().split(/\s+/).filter(Boolean);
  const sentences = draft.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const avgWordsPerSentence = sentences.length > 0 ? words.length / sentences.length : 0;

  // Reading time: 200 wpm average
  const readTimeSec = Math.ceil((words.length / 200) * 60);
  const estimatedReadTime = readTimeSec < 30
    ? '< 30 seconds'
    : readTimeSec < 60
    ? `~${readTimeSec} seconds`
    : `~${Math.round(readTimeSec / 60)} minute${readTimeSec >= 120 ? 's' : ''}`;

  // Flesch-Kincaid grade approximation
  const syllables = words.reduce((acc, w) => acc + Math.max(1, w.replace(/[^aeiouy]/gi, '').length), 0);
  const avgSyllables = syllables / Math.max(1, words.length);
  const fkGrade = 0.39 * avgWordsPerSentence + 11.8 * avgSyllables - 15.59;
  const readingLevel = fkGrade < 6
    ? 'Elementary'
    : fkGrade < 9
    ? 'Middle School'
    : fkGrade < 12
    ? 'High School'
    : fkGrade < 16
    ? 'College'
    : 'Professional';

  // Score heuristics
  const brevityScore = words.length < 50
    ? 95
    : words.length < 100
    ? 85
    : words.length < 200
    ? 70
    : words.length < 350
    ? 55
    : 35;

  const toneIssues: string[] = [];
  const aggressiveWords = ['obviously', 'clearly', 'you must', 'you need to', 'you should', 'actually', 'frankly'];
  const hedgeWords = ['i think', 'maybe', 'perhaps', 'sort of', 'kind of', 'i guess', 'i suppose'];
  const hasAsk = /\?|please|can you|could you|would you|i'd like|let me know|by .*(date|time|friday|monday|tomorrow)/i.test(draft);

  let toneScore = 80;
  aggressiveWords.forEach(w => { if (draft.toLowerCase().includes(w)) { toneScore -= 8; toneIssues.push(w); } });
  hedgeWords.forEach(w => { if (draft.toLowerCase().includes(w)) { toneScore -= 3; } });
  toneScore = Math.max(20, Math.min(100, toneScore));

  const clarityScore = Math.min(100, Math.max(30,
    95
    - (avgWordsPerSentence > 25 ? 20 : 0)
    - (avgWordsPerSentence > 35 ? 15 : 0)
    - (!hasAsk && thread && thread.length > 0 ? 10 : 0)
  ));

  const completenessScore = Math.min(100, Math.max(40,
    70
    + (hasAsk ? 15 : 0)
    + (words.length > 20 ? 10 : 0)
    + (subject.trim().length > 5 ? 5 : 0)
  ));

  const overall = Math.round((clarityScore + toneScore + completenessScore + brevityScore) / 4);

  const issues: CoachIssue[] = [];

  if (toneIssues.length > 0) {
    issues.push({
      type: 'warning',
      icon: '⚠️',
      title: 'Potentially aggressive phrasing',
      detail: `Words like "${toneIssues[0]}" can come across as condescending. Consider softening.`,
    });
  }

  if (avgWordsPerSentence > 28) {
    issues.push({
      type: 'suggestion',
      icon: '✂️',
      title: 'Long sentences detected',
      detail: `Average ${Math.round(avgWordsPerSentence)} words per sentence. Aim for under 20 for maximum clarity.`,
    });
  }

  if (!hasAsk && thread && thread.length > 0) {
    issues.push({
      type: 'info',
      icon: '💡',
      title: 'No clear next step',
      detail: 'You haven\'t explicitly asked for an action or response. Consider adding a clear call-to-action.',
    });
  }

  if (words.length < 10) {
    issues.push({
      type: 'warning',
      icon: '📝',
      title: 'Very short response',
      detail: 'Your draft may be too brief to fully address the thread. Make sure key points are covered.',
    });
  }

  if (words.length > 300) {
    issues.push({
      type: 'suggestion',
      icon: '📉',
      title: 'Consider trimming',
      detail: `At ${words.length} words, this email may lose reader attention. Could some context be cut?`,
    });
  }

  if (!draft.match(/hi |hello |hey |dear |good morning|good afternoon/i)) {
    issues.push({
      type: 'info',
      icon: '👋',
      title: 'No greeting detected',
      detail: 'Adding a greeting makes the email feel more personal and professional.',
    });
  }

  return {
    scores: {
      clarity: clarityScore,
      tone: toneScore,
      completeness: completenessScore,
      brevity: brevityScore,
      overall,
    },
    issues,
    estimatedReadTime,
    readingLevel,
    summary: overall >= 80
      ? 'Your draft looks great. Ready to send!'
      : overall >= 60
      ? 'Good draft with some room for improvement.'
      : 'Consider revising before sending.',
  };
}

// ── Main Component ──

export function AIReplyCoach({ draft, subject, threadMessages, onImprove, onDismiss }: AIReplyCoachProps) {
  const [result, setResult] = useState<CoachResult | null>(null);
  const [isAILoading, setIsAILoading] = useState(false);
  const [showImproved, setShowImproved] = useState(false);
  const [improvedDraft, setImprovedDraft] = useState<string | null>(null);
  const [tab, setTab] = useState<'scores' | 'issues' | 'improved'>('scores');

  // Instant local analysis on mount
  useEffect(() => {
    const local = localAnalyze(draft, subject, threadMessages);
    setResult(local as CoachResult);
  }, [draft, subject, threadMessages]);

  // Deep AI analysis
  const runAIAnalysis = useCallback(async () => {
    setIsAILoading(true);
    try {
      const resp = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'coach-reply',
          payload: {
            draft,
            subject,
            threadMessages: threadMessages?.map(m => ({
              from: m.from.name,
              body: m.body,
              date: m.date,
            })),
          },
        }),
      });

      if (resp.ok) {
        const aiResult = await resp.json();
        setResult(prev => ({
          ...(prev as CoachResult),
          ...aiResult,
          // Keep local scores if AI doesn't return them
          scores: aiResult.scores || prev?.scores,
        }));
        if (aiResult.improvedDraft) {
          setImprovedDraft(aiResult.improvedDraft);
        }
      }
    } catch {
      // Keep local result on AI failure
    } finally {
      setIsAILoading(false);
    }
  }, [draft, subject, threadMessages]);

  if (!result) return null;

  const { scores, issues, estimatedReadTime, readingLevel, summary } = result;

  return (
    <div className="fixed inset-0 bg-black/20 z-50 flex items-end justify-center sm:items-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className="text-lg">🧑‍🏫</span>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">AI Reply Coach</h2>
              <p className="text-xs text-gray-500">{summary}</p>
            </div>
          </div>
          <button onClick={onDismiss} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
        </div>

        {/* Overall Score */}
        <div className="px-4 py-3 bg-gradient-to-r from-purple-50 to-blue-50 border-b border-gray-100">
          <div className="flex items-center gap-4">
            <div className="relative w-14 h-14">
              <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
                <circle cx="28" cy="28" r="22" fill="none" stroke="#e5e7eb" strokeWidth="5" />
                <circle
                  cx="28" cy="28" r="22" fill="none"
                  stroke={scores.overall >= 80 ? '#22c55e' : scores.overall >= 60 ? '#eab308' : '#ef4444'}
                  strokeWidth="5"
                  strokeDasharray={`${(scores.overall / 100) * 138.2} 138.2`}
                  strokeLinecap="round"
                />
              </svg>
              <span className={`absolute inset-0 flex items-center justify-center text-sm font-bold ${scoreColor(scores.overall)}`}>
                {scores.overall}
              </span>
            </div>
            <div className="flex-1 grid grid-cols-2 gap-1">
              <ScoreBar label="Clarity" score={scores.clarity} />
              <ScoreBar label="Tone" score={scores.tone} />
              <ScoreBar label="Complete" score={scores.completeness} />
              <ScoreBar label="Brevity" score={scores.brevity} />
            </div>
          </div>
          <div className="flex gap-4 mt-2">
            <span className="text-xs text-gray-500">📖 {readingLevel}</span>
            <span className="text-xs text-gray-500">⏱ {estimatedReadTime} to read</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100">
          {(['scores', 'issues', 'improved'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 text-xs font-medium capitalize transition-colors ${
                tab === t
                  ? 'text-purple-600 border-b-2 border-purple-500'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'issues' ? `Issues (${issues.length})` : t === 'improved' ? '✨ Improved' : 'Scores'}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="px-4 py-3 max-h-56 overflow-y-auto">
          {tab === 'scores' && (
            <div className="space-y-3">
              <ScoreDetail label="Clarity" score={scores.clarity} description="How easy is the email to understand?" />
              <ScoreDetail label="Tone" score={scores.tone} description="Is the tone appropriate for the context?" />
              <ScoreDetail label="Completeness" score={scores.completeness} description="Does it address the thread and include a clear ask?" />
              <ScoreDetail label="Brevity" score={scores.brevity} description="Is it concise without losing important information?" />
            </div>
          )}

          {tab === 'issues' && (
            <div className="space-y-2">
              {issues.length === 0 ? (
                <p className="text-sm text-green-600 text-center py-4">✅ No issues found. Looks great!</p>
              ) : (
                issues.map((issue, i) => (
                  <div key={i} className={`rounded-lg p-3 text-xs ${
                    issue.type === 'warning'
                      ? 'bg-red-50 border border-red-100'
                      : issue.type === 'suggestion'
                      ? 'bg-yellow-50 border border-yellow-100'
                      : 'bg-blue-50 border border-blue-100'
                  }`}>
                    <div className="flex items-start gap-2">
                      <span className="text-base leading-none">{issue.icon}</span>
                      <div>
                        <p className="font-semibold text-gray-800">{issue.title}</p>
                        <p className="text-gray-600 mt-0.5">{issue.detail}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'improved' && (
            <div>
              {!improvedDraft && !isAILoading ? (
                <div className="text-center py-6">
                  <p className="text-sm text-gray-600 mb-3">Get an AI-improved version of your draft</p>
                  <button
                    onClick={runAIAnalysis}
                    className="px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 transition-colors"
                  >
                    ✨ Generate Improved Draft
                  </button>
                </div>
              ) : isAILoading ? (
                <div className="text-center py-6">
                  <div className="inline-block w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mb-2" />
                  <p className="text-xs text-gray-500">Analyzing your draft...</p>
                </div>
              ) : (
                <div>
                  <p className="text-xs text-gray-500 mb-2">AI-improved version:</p>
                  <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-700 whitespace-pre-wrap leading-relaxed border border-gray-200 max-h-36 overflow-y-auto">
                    {improvedDraft}
                  </div>
                  <button
                    onClick={() => { onImprove(improvedDraft!); onDismiss(); }}
                    className="mt-2 w-full px-3 py-2 bg-purple-600 text-white text-xs rounded-lg hover:bg-purple-700 transition-colors"
                  >
                    Use Improved Version
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex gap-2 px-4 py-3 border-t border-gray-100 bg-gray-50">
          {!isAILoading && tab !== 'improved' && !improvedDraft && (
            <button
              onClick={runAIAnalysis}
              className="text-xs text-purple-600 hover:text-purple-800 underline"
            >
              {isAILoading ? 'Analyzing...' : '✨ Deep AI Analysis'}
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={onDismiss}
            className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Send Anyway
          </button>
          {improvedDraft && (
            <button
              onClick={() => { onImprove(improvedDraft); onDismiss(); }}
              className="px-3 py-1.5 text-xs bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              Use Improved
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ScoreDetail({ label, score, description }: { label: string; score: number; description: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 ${
        score >= 80 ? 'bg-green-500' : score >= 60 ? 'bg-yellow-500' : 'bg-red-500'
      }`}>
        {score}
      </div>
      <div>
        <p className="text-xs font-semibold text-gray-800">{label}</p>
        <p className="text-xs text-gray-500">{description}</p>
      </div>
    </div>
  );
}

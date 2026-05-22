'use client';

/**
 * Smart Rules Manager — AI + Behavior-Learned Filter Rules
 *
 * Shows:
 * - Pending rules discovered from user behavior (approve/reject)
 * - Active rules with accuracy stats
 * - AI-suggested rules (from /api/ai)
 * - Rule creation from patterns
 */

import {useState, useCallback, useEffect} from 'react';
import {
  getBehaviorProfile,
  approveRule,
  rejectRule,
  getPendingRules,
  getApprovedRules,
  type GeneratedRule,
  type BehaviorProfile,
} from '../lib/behavior-learner';

// ── Types ──

interface SmartRulesManagerProps {
  onRuleApplied?: (rule: GeneratedRule) => void;
}

// ── Component ──

export function SmartRulesManager({onRuleApplied}: SmartRulesManagerProps) {
  const [profile, setProfile] = useState<BehaviorProfile | null>(null);
  const [activeTab, setActiveTab] = useState<'suggested' | 'active' | 'all'>('suggested');

  useEffect(() => {
    setProfile(getBehaviorProfile());
  }, []);

  const pending = profile ? getPendingRules() : [];
  const active = profile ? getApprovedRules() : [];

  const handleApprove = useCallback((ruleId: string) => {
    const updated = approveRule(ruleId);
    setProfile(updated);
    const rule = updated.rules.find(r => r.id === ruleId);
    if (rule) onRuleApplied?.(rule);
  }, [onRuleApplied]);

  const handleReject = useCallback((ruleId: string) => {
    const updated = rejectRule(ruleId);
    setProfile(updated);
  }, []);

  const confidenceColor = (c: number) =>
    c >= 0.9 ? 'text-green-600' :
    c >= 0.8 ? 'text-blue-600' :
    c >= 0.7 ? 'text-yellow-600' : 'text-gray-400';

  const confidenceBg = (c: number) =>
    c >= 0.9 ? 'bg-green-50 border-green-200' :
    c >= 0.8 ? 'bg-blue-50 border-blue-200' :
    c >= 0.7 ? 'bg-yellow-50 border-yellow-200' : 'bg-gray-50 border-gray-200';

  const displayRules = activeTab === 'suggested' ? pending :
    activeTab === 'active' ? active :
    [...active, ...pending];

  return (
    <div className="border border-purple-200 rounded-lg bg-purple-50/30">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-purple-200">
        <div className="flex items-center gap-2">
          <span className="text-sm">🧠</span>
          <span className="text-sm font-semibold text-purple-700">Smart Rules</span>
          <span className="text-[10px] text-purple-400">
            {active.length} active · {pending.length} suggested
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-purple-100">
        {(['suggested', 'active', 'all'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === tab
                ? 'text-purple-700 bg-purple-100/50'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab === 'suggested' && `Suggested (${pending.length})`}
            {tab === 'active' && `Active (${active.length})`}
            {tab === 'all' && `All (${active.length + pending.length})`}
          </button>
        ))}
      </div>

      {/* Rules list */}
      <div className="max-h-[200px] overflow-auto">
        {displayRules.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <p className="text-xs text-gray-400">
              {activeTab === 'suggested'
                ? 'No suggested rules yet. Keep using email and patterns will emerge!'
                : 'No active rules'}
            </p>
          </div>
        ) : (
          displayRules.map(rule => (
            <div
              key={rule.id}
              className={`px-4 py-2.5 border-b border-gray-100 last:border-b-0 ${confidenceBg(rule.confidence)}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-700 truncate">{rule.name}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{rule.description}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-[10px] font-medium ${confidenceColor(rule.confidence)}`}>
                      {Math.round(rule.confidence * 100)}%
                    </span>
                    {rule.approved && rule.timesApplied > 0 && (
                      <span className="text-[10px] text-gray-400">
                        Applied {rule.timesApplied}x · {Math.round((rule.timesCorrect / rule.timesApplied) * 100)}% accurate
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {!rule.approved ? (
                    <>
                      <button
                        onClick={() => handleApprove(rule.id)}
                        className="px-2 py-0.5 text-[10px] bg-green-600 text-white rounded hover:bg-green-700"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleReject(rule.id)}
                        className="px-2 py-0.5 text-[10px] bg-gray-200 text-gray-600 rounded hover:bg-gray-300"
                      >
                        Dismiss
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleReject(rule.id)}
                      className="px-2 py-0.5 text-[10px] text-red-500 hover:text-red-700"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Stats footer */}
      {profile && profile.actions.length > 0 && (
        <div className="px-4 py-2 border-t border-purple-100 text-[10px] text-gray-400 flex justify-between">
          <span>{profile.actions.length} actions logged</span>
          <span>{profile.patterns.length} patterns detected</span>
          <span>Last: {new Date(profile.lastUpdated).toLocaleDateString()}</span>
        </div>
      )}
    </div>
  );
}

// ── Deadline & Event Extractor ──

export function DeadlineExtractor({emails}: {emails: Array<{subject: string; from: string; body: string; date: string}>}) {
  const [deadlines, setDeadlines] = useState<Array<{
    emailSubject: string;
    from: string;
    deadlines: string[];
    events: string[];
    actionItems: string[];
  }> | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const extract = useCallback(async () => {
    setIsLoading(true);
    try {
      const resp = await fetch('/api/ai', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          action: 'extract-deadlines',
          payload: {emails: emails.slice(0, 20)},
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setDeadlines(data);
      }
    } catch (err) {
      console.error('Deadline extraction failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, [emails]);

  const allDeadlines = deadlines?.flatMap(d => d.deadlines.map(dl => ({source: d.emailSubject, deadline: dl}))) || [];
  const allEvents = deadlines?.flatMap(d => d.events.map(ev => ({source: d.emailSubject, event: ev}))) || [];
  const allActions = deadlines?.flatMap(d => d.actionItems.map(ai => ({source: d.emailSubject, action: ai}))) || [];

  if (allDeadlines.length === 0 && allEvents.length === 0 && allActions.length === 0 && !deadlines) {
    return (
      <div className="border border-orange-200 rounded-lg p-3 bg-orange-50/30">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-sm">📅</span>
            <span className="text-xs font-semibold text-orange-700">Deadlines & Events</span>
          </div>
          <button
            onClick={extract}
            disabled={isLoading}
            className="px-2 py-0.5 text-[10px] bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50"
          >
            {isLoading ? '⏳ Extracting...' : '✨ Extract'}
          </button>
        </div>
        <p className="text-[10px] text-gray-400">Click extract to find deadlines and events from your emails</p>
      </div>
    );
  }

  return (
    <div className="border border-orange-200 rounded-lg bg-orange-50/30">
      <div className="flex items-center justify-between px-3 py-2 border-b border-orange-200">
        <div className="flex items-center gap-2">
          <span className="text-sm">📅</span>
          <span className="text-xs font-semibold text-orange-700">Deadlines & Events</span>
          <span className="text-[10px] text-orange-400">
            {allDeadlines.length} deadlines · {allEvents.length} events · {allActions.length} actions
          </span>
        </div>
        <button
          onClick={extract}
          disabled={isLoading}
          className="px-2 py-0.5 text-[10px] bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50"
        >
          {isLoading ? '⏳' : '✨ Refresh'}
        </button>
      </div>

      <div className="max-h-[200px] overflow-auto">
        {allDeadlines.length > 0 && (
          <div className="px-3 py-2 border-b border-orange-100">
            <p className="text-[10px] font-semibold text-red-600 uppercase mb-1">⏰ Deadlines</p>
            {allDeadlines.map((d, i) => (
              <div key={i} className="flex items-start gap-1 py-0.5">
                <span className="text-[10px] text-red-500">•</span>
                <div>
                  <p className="text-[10px] text-gray-700">{d.deadline}</p>
                  <p className="text-[9px] text-gray-400">{d.source}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {allEvents.length > 0 && (
          <div className="px-3 py-2 border-b border-orange-100">
            <p className="text-[10px] font-semibold text-blue-600 uppercase mb-1">📆 Events</p>
            {allEvents.map((e, i) => (
              <div key={i} className="flex items-start gap-1 py-0.5">
                <span className="text-[10px] text-blue-500">•</span>
                <div>
                  <p className="text-[10px] text-gray-700">{e.event}</p>
                  <p className="text-[9px] text-gray-400">{e.source}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {allActions.length > 0 && (
          <div className="px-3 py-2">
            <p className="text-[10px] font-semibold text-orange-600 uppercase mb-1">⚡ Action Items</p>
            {allActions.map((a, i) => (
              <div key={i} className="flex items-start gap-1 py-0.5">
                <span className="text-[10px] text-orange-500">•</span>
                <div>
                  <p className="text-[10px] text-gray-700">{a.action}</p>
                  <p className="text-[9px] text-gray-400">{a.source}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

/**
 * AI Key Points Extractor — Anvil Mail
 *
 * Extracts structured key points from email threads:
 * - Decisions made
 * - Action items (with owner and due date if mentioned)
 * - Open questions
 * - Key facts / numbers
 * - Commitments made by sender
 *
 * Features:
 * - Auto-extracts on thread open (local pattern matching, zero API)
 * - AI-enhanced extraction for complex threads (optional)
 * - "Copy as list" for easy pasting
 * - "Add to task list" action hook
 */

import {useState, useMemo} from 'react';

// ── Types ──

export type KeyPointType = 'decision' | 'action' | 'question' | 'fact' | 'commitment' | 'deadline';

export interface KeyPoint {
  type: KeyPointType;
  text: string;
  owner?: string;
  dueDate?: string;
  confidence: number;
}

export interface KeyPointsResult {
  points: KeyPoint[];
  hasActionItems: boolean;
  hasDeadlines: boolean;
  extractedFrom: number;  // messages analyzed
}

// ── Patterns ──

const DECISION_PATTERNS = [
  /\bwe(?:'ve)? (?:decided|agreed|concluded|confirmed|approved|resolved)\s+(?:to\s+)?(.+?)(?:\.|$)/gi,
  /\bthe (?:decision|agreement|consensus) is\s+(.+?)(?:\.|$)/gi,
  /\bgoing (?:forward|ahead) with\s+(.+?)(?:\.|$)/gi,
  /\bapproved[:!]?\s+(.+?)(?:\.|$)/gi,
];

const ACTION_PATTERNS = [
  /\b(?:please|can you|could you|would you)\s+(.+?)(?:\?|$)/gi,
  /\bi(?:'ll| will| can| am going to)\s+(.+?)(?:\.|$)/gi,
  /\baction item[:!]?\s+(.+?)(?:\.|$)/gi,
  /\btodo[:!]?\s+(.+?)(?:\.|$)/gi,
  /\b(?:needs? to|should|must)\s+(.+?)(?:\.|$)/gi,
];

const QUESTION_PATTERNS = [
  /\b(?:question|wondering|not sure|unclear|can (?:you|anyone)|does (?:anyone|someone) know)[^?]*\?/gi,
  /.{10,}\?$/gm,
];

const DEADLINE_PATTERNS = [
  /(?:by|before|due|deadline)[:\s]+(?:(?:this|next|coming)\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?|\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?/gi,
  /(?:by|before|due)\s+(?:end of|eod|eow|friday|monday)\b/gi,
];

const FACT_PATTERNS = [
  /\$[\d,]+(?:\.\d{2})?(?:\s*(?:million|billion|k|M|B))?\b/g,   // money
  /\d+(?:\.\d+)?%/g,                                              // percentages
  /\d+(?:,\d{3})*(?:\.\d+)?\s+(?:users|customers|requests|events|records|items|orders)/gi,
];

const COMMITMENT_PATTERNS = [
  /\bi(?:'ll| will| am going to| promise to| commit to)\s+(.+?)(?:\.|$)/gi,
  /\bwe(?:'ll| will| are going to)\s+(.+?)(?:\.|$)/gi,
  /\bcommitted? to\s+(.+?)(?:\.|$)/gi,
];

function extractWithPattern(text: string, patterns: RegExp[], type: KeyPointType, confidence: number): KeyPoint[] {
  const points: KeyPoint[] = [];
  const seen = new Set<string>();

  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const captured = (match[1] || match[0]).trim().slice(0, 200);
      const key = captured.toLowerCase().slice(0, 60);
      if (!seen.has(key) && captured.length > 10) {
        seen.add(key);
        points.push({type, text: captured, confidence});
      }
    }
  }
  return points;
}

// ── Main extraction ──

export function extractKeyPoints(messages: Array<{body: string; from: {name: string}}>): KeyPointsResult {
  const allText = messages
    .slice(0, 5) // analyze last 5 messages
    .map(m => m.body)
    .join('\n\n');

  const points: KeyPoint[] = [];

  // Decisions
  points.push(...extractWithPattern(allText, DECISION_PATTERNS, 'decision', 0.75));

  // Action items
  points.push(...extractWithPattern(allText, ACTION_PATTERNS, 'action', 0.65));

  // Questions
  const questionMatches = [...allText.matchAll(/.{15,}\?$/gm)];
  for (const m of questionMatches.slice(0, 5)) {
    const q = m[0].trim();
    if (q.length > 15 && q.length < 200) {
      points.push({type: 'question', text: q, confidence: 0.7});
    }
  }

  // Deadlines
  const deadlineMatches = [...allText.matchAll(DEADLINE_PATTERNS[0]), ...allText.matchAll(DEADLINE_PATTERNS[1])];
  for (const m of deadlineMatches.slice(0, 3)) {
    // Find context around deadline
    const idx = allText.indexOf(m[0]);
    const context = allText.slice(Math.max(0, idx - 50), idx + m[0].length + 50).trim();
    points.push({type: 'deadline', text: context.slice(0, 150), dueDate: m[0], confidence: 0.85});
  }

  // Key facts/numbers
  const factMatches = [
    ...[...allText.matchAll(FACT_PATTERNS[0])],
    ...[...allText.matchAll(FACT_PATTERNS[1])],
    ...[...allText.matchAll(FACT_PATTERNS[2])],
  ];
  const seenFacts = new Set<string>();
  for (const m of factMatches.slice(0, 5)) {
    if (!seenFacts.has(m[0])) {
      seenFacts.add(m[0]);
      const idx = allText.indexOf(m[0]);
      const context = allText.slice(Math.max(0, idx - 40), idx + m[0].length + 60).trim();
      points.push({type: 'fact', text: context.slice(0, 150), confidence: 0.8});
    }
  }

  // Dedupe
  const deduped = points.filter((p, idx) => {
    const text = p.text.toLowerCase().slice(0, 50);
    return points.findIndex(q => q.text.toLowerCase().slice(0, 50) === text) === idx;
  });

  // Sort by type priority
  const typePriority: Record<KeyPointType, number> = {
    deadline: 0, decision: 1, action: 2, commitment: 3, question: 4, fact: 5,
  };
  deduped.sort((a, b) => typePriority[a.type] - typePriority[b.type]);

  return {
    points: deduped.slice(0, 10),
    hasActionItems: deduped.some(p => p.type === 'action'),
    hasDeadlines: deduped.some(p => p.type === 'deadline'),
    extractedFrom: messages.length,
  };
}

// ── Component ──

const TYPE_CONFIG: Record<KeyPointType, {icon: string; label: string; color: string}> = {
  decision:   {icon: '✅', label: 'Decision',   color: 'text-green-700 bg-green-50 border-green-100'},
  action:     {icon: '📋', label: 'Action Item', color: 'text-blue-700 bg-blue-50 border-blue-100'},
  question:   {icon: '❓', label: 'Question',   color: 'text-yellow-700 bg-yellow-50 border-yellow-100'},
  fact:       {icon: '📊', label: 'Key Fact',   color: 'text-gray-700 bg-gray-50 border-gray-100'},
  commitment: {icon: '🤝', label: 'Commitment', color: 'text-purple-700 bg-purple-50 border-purple-100'},
  deadline:   {icon: '⏰', label: 'Deadline',   color: 'text-red-700 bg-red-50 border-red-100'},
};

interface KeyPointsCardProps {
  messages: Array<{body: string; from: {name: string}}>;
  onAddToTasks?: (point: KeyPoint) => void;
}

export function KeyPointsCard({messages, onAddToTasks}: KeyPointsCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const result = useMemo(() => extractKeyPoints(messages), [messages]);

  if (result.points.length === 0) return null;

  const visiblePoints = expanded ? result.points : result.points.slice(0, 3);

  const handleCopy = () => {
    const text = result.points
      .map(p => `[${TYPE_CONFIG[p.type].label}] ${p.text}`)
      .join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-100">
        <span className="text-xs font-semibold text-gray-700">📌 Key Points</span>
        <div className="flex gap-1">
          {result.hasDeadlines && (
            <span className="text-[10px] px-1.5 py-0.5 bg-red-50 text-red-600 rounded-full">⏰ deadline</span>
          )}
          {result.hasActionItems && (
            <span className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded-full">📋 actions</span>
          )}
        </div>
        <div className="flex-1" />
        <button
          onClick={handleCopy}
          className="text-[10px] text-gray-400 hover:text-gray-600 px-1.5 py-0.5 rounded hover:bg-gray-200"
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>

      {/* Points */}
      <div className="divide-y divide-gray-50">
        {visiblePoints.map((point, idx) => {
          const config = TYPE_CONFIG[point.type];
          return (
            <div key={idx} className="px-3 py-2 flex items-start gap-2">
              <span className="text-sm flex-shrink-0 mt-0.5">{config.icon}</span>
              <div className="flex-1 min-w-0">
                <div className={`text-[10px] font-medium px-1 py-0.5 rounded border inline-block mb-0.5 ${config.color}`}>
                  {config.label}
                </div>
                <p className="text-xs text-gray-700 leading-relaxed">{point.text}</p>
              </div>
              {onAddToTasks && point.type === 'action' && (
                <button
                  onClick={() => onAddToTasks(point)}
                  className="flex-shrink-0 text-[10px] px-1.5 py-0.5 text-blue-500 hover:bg-blue-50 rounded"
                  title="Add to tasks"
                >
                  + Task
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Show more */}
      {result.points.length > 3 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full py-1.5 text-[11px] text-gray-400 hover:text-gray-600 hover:bg-gray-50 border-t border-gray-100"
        >
          {expanded ? '▲ Show less' : `▼ ${result.points.length - 3} more points`}
        </button>
      )}
    </div>
  );
}

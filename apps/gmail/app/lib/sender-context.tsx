'use client';

/**
 * AI Sender Context — Conversation Memory for Anvil Mail
 *
 * Builds a persistent profile of each sender based on email history.
 * Surfaces context when you open an email from someone you've corresponded with.
 *
 * Features:
 * - Auto-builds sender profiles from thread history
 * - Tracks: topics discussed, sentiment patterns, response time, commitments
 * - Shows "Relationship context" panel when opening emails
 * - Highlights open/pending items from previous threads
 * - Detects follow-up opportunities
 */

// ── Types ──

export interface SenderProfile {
  email: string;
  name: string;
  messageCount: number;
  firstContactDate: string;
  lastContactDate: string;
  avgResponseTimeHours: number;
  topTopics: string[];
  openCommitments: string[];    // promises/to-dos extracted from threads
  sentiment: 'positive' | 'neutral' | 'negative' | 'mixed';
  importanceScore: number;      // 0–100 based on frequency, recency, reciprocity
  relationship: 'frequent' | 'occasional' | 'rare' | 'new';
  notes?: string;
}

export interface SenderContextResult {
  profile: SenderProfile;
  recentTopics: string[];
  openItems: string[];          // unresolved threads / unanswered questions
  suggestedContext: string;     // 1–2 sentence AI-generated context string
  warnings: string[];           // e.g., "hasn't replied in 3 weeks"
}

interface MailMessage {
  id: string;
  from: {name: string; email: string};
  to: {name: string; email: string}[];
  subject: string;
  body: string;
  date: string;
  threadId: string;
  read: boolean;
}

// ── Topic extraction (local, no AI) ──

const TOPIC_PATTERNS: Record<string, RegExp[]> = {
  'project update': [/project|milestone|sprint|roadmap|delivery|deadline/i],
  'meeting': [/meeting|call|sync|standup|video|zoom|teams|schedule/i],
  'invoice / billing': [/invoice|payment|billing|receipt|charge|subscription/i],
  'support': [/issue|bug|problem|error|help|support|not working/i],
  'proposal': [/proposal|quote|estimate|contract|agreement|scope/i],
  'feedback': [/feedback|review|thoughts|opinion|suggestion|comment/i],
  'hiring': [/interview|offer|candidate|resume|position|role|hire/i],
  'travel': [/flight|hotel|trip|travel|booking|itinerary/i],
  'legal': [/legal|contract|terms|nda|agreement|compliance/i],
  'social': [/lunch|dinner|coffee|catch up|weekend|family/i],
};

function extractTopics(messages: MailMessage[]): string[] {
  const scores: Record<string, number> = {};
  for (const msg of messages) {
    const text = `${msg.subject} ${msg.body}`.toLowerCase();
    for (const [topic, patterns] of Object.entries(TOPIC_PATTERNS)) {
      if (patterns.some(p => p.test(text))) {
        scores[topic] = (scores[topic] || 0) + 1;
      }
    }
  }
  return Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([topic]) => topic);
}

// ── Commitment / action item extraction ──

const COMMITMENT_PATTERNS = [
  /i('ll| will) (send|share|follow up|check|confirm|let you know|get back|review|prepare|set up)/gi,
  /i (promise|commit|guarantee|plan to|intend to)/gi,
  /can you (send|share|confirm|follow up|check|review|prepare|schedule)/gi,
  /please (send|share|confirm|follow up|check|review|prepare|schedule)/gi,
  /action (item|required|needed):/gi,
  /todo:|to-do:|next step:/gi,
];

function extractCommitments(messages: MailMessage[]): string[] {
  const commitments: string[] = [];
  for (const msg of messages.slice(-10)) { // check last 10 messages
    const text = msg.body;
    for (const pattern of COMMITMENT_PATTERNS) {
      pattern.lastIndex = 0;
      const matches = text.matchAll(new RegExp(pattern.source, 'gi'));
      for (const match of matches) {
        // Extract the sentence containing the match
        const start = Math.max(0, text.lastIndexOf('.', match.index || 0) + 1);
        const end = text.indexOf('.', (match.index || 0) + match[0].length);
        const sentence = text.slice(start, end > 0 ? end + 1 : start + 120).trim();
        if (sentence.length > 10 && sentence.length < 150) {
          commitments.push(sentence);
        }
        if (commitments.length >= 3) break;
      }
      if (commitments.length >= 3) break;
    }
    if (commitments.length >= 3) break;
  }
  return [...new Set(commitments)].slice(0, 3);
}

// ── Sentiment analysis (local heuristic) ──

function analyzeSentiment(messages: MailMessage[]): SenderProfile['sentiment'] {
  const posWords = ['thank', 'great', 'excellent', 'love', 'appreciate', 'wonderful', 'happy', 'glad', 'perfect', 'brilliant'];
  const negWords = ['unfortunately', 'problem', 'issue', 'concerned', 'disappointed', 'frustrated', 'fail', 'wrong', 'bad'];

  let posCount = 0;
  let negCount = 0;

  for (const msg of messages.slice(-5)) {
    const text = msg.body.toLowerCase();
    posCount += posWords.filter(w => text.includes(w)).length;
    negCount += negWords.filter(w => text.includes(w)).length;
  }

  if (posCount > negCount * 2) return 'positive';
  if (negCount > posCount * 2) return 'negative';
  if (posCount > 0 && negCount > 0) return 'mixed';
  return 'neutral';
}

// ── Avg response time ──

function calcAvgResponseTime(messages: MailMessage[], myEmail: string): number {
  const pairs: number[] = [];
  for (let i = 1; i < messages.length; i++) {
    const prev = messages[i - 1];
    const curr = messages[i];
    // Find when I received → I replied
    if (prev.from.email !== myEmail && curr.from.email === myEmail) {
      const received = new Date(prev.date).getTime();
      const replied = new Date(curr.date).getTime();
      const diffHours = (replied - received) / (1000 * 60 * 60);
      if (diffHours > 0 && diffHours < 168) pairs.push(diffHours); // < 1 week
    }
  }
  if (pairs.length === 0) return 0;
  return Math.round(pairs.reduce((a, b) => a + b, 0) / pairs.length);
}

// ── Build sender profile ──

export function buildSenderProfile(
  senderEmail: string,
  senderName: string,
  allMessages: MailMessage[],
  myEmail: string = 'me@anvil.local',
): SenderProfile {
  const senderMessages = allMessages.filter(
    m => m.from.email === senderEmail || m.to.some(t => t.email === senderEmail),
  );

  if (senderMessages.length === 0) {
    return {
      email: senderEmail,
      name: senderName,
      messageCount: 0,
      firstContactDate: new Date().toISOString(),
      lastContactDate: new Date().toISOString(),
      avgResponseTimeHours: 0,
      topTopics: [],
      openCommitments: [],
      sentiment: 'neutral',
      importanceScore: 0,
      relationship: 'new',
    };
  }

  const sorted = [...senderMessages].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const lastDate = new Date(sorted[sorted.length - 1].date);
  const firstDate = new Date(sorted[0].date);
  const now = new Date();
  const daysSinceLast = (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24);
  const daysSinceFirst = (now.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24);

  // Importance: frequency * recency bonus
  const freq = senderMessages.length / Math.max(daysSinceFirst / 30, 1); // msgs/month
  const recencyBonus = daysSinceLast < 7 ? 30 : daysSinceLast < 30 ? 15 : 0;
  const importanceScore = Math.min(100, Math.round(freq * 10 + recencyBonus));

  const relationship: SenderProfile['relationship'] =
    senderMessages.length === 1 ? 'new' :
    freq >= 4 ? 'frequent' :
    freq >= 1 ? 'occasional' : 'rare';

  return {
    email: senderEmail,
    name: senderName,
    messageCount: senderMessages.length,
    firstContactDate: firstDate.toISOString(),
    lastContactDate: lastDate.toISOString(),
    avgResponseTimeHours: calcAvgResponseTime(sorted, myEmail),
    topTopics: extractTopics(senderMessages),
    openCommitments: extractCommitments(sorted),
    sentiment: analyzeSentiment(senderMessages.filter(m => m.from.email === senderEmail)),
    importanceScore,
    relationship,
  };
}

// ── Build context result ──

export function buildSenderContext(
  profile: SenderProfile,
  currentEmail: MailMessage,
): SenderContextResult {
  const warnings: string[] = [];

  const daysSinceLast = (new Date().getTime() - new Date(profile.lastContactDate).getTime()) / (1000 * 60 * 60 * 24);

  if (daysSinceLast > 30 && profile.messageCount > 2) {
    warnings.push(`No contact in ${Math.round(daysSinceLast)} days — check if a follow-up is needed`);
  }
  if (profile.avgResponseTimeHours > 48 && profile.avgResponseTimeHours > 0) {
    warnings.push(`Typically responds in ${Math.round(profile.avgResponseTimeHours / 24)} days — plan accordingly`);
  }

  // Build context string
  let suggestedContext = '';
  if (profile.relationship === 'new') {
    suggestedContext = `First contact from ${profile.name}.`;
  } else {
    const topicStr = profile.topTopics.slice(0, 2).join(' and ');
    const relStr = profile.relationship === 'frequent' ? 'frequent contact' : 'occasional contact';
    suggestedContext = `${profile.name} is a ${relStr} (${profile.messageCount} messages)`;
    if (topicStr) suggestedContext += `, usually about ${topicStr}`;
    if (profile.sentiment === 'positive') suggestedContext += '. Generally positive tone.';
    else if (profile.sentiment === 'negative') suggestedContext += '. Some tension in past threads.';
    suggestedContext += '.';
  }

  // Recent topics from current + previous context
  const recentTopics = extractTopics([currentEmail, ...profile.topTopics.map(t => ({
    id: t, from: {name: '', email: ''}, to: [], subject: t, body: t, date: '', threadId: '', read: true,
  }))]);

  return {
    profile,
    recentTopics,
    openItems: profile.openCommitments,
    suggestedContext,
    warnings,
  };
}

// ── SenderContextBadge Component ──

import {useState, useMemo} from 'react';

interface SenderContextBadgeProps {
  senderEmail: string;
  senderName: string;
  allMessages: MailMessage[];
  currentEmail: MailMessage;
  myEmail?: string;
}

const sentimentEmoji: Record<SenderProfile['sentiment'], string> = {
  positive: '😊',
  neutral: '😐',
  negative: '😟',
  mixed: '🤔',
};

const relationshipColor: Record<SenderProfile['relationship'], string> = {
  frequent: 'text-green-700 bg-green-50',
  occasional: 'text-blue-700 bg-blue-50',
  rare: 'text-yellow-700 bg-yellow-50',
  new: 'text-gray-700 bg-gray-50',
};

export function SenderContextBadge({
  senderEmail, senderName, allMessages, currentEmail, myEmail,
}: SenderContextBadgeProps) {
  const [expanded, setExpanded] = useState(false);

  const profile = useMemo(
    () => buildSenderProfile(senderEmail, senderName, allMessages, myEmail),
    [senderEmail, senderName, allMessages, myEmail],
  );

  const context = useMemo(
    () => buildSenderContext(profile, currentEmail),
    [profile, currentEmail],
  );

  if (profile.relationship === 'new' && profile.messageCount === 0) return null;

  const colorClass = relationshipColor[profile.relationship];

  return (
    <div className="mb-3">
      {/* Compact badge */}
      <button
        onClick={() => setExpanded(e => !e)}
        className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full font-medium ${colorClass} hover:opacity-80 transition-opacity`}
      >
        <span>{sentimentEmoji[profile.sentiment]}</span>
        <span>{profile.messageCount} previous messages</span>
        {profile.topTopics[0] && <span>· {profile.topTopics[0]}</span>}
        <span className="text-gray-400">{expanded ? '▲' : '▼'}</span>
      </button>

      {/* Expanded panel */}
      {expanded && (
        <div className="mt-2 border border-gray-100 rounded-xl bg-white shadow-sm overflow-hidden">
          {/* Header */}
          <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
            <div className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
              <span>🧠</span> Sender Context
            </div>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${colorClass}`}>
              {profile.relationship}
            </span>
          </div>

          <div className="p-3 space-y-2.5">
            {/* Context summary */}
            <p className="text-xs text-gray-600 leading-relaxed">{context.suggestedContext}</p>

            {/* Stats row */}
            <div className="flex items-center gap-3 text-[11px] text-gray-500">
              <span title="Messages exchanged">📨 {profile.messageCount} msgs</span>
              {profile.avgResponseTimeHours > 0 && (
                <span title="Average response time">
                  ⏱️ ~{profile.avgResponseTimeHours < 24
                    ? `${profile.avgResponseTimeHours}h`
                    : `${Math.round(profile.avgResponseTimeHours / 24)}d`} response
                </span>
              )}
              <span title="Importance score">⭐ {profile.importanceScore}%</span>
            </div>

            {/* Topics */}
            {profile.topTopics.length > 0 && (
              <div className="space-y-1">
                <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Usual topics</div>
                <div className="flex flex-wrap gap-1">
                  {profile.topTopics.map(t => (
                    <span key={t} className="text-[11px] px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded-full">{t}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Open commitments */}
            {context.openItems.length > 0 && (
              <div className="space-y-1">
                <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Open items</div>
                <ul className="space-y-0.5">
                  {context.openItems.map((item, i) => (
                    <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                      <span className="text-orange-400 mt-0.5 flex-shrink-0">⚠</span>
                      <span className="line-clamp-2">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Warnings */}
            {context.warnings.length > 0 && (
              <div className="space-y-0.5">
                {context.warnings.map((w, i) => (
                  <div key={i} className="text-xs text-amber-600 flex items-start gap-1.5 bg-amber-50 rounded px-2 py-1">
                    <span className="flex-shrink-0">⚠️</span>
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

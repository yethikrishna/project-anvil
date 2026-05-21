'use client';

/**
 * Enhanced AI Mail Features
 *
 * - Enhanced inbox categories (Primary, Updates, Action Needed, FYI)
 * - Thread summary generation
 * - AI compose with context + writing style
 * - Smart reply suggestions
 * - Semantic email search
 * - Smart filter rules
 */

import {createAI} from '@anvil/ai';

// ── Types ──

export interface MailMessage {
  id: string;
  from: {name: string; email: string};
  to: {name: string; email: string}[];
  cc?: {name: string; email: string}[];
  subject: string;
  body: string;
  htmlBody?: string;
  date: string;
  read: boolean;
  starred: boolean;
  labels: string[];
  threadId: string;
  attachments?: {name: string; size: string; type: string}[];
}

export type InboxCategory = 'primary' | 'updates' | 'action-needed' | 'fyi';

export interface CategorizedInbox {
  category: InboxCategory;
  confidence: number;
  reasoning?: string;
}

export interface ThreadSummary {
  summary: string;
  keyPoints: string[];
  actionItems: string[];
  participants: string[];
  sentiment: 'positive' | 'neutral' | 'negative' | 'urgent';
}

export interface SmartReply {
  text: string;
  tone: 'professional' | 'casual' | 'brief';
}

export interface SmartFilter {
  id: string;
  name: string;
  description: string;
  condition: {
    fromPattern?: string;
    subjectPattern?: string;
    category?: InboxCategory;
  };
  action: {
    label?: string;
    archive?: boolean;
    star?: boolean;
  };
  confidence: number;
}

// ── Enhanced Inbox Categorizer ──

const INBOX_RULES: Record<InboxCategory, {
  fromPatterns: RegExp[];
  subjectPatterns: RegExp[];
  bodyPatterns: RegExp[];
  keywords: string[];
}> = {
  'primary': {
    fromPatterns: [/@company\./i, /@corp\./i, /gmail\.com$/i, /yahoo\.com$/i, /icloud\.com$/i],
    subjectPatterns: [/re:/i, /fwd:/i, /meeting/i, /project/i, /review/i],
    bodyPatterns: [/how are you/i, /let'?s /i, /can you/i, /please review/i, /need your/i],
    keywords: ['meeting', 'project', 'review', 'deadline', 'urgent', 'important', 'approval', 'decision', 'feedback', 'collaborate'],
  },
  'updates': {
    fromPatterns: [/noreply@/i, /no-reply@/i, /notifications@/i, /newsletter@/i, /digest@/i, /@github\.com$/i, /@vercel\.com$/i, /@stripe\.com$/i],
    subjectPatterns: [/deploy/i, /merged/i, /build/i, /notification/i, /update/i, /weekly/i, /digest/i],
    bodyPatterns: [/unsubscribe/i, /view in browser/i, /deployment/i, /build successful/i],
    keywords: ['deploy', 'merged', 'build', 'notification', 'update', 'ci/cd', 'pipeline', 'release'],
  },
  'action-needed': {
    fromPatterns: [],
    subjectPatterns: [/action required/i, /please review/i, /approval needed/i, /urgent/i, /asap/i, /time.?sensitive/i, /response needed/i],
    bodyPatterns: [/please (review|approve|respond|complete)/i, /action (required|needed)/i, /deadline/i, /due by/i, /urgent/i, /asap/i],
    keywords: ['approve', 'review', 'sign', 'confirm', 'respond', 'deadline', 'urgent', 'asap', 'action required', 'time-sensitive'],
  },
  'fyi': {
    fromPatterns: [/newsletter@/i, /digest@/i, /noreply@.*mailchimp/i, /noreply@.*substack/i],
    subjectPatterns: [/fyi/i, /for your information/i, /newsletter/i, /digest/i, /announcement/i],
    bodyPatterns: [/fyi/i, /for your information/i, /just sharing/i, /thought you'?d be interested/i],
    keywords: ['fyi', 'newsletter', 'digest', 'announcement', 'sharing', 'update', 'information'],
  },
};

export function classifyInboxCategory(email: {subject: string; from: string; body: string}): CategorizedInbox {
  const text = `${email.subject} ${email.from} ${email.body}`.toLowerCase();
  const scores: Record<InboxCategory, number> = {primary: 0, updates: 0, 'action-needed': 0, fyi: 0};

  for (const [category, rules] of Object.entries(INBOX_RULES)) {
    let score = 0;

    for (const keyword of rules.keywords) {
      const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      const matches = text.match(regex);
      if (matches) score += matches.length;
    }

    for (const pattern of rules.fromPatterns) {
      if (pattern.test(email.from)) score += 4;
    }

    for (const pattern of rules.subjectPatterns) {
      if (pattern.test(email.subject)) score += 3;
    }

    for (const pattern of rules.bodyPatterns) {
      if (pattern.test(email.body)) score += 2;
    }

    scores[category as InboxCategory] = score;
  }

  const sorted = Object.entries(scores).sort(([, a], [, b]) => b - a) as [InboxCategory, number][];
  const [topCategory, topScore] = sorted[0];
  const totalScore = sorted.reduce((sum, [, s]) => sum + s, 0);

  if (topScore < 1) return {category: 'primary', confidence: 0.3, reasoning: 'No strong signal'};

  const confidence = totalScore > 0 ? Math.min(topScore / totalScore, 1) : 0.5;
  const rules = INBOX_RULES[topCategory];
  const matched = rules.keywords.filter(kw => text.includes(kw.toLowerCase()));

  return {
    category: topCategory,
    confidence: Math.round(confidence * 100) / 100,
    reasoning: matched.length > 0 ? `Matched: ${matched.slice(0, 5).join(', ')}` : undefined,
  };
}

export const INBOX_CATEGORY_CONFIG: Record<InboxCategory, {label: string; color: string; icon: string}> = {
  'primary': {label: 'Primary', color: 'bg-blue-100 text-blue-700', icon: '📥'},
  'updates': {label: 'Updates', color: 'bg-green-100 text-green-700', icon: '🔔'},
  'action-needed': {label: 'Action Needed', color: 'bg-red-100 text-red-700', icon: '⚡'},
  'fyi': {label: 'FYI', color: 'bg-gray-100 text-gray-700', icon: '👁️'},
};

// ── Thread Summary Generator ──

export function generateThreadSummary(messages: MailMessage[]): ThreadSummary {
  if (messages.length === 0) {
    return {summary: 'Empty thread', keyPoints: [], actionItems: [], participants: [], sentiment: 'neutral'};
  }

  if (messages.length === 1) {
    const msg = messages[0];
    return {
      summary: msg.body.slice(0, 200),
      keyPoints: extractKeyPoints(msg.body),
      actionItems: extractActionItems(msg.body),
      participants: [msg.from.name],
      sentiment: detectSentiment(msg.body),
    };
  }

  // Multi-message thread analysis
  const sorted = [...messages].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const participants = [...new Set(sorted.map(m => m.from.name))];
  const allBodies = sorted.map(m => m.body).join('\n---\n');
  const subject = sorted[0].subject;

  const keyPoints = extractKeyPoints(allBodies);
  const actionItems = extractActionItems(allBodies);
  const sentiment = detectSentiment(allBodies);

  // Generate summary from thread
  const lastMsg = sorted[sorted.length - 1];
  const summary = `Thread about "${subject}" — ${sorted.length} messages between ${participants.slice(0, 3).join(', ')}${participants.length > 3 ? ` +${participants.length - 3} more` : ''}. Latest from ${lastMsg.from.name}: ${lastMsg.body.slice(0, 100)}...`;

  return {summary, keyPoints, actionItems, participants, sentiment};
}

function extractKeyPoints(text: string): string[] {
  const points: string[] = [];
  const sentences = text.split(/[.!?\n]+/).filter(s => s.trim().length > 10);

  // Look for sentences that contain key indicators
  const indicators = ['key point', 'important', 'note that', 'remember', 'decision', 'agreed', 'concluded'];
  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    if (indicators.some(ind => lower.includes(ind))) {
      points.push(sentence.trim().slice(0, 100));
      if (points.length >= 3) break;
    }
  }

  // If no indicator-based points, take first few substantive sentences
  if (points.length === 0) {
    for (const sentence of sentences.slice(0, 5)) {
      if (sentence.trim().length > 20 && !sentence.toLowerCase().includes('unsubscribe')) {
        points.push(sentence.trim().slice(0, 100));
        if (points.length >= 2) break;
      }
    }
  }

  return points;
}

function extractActionItems(text: string): string[] {
  const items: string[] = [];
  const patterns = [
    /(?:todo|action item|action|task|please|need to|must|should|deadline)\s*:?\s*(.+?)(?:\n|$)/gi,
    /☐\s*(.+?)(?:\n|$)/g,
    /(?:need|needs)\s+(?:to\s+)?(.+?)(?:\s+by\s+|$)/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) && items.length < 5) {
      const item = match[1]?.trim();
      if (item && item.length > 5 && item.length < 150) {
        items.push(item);
      }
    }
  }

  return items;
}

function detectSentiment(text: string): 'positive' | 'neutral' | 'negative' | 'urgent' {
  const lower = text.toLowerCase();
  const urgentWords = ['urgent', 'asap', 'immediately', 'critical', 'emergency', 'time-sensitive', 'deadline today'];
  const positiveWords = ['great', 'thanks', 'awesome', 'congratulations', 'well done', 'excellent', 'perfect'];
  const negativeWords = ['issue', 'problem', 'error', 'failed', 'broken', 'unfortunately', 'sorry', 'bug'];

  if (urgentWords.some(w => lower.includes(w))) return 'urgent';
  const posCount = positiveWords.filter(w => lower.includes(w)).length;
  const negCount = negativeWords.filter(w => lower.includes(w)).length;
  if (negCount > posCount + 1) return 'negative';
  if (posCount > negCount + 1) return 'positive';
  return 'neutral';
}

// ── Smart Reply Suggestions ──

export function generateSmartReplies(thread: MailMessage[]): SmartReply[] {
  if (thread.length === 0) return [];

  const sorted = [...thread].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const lastMsg = sorted[sorted.length - 1];
  const sentiment = detectSentiment(lastMsg.body);
  const hasQuestion = lastMsg.body.includes('?');
  const actionItems = extractActionItems(lastMsg.body);

  const replies: SmartReply[] = [];

  // Context-aware replies
  if (sentiment === 'urgent') {
    replies.push({text: 'On it — will get back to you shortly.', tone: 'brief'});
    replies.push({text: `Thanks for flagging this. I'll review and respond with an update by end of day.`, tone: 'professional'});
  }

  if (hasQuestion) {
    replies.push({text: 'Let me check on that and get back to you.', tone: 'casual'});
    replies.push({text: 'Good question — I\'ll look into this and follow up with details.', tone: 'professional'});
  }

  if (actionItems.length > 0) {
    replies.push({text: `Acknowledged. I'll handle ${actionItems.length > 1 ? 'these items' : 'this'} and share an update.`, tone: 'professional'});
  }

  // Generic contextual replies
  if (lastMsg.from.email !== 'me@anvil.local') {
    const firstName = lastMsg.from.name.split(' ')[0];
    replies.push({text: `Thanks ${firstName}!`, tone: 'brief'});
    replies.push({text: `Got it, ${firstName}. I'll take a look and follow up.`, tone: 'casual'});
  }

  // Deduplicate and limit
  const seen = new Set<string>();
  return replies.filter(r => {
    if (seen.has(r.text)) return false;
    seen.add(r.text);
    return true;
  }).slice(0, 3);
}

// ── AI Compose with Context ──

export function buildComposeContext(thread: MailMessage[]): {
  threadSummary: string;
  recentMessages: string[];
  participants: string[];
  writingStyleHints: string;
} {
  if (thread.length === 0) {
    return {threadSummary: '', recentMessages: [], participants: [], writingStyleHints: 'Professional and concise.'};
  }

  const sorted = [...thread].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const participants = [...new Set(sorted.map(m => m.from.name))];
  const recentMessages = sorted.slice(-3).map(m => `[${m.from.name}]: ${m.body.slice(0, 300)}`);
  const threadSummary = `Re: ${sorted[0].subject} — ${sorted.length} messages`;

  // Analyze writing style from user's previous messages
  const userMessages = sorted.filter(m => m.from.email === 'me@anvil.local');
  let writingStyleHints = 'Professional and concise.';
  if (userMessages.length > 0) {
    const avgLength = userMessages.reduce((sum, m) => sum + m.body.length, 0) / userMessages.length;
    const usesEmoji = userMessages.some(m => /[\u{1F600}-\u{1F64F}]/u.test(m.body));
    const usesContractions = userMessages.some(m => /\b(I'm|don't|can't|won't|let's|that's)\b/i.test(m.body));

    if (avgLength < 100) writingStyleHints = 'Brief and direct.';
    else if (avgLength > 500) writingStyleHints = 'Detailed and thorough.';
    if (usesContractions) writingStyleHints = 'Conversational and natural.';
    if (usesEmoji) writingStyleHints = 'Friendly with occasional emoji.';
  }

  return {threadSummary, recentMessages, participants, writingStyleHints};
}

// ── Semantic Email Search ──

export function semanticSearchEmails(
  query: string,
  emails: MailMessage[],
  options?: {maxResults?: number; minScore?: number}
): Array<{email: MailMessage; score: number; matchedFields: string[]}> {
  const maxResults = options?.maxResults ?? 20;
  const minScore = options?.minScore ?? 0.1;

  const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 1);
  if (queryTerms.length === 0) return [];

  const results: Array<{email: MailMessage; score: number; matchedFields: string[]}> = [];

  for (const email of emails) {
    let score = 0;
    const matchedFields: string[] = [];

    // Subject match (high weight)
    const subjectLower = email.subject.toLowerCase();
    for (const term of queryTerms) {
      if (subjectLower.includes(term)) {
        score += 3;
        if (!matchedFields.includes('subject')) matchedFields.push('subject');
      }
    }

    // From match
    const fromLower = `${email.from.name} ${email.from.email}`.toLowerCase();
    for (const term of queryTerms) {
      if (fromLower.includes(term)) {
        score += 2;
        if (!matchedFields.includes('from')) matchedFields.push('from');
      }
    }

    // Body match
    const bodyLower = email.body.toLowerCase();
    for (const term of queryTerms) {
      const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const matches = bodyLower.match(regex);
      if (matches) {
        score += matches.length * 0.5;
        if (!matchedFields.includes('body')) matchedFields.push('body');
      }
    }

    // Semantic proximity bonus — if multiple terms appear close together
    if (queryTerms.length > 1) {
      const fullText = `${email.subject} ${email.body}`.toLowerCase();
      for (let i = 0; i < queryTerms.length - 1; i++) {
        const pos1 = fullText.indexOf(queryTerms[i]);
        const pos2 = fullText.indexOf(queryTerms[i + 1]);
        if (pos1 >= 0 && pos2 >= 0 && Math.abs(pos1 - pos2) < 100) {
          score += 2; // Proximity bonus
        }
      }
    }

    // Recency bonus
    const daysSinceEmail = (Date.now() - new Date(email.date).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceEmail < 7) score += 1;
    if (daysSinceEmail < 1) score += 1;

    if (score >= minScore) {
      results.push({email, score, matchedFields});
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, maxResults);
}

// ── Smart Filter Generator ──

export function generateSmartFilters(emails: MailMessage[]): SmartFilter[] {
  const filters: SmartFilter[] = [];

  // Analyze sender patterns
  const senderCounts: Record<string, {count: number; categories: InboxCategory[]; subjects: string[]}> = {};
  for (const email of emails) {
    const domain = email.from.email.split('@')[1] || 'unknown';
    if (!senderCounts[domain]) {
      senderCounts[domain] = {count: 0, categories: [], subjects: []};
    }
    senderCounts[domain].count++;
    senderCounts[domain].subjects.push(email.subject);
    const cat = classifyInboxCategory({subject: email.subject, from: email.from.email, body: email.body});
    senderCounts[domain].categories.push(cat.category);
  }

  // Generate filters for high-volume senders
  for (const [domain, data] of Object.entries(senderCounts)) {
    if (data.count < 2) continue;

    const dominantCategory = mode(data.categories);
    if (!dominantCategory) continue;

    const filterMap: Record<InboxCategory, Omit<SmartFilter, 'id' | 'confidence'>> = {
      'updates': {
        name: `Auto-archive ${domain} notifications`,
        description: `Automatically archive emails from ${domain} (${data.count} messages)`,
        condition: {fromPattern: `@${domain}`, category: 'updates'},
        action: {archive: true},
      },
      'fyi': {
        name: `Label ${domain} as FYI`,
        description: `Auto-label ${domain} emails as FYI`,
        condition: {fromPattern: `@${domain}`, category: 'fyi'},
        action: {label: 'fyi'},
      },
      'primary': {
        name: `Star important ${domain} emails`,
        description: `Auto-star emails from ${domain}`,
        condition: {fromPattern: `@${domain}`, category: 'primary'},
        action: {star: true},
      },
      'action-needed': {
        name: `Flag ${domain} for action`,
        description: `Highlight action-needed emails from ${domain}`,
        condition: {fromPattern: `@${domain}`, category: 'action-needed'},
        action: {label: 'action-needed', star: true},
      },
    };

    const filterDef = filterMap[dominantCategory];
    if (filterDef) {
      filters.push({
        id: `filter-${domain}-${dominantCategory}`,
        ...filterDef,
        confidence: Math.min(data.count / 10, 0.9),
      });
    }
  }

  return filters.sort((a, b) => b.confidence - a.confidence).slice(0, 10);
}

function mode<T>(arr: T[]): T | undefined {
  const counts = new Map<T, number>();
  for (const item of arr) counts.set(item, (counts.get(item) || 0) + 1);
  let maxCount = 0;
  let result: T | undefined;
  for (const [item, count] of counts) {
    if (count > maxCount) { maxCount = count; result = item; }
  }
  return result;
}

// ── Unread Digest Generator ──

export function generateUnreadDigest(emails: MailMessage[]): {
  totalCount: number;
  urgentCount: number;
  actionNeeded: MailMessage[];
  summary: string;
  byCategory: Record<InboxCategory, MailMessage[]>;
} {
  const unread = emails.filter(e => !e.read);
  const byCategory: Record<InboxCategory, MailMessage[]> = {primary: [], updates: [], 'action-needed': [], fyi: []};

  for (const email of unread) {
    const cat = classifyInboxCategory({subject: email.subject, from: email.from.email, body: email.body});
    byCategory[cat.category].push(email);
  }

  const actionNeeded = unread.filter(e => {
    const cat = classifyInboxCategory({subject: e.subject, from: e.from.email, body: e.body});
    return cat.category === 'action-needed';
  });

  const urgentCount = unread.filter(e => detectSentiment(e.body) === 'urgent').length;

  const parts: string[] = [];
  if (byCategory['action-needed'].length > 0) parts.push(`${byCategory['action-needed'].length} need your action`);
  if (byCategory.primary.length > 0) parts.push(`${byCategory.primary.length} primary messages`);
  if (byCategory.updates.length > 0) parts.push(`${byCategory.updates.length} updates`);
  if (byCategory.fyi.length > 0) parts.push(`${byCategory.fyi.length} FYI`);

  const summary = parts.length > 0
    ? `You have ${unread.length} unread emails: ${parts.join(', ')}.`
    : 'No unread emails.';

  return {totalCount: unread.length, urgentCount, actionNeeded, summary, byCategory};
}

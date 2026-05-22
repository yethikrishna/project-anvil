'use client';

/**
 * Smart Priority Inbox — Enhanced with Follow-up Detection
 *
 * Combines multiple signals to score email priority:
 * 1. Follow-up commitments detected in email text
 * 2. Sender importance (learned from behavior)
 * 3. Deadline proximity
 * 4. Thread activity patterns
 * 5. Category-based heuristics
 *
 * Produces a composite priority score with reasoning.
 */

import {scanForFollowUps, type CommitmentItem, type ScannableEmail} from './follow-up-detector';
import {classifyEnhanced, type EnhancedCategoryResult} from './ai-categorizer-enhanced';

// ── Types ──

export interface PriorityScore {
  emailId: string;
  score: number;          // 0-100
  level: 'low' | 'medium' | 'high' | 'urgent';
  signals: PrioritySignal[];
  reasoning: string;
  followUpItem?: CommitmentItem;
  category: EnhancedCategoryResult;
}

export interface PrioritySignal {
  type: 'follow-up' | 'deadline' | 'sender-importance' | 'thread-activity' | 'category' | 'unread' | 'keyword';
  weight: number;
  description: string;
}

export interface SenderImportance {
  email: string;
  score: number;
  interactionCount: number;
  lastInteraction: number;
  labels: string[];
}

// ── Sender Importance Tracker ──

const SENDER_DB_KEY = 'anvil-sender-importance';

function loadSenderDB(): Map<string, SenderImportance> {
  try {
    const stored = localStorage.getItem(SENDER_DB_KEY);
    if (stored) {
      const entries = JSON.parse(stored) as SenderImportance[];
      return new Map(entries.map(e => [e.email, e]));
    }
  } catch {}
  return new Map();
}

function saveSenderDB(db: Map<string, SenderImportance>): void {
  try {
    const entries = [...db.values()].slice(-500);
    localStorage.setItem(SENDER_DB_KEY, JSON.stringify(entries));
  } catch {}
}

export function recordSenderInteraction(email: string, action: 'open' | 'reply' | 'star' | 'archive' | 'delete'): void {
  const db = loadSenderDB();
  const existing = db.get(email);

  if (existing) {
    existing.interactionCount++;
    existing.lastInteraction = Date.now();
    // Weight different actions
    const actionWeights: Record<string, number> = {reply: 3, star: 2, open: 1, archive: 0, delete: -1};
    existing.score = Math.max(0, existing.score + (actionWeights[action] || 0));
  } else {
    db.set(email, {
      email,
      score: action === 'reply' ? 3 : action === 'star' ? 2 : action === 'open' ? 1 : 0,
      interactionCount: 1,
      lastInteraction: Date.now(),
      labels: [],
    });
  }

  saveSenderDB(db);
}

export function getSenderImportance(email: string): SenderImportance | null {
  return loadSenderDB().get(email) || null;
}

// ── Deadline Proximity Scorer ──

function scoreDeadlineProximity(text: string): {score: number; deadline: string | null} {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  // Today/tomorrow = highest urgency
  if (/\b(?:today|by eod|by cob|asap|immediately)\b/i.test(text)) {
    return {score: 30, deadline: 'today'};
  }
  if (/\btomorrow\b/i.test(text)) {
    return {score: 25, deadline: 'tomorrow'};
  }
  if (/\bthis week\b/i.test(text)) {
    return {score: 15, deadline: 'this week'};
  }
  if (/\bnext week\b/i.test(text)) {
    return {score: 10, deadline: 'next week'};
  }
  if (/\b(?:this|next) month\b/i.test(text)) {
    return {score: 5, deadline: 'this month'};
  }

  return {score: 0, deadline: null};
}

// ── Thread Activity Scorer ──

function scoreThreadActivity(threadMessageCount: number, lastMessageAge: number): number {
  // Active threads (many messages, recent) score higher
  if (threadMessageCount >= 5 && lastMessageAge < 2 * dayMs) return 15;
  if (threadMessageCount >= 3 && lastMessageAge < dayMs) return 12;
  if (threadMessageCount >= 2 && lastMessageAge < dayMs) return 8;
  if (threadMessageCount >= 2) return 4;
  return 0;
}

const dayMs = 24 * 60 * 60 * 1000;

// ── Composite Priority Scorer ──

export function scoreEmailPriority(
  email: ScannableEmail & {read: boolean; starred: boolean; threadMessageCount?: number},
): PriorityScore {
  const signals: PrioritySignal[] = [];
  let totalScore = 0;
  const text = `${email.subject} ${email.body}`;

  // 1. Follow-up detection (weight: 25)
  const followUps = scanForFollowUps([email]);
  if (followUps.length > 0) {
    const fu = followUps[0];
    const fuScore = fu.priority === 'urgent' ? 25 : fu.priority === 'high' ? 20 : fu.priority === 'medium' ? 12 : 5;
    totalScore += fuScore;
    signals.push({
      type: 'follow-up',
      weight: fuScore,
      description: `Follow-up detected: ${fu.summary.slice(0, 60)}`,
    });
  }

  // 2. Deadline proximity (weight: 30)
  const deadlineResult = scoreDeadlineProximity(text);
  if (deadlineResult.score > 0) {
    totalScore += deadlineResult.score;
    signals.push({
      type: 'deadline',
      weight: deadlineResult.score,
      description: `Deadline: ${deadlineResult.deadline}`,
    });
  }

  // 3. Sender importance (weight: 20)
  const senderInfo = getSenderImportance(email.from.email);
  if (senderInfo && senderInfo.score > 0) {
    const senderScore = Math.min(20, senderInfo.score * 2);
    totalScore += senderScore;
    signals.push({
      type: 'sender-importance',
      weight: senderScore,
      description: `Important sender (${senderInfo.interactionCount} interactions)`,
    });
  }

  // 4. Thread activity (weight: 15)
  const threadCount = email.threadMessageCount || 1;
  const emailAge = Date.now() - new Date(email.date).getTime();
  const threadScore = scoreThreadActivity(threadCount, emailAge);
  if (threadScore > 0) {
    totalScore += threadScore;
    signals.push({
      type: 'thread-activity',
      weight: threadScore,
      description: `Active thread (${threadCount} messages)`,
    });
  }

  // 5. Category-based (weight: 10)
  const category = classifyEnhanced({subject: email.subject, from: email.from.email, body: email.body});
  const categoryScores: Record<string, number> = {
    'action-needed': 10,
    'primary': 5,
    'updates': 2,
    'fyi': 0,
  };
  const catScore = categoryScores[category.category] || 0;
  totalScore += catScore;
  signals.push({
    type: 'category',
    weight: catScore,
    description: `Category: ${category.category} (${Math.round(category.confidence * 100)}%)`,
  });

  // 6. Unread bonus
  if (!email.read) {
    totalScore += 3;
    signals.push({type: 'unread', weight: 3, description: 'Unread'});
  }

  // 7. Star bonus
  if (email.starred) {
    totalScore += 5;
    signals.push({type: 'keyword', weight: 5, description: 'Starred'});
  }

  // 8. Urgency keywords
  if (/\b(?:urgent|asap|critical|emergency|block|blocked)\b/i.test(text)) {
    totalScore += 15;
    signals.push({type: 'keyword', weight: 15, description: 'Urgency keywords detected'});
  }

  // Cap at 100
  totalScore = Math.min(100, totalScore);

  // Determine level
  const level = totalScore >= 70 ? 'urgent' : totalScore >= 45 ? 'high' : totalScore >= 20 ? 'medium' : 'low';

  const reasoning = signals.map(s => s.description).join(' · ');

  return {
    emailId: email.id,
    score: totalScore,
    level,
    signals,
    reasoning,
    followUpItem: followUps[0],
    category,
  };
}

/**
 * Batch score all emails in the inbox.
 */
export function scoreInbox(
  emails: Array<ScannableEmail & {read: boolean; starred: boolean; threadMessageCount?: number}>,
): PriorityScore[] {
  return emails
    .map(email => scoreEmailPriority(email))
    .sort((a, b) => b.score - a.score);
}

/**
 * Get inbox stats from priority scores.
 */
export function getPriorityStats(scores: PriorityScore[]): {
  total: number;
  urgent: number;
  high: number;
  medium: number;
  low: number;
  withFollowUps: number;
  avgScore: number;
} {
  return {
    total: scores.length,
    urgent: scores.filter(s => s.level === 'urgent').length,
    high: scores.filter(s => s.level === 'high').length,
    medium: scores.filter(s => s.level === 'medium').length,
    low: scores.filter(s => s.level === 'low').length,
    withFollowUps: scores.filter(s => s.followUpItem).length,
    avgScore: scores.length > 0 ? Math.round(scores.reduce((s, sc) => s + sc.score, 0) / scores.length) : 0,
  };
}

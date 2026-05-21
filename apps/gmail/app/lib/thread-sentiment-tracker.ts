'use client';

/**
 * Thread Sentiment Tracker
 *
 * Tracks sentiment progression across email threads:
 * - Per-message sentiment analysis
 * - Sentiment trajectory (improving, stable, degrading)
 * - Escalation detection
 * - Emotional tone keywords
 * - Visual sentiment timeline
 */

import {useMemo} from 'react';
import type {MailMessage} from './ai-mail';

// ── Types ──

export interface MessageSentiment {
  messageId: string;
  sentiment: 'positive' | 'neutral' | 'negative' | 'mixed';
  emotions: EmotionScore[];
  score: number; // -1 to 1
  keyPhrases: string[];
}

export interface EmotionScore {
  emotion: string;
  score: number; // 0-1
}

export interface ThreadSentimentReport {
  threadId: string;
  messages: MessageSentiment[];
  trajectory: 'improving' | 'stable' | 'degrading' | 'volatile';
  overallSentiment: 'positive' | 'neutral' | 'negative' | 'mixed';
  averageScore: number;
  hasEscalation: boolean;
  escalationPoint?: number; // Message index where escalation started
  emotionalArc: 'resolved' | 'unresolved' | 'ongoing' | 'deteriorating';
}

// ── Local Sentiment Analysis ──

const POSITIVE_WORDS = new Set([
  'great', 'excellent', 'amazing', 'wonderful', 'fantastic', 'perfect', 'love',
  'happy', 'glad', 'excited', 'thanks', 'thank you', 'appreciate', 'pleased',
  'delighted', 'awesome', 'brilliant', 'outstanding', 'superb', 'congratulations',
  'well done', 'impressive', 'successful', 'agreed', 'approved', 'confirmed',
  'welcome', 'enjoy', 'helpful', 'support', 'collaborate', 'achieve',
]);

const NEGATIVE_WORDS = new Set([
  'bad', 'terrible', 'horrible', 'awful', 'worst', 'hate', 'angry', 'frustrated',
  'disappointed', 'unhappy', 'unfortunately', 'sorry', 'apologize', 'issue',
  'problem', 'bug', 'error', 'fail', 'broken', 'wrong', 'concern', 'worried',
  'confused', 'difficult', 'impossible', 'reject', 'denied', 'cancel',
  'complaint', 'escalate', 'unacceptable', 'delay', 'overdue', 'critical',
]);

const URGENCY_WORDS = new Set([
  'urgent', 'asap', 'emergency', 'immediately', 'critical', 'escalate',
  'deadline', 'overdue', 'action required', 'important',
]);

function analyzeMessageSentiment(message: MailMessage): MessageSentiment {
  const text = `${message.subject} ${message.body}`.toLowerCase();
  const words = text.split(/\s+/).filter(w => w.length > 2);

  let positiveCount = 0;
  let negativeCount = 0;
  let urgencyCount = 0;
  const keyPhrases: string[] = [];
  const emotions: EmotionScore[] = [];

  for (const word of words) {
    if (POSITIVE_WORDS.has(word)) { positiveCount++; keyPhrases.push(word); }
    if (NEGATIVE_WORDS.has(word)) { negativeCount++; keyPhrases.push(word); }
    if (URGENCY_WORDS.has(word)) { urgencyCount++;
      if (!keyPhrases.includes(word)) keyPhrases.push(word); }
  }

  // Calculate base score (-1 to 1)
  const total = positiveCount + negativeCount || 1;
  let score = (positiveCount - negativeCount) / total;

  // Urgency adds negative bias
  if (urgencyCount > 0) {
    score -= urgencyCount * 0.1;
  }

  score = Math.max(-1, Math.min(1, score));

  // Determine overall sentiment
  let sentiment: MessageSentiment['sentiment'];
  if (score > 0.3) sentiment = 'positive';
  else if (score < -0.3) sentiment = 'negative';
  else if (positiveCount > 0 && negativeCount > 0) sentiment = 'mixed';
  else sentiment = 'neutral';

  // Emotions
  if (positiveCount > negativeCount) {
    emotions.push({emotion: 'satisfaction', score: Math.min(positiveCount / 10, 1)});
  }
  if (negativeCount > positiveCount) {
    emotions.push({emotion: 'frustration', score: Math.min(negativeCount / 10, 1)});
  }
  if (urgencyCount > 0) {
    emotions.push({emotion: 'urgency', score: Math.min(urgencyCount / 5, 1)});
  }
  if (text.includes('thank')) {
    emotions.push({emotion: 'gratitude', score: 0.8});
  }
  if (text.includes('sorry') || text.includes('apologize')) {
    emotions.push({emotion: 'remorse', score: 0.7});
  }
  if (text.includes('please') || text.includes('could you') || text.includes('would you')) {
    emotions.push({emotion: 'politeness', score: 0.6});
  }

  return {
    messageId: message.id,
    sentiment,
    emotions,
    score: Math.round(score * 100) / 100,
    keyPhrases: [...new Set(keyPhrases)].slice(0, 10),
  };
}

// ── Thread Analysis ──

export function analyzeThreadSentiment(messages: MailMessage[]): ThreadSentimentReport {
  const sorted = [...messages].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const messageSentiments = sorted.map(analyzeMessageSentiment);

  // Calculate trajectory
  const scores = messageSentiments.map(m => m.score);
  let trajectory: ThreadSentimentReport['trajectory'] = 'stable';

  if (scores.length >= 3) {
    const firstHalf = scores.slice(0, Math.floor(scores.length / 2));
    const secondHalf = scores.slice(Math.floor(scores.length / 2));
    const firstAvg = firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length;
    const diff = secondAvg - firstAvg;

    // Check volatility
    const diffs = scores.slice(1).map((s, i) => Math.abs(s - scores[i]));
    const avgDiff = diffs.reduce((s, v) => s + v, 0) / diffs.length;

    if (avgDiff > 0.4) trajectory = 'volatile';
    else if (diff > 0.2) trajectory = 'improving';
    else if (diff < -0.2) trajectory = 'degrading';
  }

  // Escalation detection
  let hasEscalation = false;
  let escalationPoint: number | undefined;
  for (let i = 1; i < scores.length; i++) {
    if (scores[i] - scores[i - 1] < -0.3) {
      hasEscalation = true;
      escalationPoint = i;
      break;
    }
  }

  // Overall sentiment
  const avgScore = scores.length > 0
    ? Math.round((scores.reduce((s, v) => s + v, 0) / scores.length) * 100) / 100
    : 0;

  let overallSentiment: ThreadSentimentReport['overallSentiment'];
  if (avgScore > 0.2) overallSentiment = 'positive';
  else if (avgScore < -0.2) overallSentiment = 'negative';
  else if (messageSentiments.some(m => m.sentiment === 'positive') &&
           messageSentiments.some(m => m.sentiment === 'negative')) overallSentiment = 'mixed';
  else overallSentiment = 'neutral';

  // Emotional arc
  let emotionalArc: ThreadSentimentReport['emotionalArc'];
  if (scores.length < 2) {
    emotionalArc = 'unresolved';
  } else {
    const lastScore = scores[scores.length - 1];
    if (lastScore > 0.1) emotionalArc = 'resolved';
    else if (lastScore < -0.1) emotionalArc = 'deteriorating';
    else if (hasEscalation) emotionalArc = 'deteriorating';
    else emotionalArc = 'ongoing';
  }

  return {
    threadId: messages[0]?.threadId || '',
    messages: messageSentiments,
    trajectory,
    overallSentiment,
    averageScore: avgScore,
    hasEscalation,
    escalationPoint,
    emotionalArc,
  };
}

// ── Hook ──

export function useThreadSentiment(messages: MailMessage[]) {
  return useMemo(() => analyzeThreadSentiment(messages), [messages]);
}

// ── Color Helpers ──

export function getSentimentColor(sentiment: MessageSentiment['sentiment']): string {
  switch (sentiment) {
    case 'positive': return 'text-green-600';
    case 'negative': return 'text-red-600';
    case 'mixed': return 'text-yellow-600';
    default: return 'text-gray-500';
  }
}

export function getSentimentBg(sentiment: MessageSentiment['sentiment']): string {
  switch (sentiment) {
    case 'positive': return 'bg-green-50';
    case 'negative': return 'bg-red-50';
    case 'mixed': return 'bg-yellow-50';
    default: return 'bg-gray-50';
  }
}

export function getTrajectoryLabel(trajectory: ThreadSentimentReport['trajectory']): {icon: string; label: string; color: string} {
  switch (trajectory) {
    case 'improving': return {icon: '📈', label: 'Improving', color: 'text-green-600'};
    case 'degrading': return {icon: '📉', label: 'Degrading', color: 'text-red-600'};
    case 'volatile': return {icon: '📊', label: 'Volatile', color: 'text-yellow-600'};
    default: return {icon: '➡️', label: 'Stable', color: 'text-gray-500'};
  }
}

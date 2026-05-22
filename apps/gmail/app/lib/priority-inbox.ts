'use client';

/**
 * Email Priority Heatmap
 *
 * Visualizes email priority with color-coded indicators:
 * - Heat score (0-100) based on sender, subject, urgency signals
 * - Color gradient from blue (low) → yellow (medium) → red (high)
 * - Sort by priority score
 * - Batch actions on high-priority emails
 */

import {useState, useMemo, useCallback} from 'react';
import type {MailMessage} from './ai-mail';

// ── Types ──

export interface PriorityScore {
  threadId: string;
  score: number;       // 0-100
  level: 'low' | 'medium' | 'high' | 'urgent';
  reasons: string[];   // Why this priority
  signals: PrioritySignal[];
}

export interface PrioritySignal {
  type: 'sender' | 'subject' | 'urgency-word' | 'question' | 'deadline' | 'thread-length' | 'attachment' | 'time-of-day';
  weight: number;
  description: string;
}

// ── Priority Scoring ──

function scoreEmailPriority(email: MailMessage, allEmails: MailMessage[]): PriorityScore {
  let score = 50; // Base score
  const signals: PrioritySignal[] = [];
  const reasons: string[] = [];

  const text = `${email.subject} ${email.body}`.toLowerCase();

  // 1. Urgency words
  const urgencyWords = [
    {words: ['urgent', 'asap', 'emergency', 'critical', 'immediately'], boost: 30, label: 'Urgent language'},
    {words: ['important', 'priority', 'time-sensitive', 'action required'], boost: 20, label: 'Important marker'},
    {words: ['deadline', 'due today', 'due tomorrow', 'overdue'], boost: 25, label: 'Deadline mentioned'},
    {words: ['please review', 'approval needed', 'needs your attention'], boost: 15, label: 'Action needed'},
  ];

  for (const group of urgencyWords) {
    if (group.words.some(w => text.includes(w))) {
      score += group.boost;
      signals.push({type: 'urgency-word', weight: group.boost, description: group.label});
      reasons.push(group.label);
    }
  }

  // 2. Questions
  const questionCount = (email.body.match(/\?/g) || []).length;
  if (questionCount > 0) {
    const boost = Math.min(questionCount * 5, 15);
    score += boost;
    signals.push({type: 'question', weight: boost, description: `${questionCount} question(s) asked`});
    reasons.push(`Contains ${questionCount} question(s)`);
  }

  // 3. Sender importance (heuristic)
  const senderDomain = email.from.email.split('@')[1];
  const importantDomains = ['ceo', 'cto', 'manager', 'director', 'vp', 'boss'];
  const senderName = email.from.name.toLowerCase();
  if (importantDomains.some(d => senderName.includes(d) || senderDomain?.includes(d))) {
    score += 20;
    signals.push({type: 'sender', weight: 20, description: 'Important sender'});
    reasons.push('From senior contact');
  }

  // 4. Thread length (long threads = likely important)
  const threadMessages = allEmails.filter(e => e.threadId === email.threadId);
  if (threadMessages.length > 5) {
    score += 10;
    signals.push({type: 'thread-length', weight: 10, description: 'Active thread'});
    reasons.push(`${threadMessages.length}-message thread`);
  }

  // 5. Attachments
  if (email.attachments && email.attachments.length > 0) {
    score += 5;
    signals.push({type: 'attachment', weight: 5, description: 'Has attachments'});
    reasons.push('Contains attachments');
  }

  // 6. Time-based: recent emails score higher
  const hoursSinceEmail = (Date.now() - new Date(email.date).getTime()) / (1000 * 60 * 60);
  if (hoursSinceEmail < 1) {
    score += 15;
    signals.push({type: 'time-of-day', weight: 15, description: 'Very recent (<1 hour)'});
    reasons.push('Received in the last hour');
  } else if (hoursSinceEmail < 4) {
    score += 10;
    signals.push({type: 'time-of-day', weight: 10, description: 'Recent (<4 hours)'});
  }

  // 7. Newsletter/marketing detection (lower score)
  const marketingSignals = ['unsubscribe', 'newsletter', 'promotion', 'marketing', 'no-reply', 'noreply'];
  if (marketingSignals.some(s => text.includes(s) || email.from.email.includes(s))) {
    score -= 30;
    signals.push({type: 'sender', weight: -30, description: 'Marketing/newsletter'});
    reasons.push('Likely marketing/newsletter');
  }

  // 8. FYI/no-action signals (lower score)
  const fyiSignals = ['fyi', 'for your information', 'just sharing', 'heads up', 'fwiw', 'no action needed'];
  if (fyiSignals.some(s => text.includes(s))) {
    score -= 15;
    signals.push({type: 'subject', weight: -15, description: 'FYI / informational'});
    reasons.push('Informational / no action needed');
  }

  // Clamp score
  score = Math.max(0, Math.min(100, score));

  // Determine level
  let level: PriorityScore['level'];
  if (score >= 80) level = 'urgent';
  else if (score >= 60) level = 'high';
  else if (score >= 40) level = 'medium';
  else level = 'low';

  return {threadId: email.threadId, score, level, reasons, signals};
}

// ── Hook ──

export function usePriorityInbox(messages: MailMessage[]) {
  const priorities = useMemo(() => {
    return messages
      .map(msg => ({email: msg, priority: scoreEmailPriority(msg, messages)}))
      .sort((a, b) => b.priority.score - a.priority.score);
  }, [messages]);

  const stats = useMemo(() => ({
    urgent: priorities.filter(p => p.priority.level === 'urgent').length,
    high: priorities.filter(p => p.priority.level === 'high').length,
    medium: priorities.filter(p => p.priority.level === 'medium').length,
    low: priorities.filter(p => p.priority.level === 'low').length,
    avgScore: priorities.length > 0
      ? Math.round(priorities.reduce((sum, p) => sum + p.priority.score, 0) / priorities.length)
      : 0,
  }), [priorities]);

  return {priorities, stats};
}

// ── Color Helper ──

export function getPriorityColor(score: number): string {
  if (score >= 80) return 'bg-red-500 text-white';
  if (score >= 60) return 'bg-orange-400 text-white';
  if (score >= 40) return 'bg-yellow-400 text-gray-900';
  return 'bg-blue-400 text-white';
}

export function getPriorityDotColor(score: number): string {
  if (score >= 80) return 'bg-red-500';
  if (score >= 60) return 'bg-orange-400';
  if (score >= 40) return 'bg-yellow-400';
  return 'bg-blue-300';
}

export function getPriorityBgColor(score: number): string {
  if (score >= 80) return 'bg-red-50 border-red-200';
  if (score >= 60) return 'bg-orange-50 border-orange-200';
  if (score >= 40) return 'bg-yellow-50 border-yellow-200';
  return 'bg-blue-50 border-blue-200';
}

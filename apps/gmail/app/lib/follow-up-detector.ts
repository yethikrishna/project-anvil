'use client';

/**
 * AI Follow-Up Detector
 *
 * Scans sent emails and threads to detect:
 * - Emails that haven't been replied to (need follow-up)
 * - Questions asked that haven't been answered
 * - Promises/deadlines mentioned that are approaching
 * - Stale threads that need attention
 *
 * Generates actionable follow-up reminders.
 */

import {useState, useCallback, useMemo} from 'react';
import type {MailMessage} from './ai-mail';

// ── Types ──

export interface FollowUpItem {
  type: 'no-reply' | 'unanswered-question' | 'approaching-deadline' | 'stale-thread';
  threadId: string;
  subject: string;
  from: string;
  date: string;
  urgency: 'low' | 'medium' | 'high';
  description: string;
  suggestedAction: string;
  daysSince: number;
}

// ── Detection ──

function detectQuestions(text: string): string[] {
  const questions: string[] = [];
  const sentences = text.split(/[.!?]+/);

  for (const sentence of sentences) {
    if (sentence.includes('?')) {
      const question = sentence.trim();
      if (question.length > 5 && question.length < 200) {
        questions.push(question);
      }
    }

    // Also detect implicit questions
    const implicitPatterns = [
      /let me know (if|when|whether|what|how)/i,
      /please (confirm|clarify|advise|let me know)/i,
      /can you/i,
      /could you/i,
      /would you/i,
      /do you know/i,
      /any (update|news|progress)/i,
      /what (do you|are your)/i,
    ];

    for (const pattern of implicitPatterns) {
      if (pattern.test(sentence)) {
        questions.push(sentence.trim());
        break;
      }
    }
  }

  return questions;
}

function detectDeadlines(text: string): Array<{deadline: string; context: string}> {
  const deadlines: Array<{deadline: string; context: string}> = [];

  const patterns = [
    /by (monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
    /by (tomorrow|next week|eod|eow|cob)/i,
    /before (\w+ \d{1,2})/i,
    /due (?:by|on|date:)?\s*(\w+ \d{1,2})/i,
    /deadline:?\s*(\w+ \d{1,2})/i,
    /(\d{1,2}\/\d{1,2}\/\d{2,4})/g,
    /by (end of (?:this|next) (?:week|month|quarter))/i,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      deadlines.push({
        deadline: match[1] || match[0],
        context: text.slice(Math.max(0, match.index - 50), Math.min(text.length, match.index + 50)).trim(),
      });
    }
  }

  return deadlines;
}

// ── Main Detector ──

export function detectFollowUps(
  messages: MailMessage[],
  currentUserEmail: string = 'me@anvil.local'
): FollowUpItem[] {
  const followUps: FollowUpItem[] = [];
  const now = Date.now();

  // Group by thread
  const threads = new Map<string, MailMessage[]>();
  for (const msg of messages) {
    if (!threads.has(msg.threadId)) {
      threads.set(msg.threadId, []);
    }
    threads.get(msg.threadId)!.push(msg);
  }

  for (const [threadId, threadMessages] of threads) {
    // Sort by date
    const sorted = [...threadMessages].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Check for emails I sent that haven't been replied to
    const myMessages = sorted.filter(m => m.from.email === currentUserEmail);
    const theirMessages = sorted.filter(m => m.from.email !== currentUserEmail);

    for (const myMsg of myMessages) {
      const myDate = new Date(myMsg.date).getTime();
      const daysSince = (now - myDate) / (1000 * 60 * 60 * 24);

      // Check if anyone replied after my message
      const repliesAfter = theirMessages.filter(m => new Date(m.date).getTime() > myDate);

      if (repliesAfter.length === 0 && daysSince > 1) {
        // Check if I asked questions
        const questions = detectQuestions(myMsg.body);
        const deadlines = detectDeadlines(myMsg.body);

        if (questions.length > 0) {
          followUps.push({
            type: 'unanswered-question',
            threadId,
            subject: myMsg.subject,
            from: theirMessages.length > 0 ? theirMessages[theirMessages.length - 1].from.name : 'unknown',
            date: myMsg.date,
            urgency: daysSince > 5 ? 'high' : daysSince > 3 ? 'medium' : 'low',
            description: `You asked ${questions.length} question(s) in "${myMsg.subject}" ${Math.floor(daysSince)} days ago`,
            suggestedAction: `Follow up with ${theirMessages.length > 0 ? theirMessages[theirMessages.length - 1].from.name : 'recipient'} about pending questions`,
            daysSince: Math.floor(daysSince),
          });
        } else if (daysSince > 3) {
          followUps.push({
            type: 'no-reply',
            threadId,
            subject: myMsg.subject,
            from: theirMessages.length > 0 ? theirMessages[theirMessages.length - 1].from.name : 'unknown',
            date: myMsg.date,
            urgency: daysSince > 7 ? 'high' : daysSince > 5 ? 'medium' : 'low',
            description: `No reply to "${myMsg.subject}" for ${Math.floor(daysSince)} days`,
            suggestedAction: `Send a follow-up to ${theirMessages.length > 0 ? theirMessages[theirMessages.length - 1].from.name : 'recipient'}`,
            daysSince: Math.floor(daysSince),
          });
        }

        // Check for approaching deadlines
        for (const deadline of deadlines) {
          followUps.push({
            type: 'approaching-deadline',
            threadId,
            subject: myMsg.subject,
            from: myMsg.from.name,
            date: myMsg.date,
            urgency: 'high',
            description: `Deadline mentioned: "${deadline.deadline}" in "${myMsg.subject}"`,
            suggestedAction: `Check status on deadline: ${deadline.deadline}`,
            daysSince: Math.floor(daysSince),
          });
        }
      }
    }

    // Check for stale threads (no activity for > 7 days but still open)
    if (sorted.length > 0) {
      const lastActivity = new Date(sorted[sorted.length - 1].date).getTime();
      const daysSinceLastActivity = (now - lastActivity) / (1000 * 60 * 60 * 24);

      if (daysSinceLastActivity > 7 && daysSinceLastActivity < 30) {
        const hasOpenQuestions = sorted.some(m =>
          m.from.email !== currentUserEmail && detectQuestions(m.body).length > 0
        );

        if (hasOpenQuestions) {
          followUps.push({
            type: 'stale-thread',
            threadId,
            subject: sorted[0].subject,
            from: sorted.filter(m => m.from.email !== currentUserEmail).map(m => m.from.name).join(', '),
            date: sorted[sorted.length - 1].date,
            urgency: daysSinceLastActivity > 14 ? 'medium' : 'low',
            description: `"${sorted[0].subject}" has been inactive for ${Math.floor(daysSinceLastActivity)} days with open questions`,
            suggestedAction: 'Send a follow-up or close the thread',
            daysSince: Math.floor(daysSinceLastActivity),
          });
        }
      }
    }
  }

  // Sort by urgency then days since
  const urgencyOrder = {high: 0, medium: 1, low: 2};
  return followUps.sort((a, b) => {
    const urgencyDiff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
    if (urgencyDiff !== 0) return urgencyDiff;
    return b.daysSince - a.daysSince;
  });
}

// ── React Hook ──

export function useFollowUpDetector(messages: MailMessage[]) {
  const followUps = useMemo(() => detectFollowUps(messages), [messages]);

  const stats = useMemo(() => ({
    total: followUps.length,
    urgent: followUps.filter(f => f.urgency === 'high').length,
    noReply: followUps.filter(f => f.type === 'no-reply').length,
    unanswered: followUps.filter(f => f.type === 'unanswered-question').length,
    deadlines: followUps.filter(f => f.type === 'approaching-deadline').length,
    stale: followUps.filter(f => f.type === 'stale-thread').length,
  }), [followUps]);

  return {followUps, stats};
}

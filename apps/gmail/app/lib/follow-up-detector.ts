'use client';

import {useState, useCallback, useMemo} from 'react';

/**
 * AI Follow-up Commitment Detector
 *
 * Scans emails to detect:
 * - Promises you made ("I'll send you...", "I'll follow up by...")
 * - Requests from others ("Please review by...", "Can you...")
 * - Deadlines and due dates
 * - Open questions that need answers
 * - Meeting invites that need responses
 *
 * Produces a prioritized follow-up list with:
 * - What was committed
 * - To whom
 * - By when
 * - Priority level
 * - Original email context
 */

// ── Types ──

export interface CommitmentItem {
  id: string;
  type: 'commitment' | 'request' | 'deadline' | 'open-question' | 'meeting-rsvp' | 'pending-review';
  text: string;              // The original text
  summary: string;           // Clean summary
  from: string;              // Who said it
  emailId: string;
  emailSubject: string;
  threadId: string;
  date: string;
  dueDate: string | null;    // Extracted due date
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'pending' | 'in-progress' | 'done' | 'overdue';
  assignedTo: string;        // Who needs to act (me or them)
}

export interface CommitmentStats {
  total: number;
  pending: number;
  overdue: number;
  urgent: number;
  byType: Record<CommitmentItem['type'], number>;
}

// ── Detection Patterns ──

const COMMITMENT_PATTERNS: Array<{pattern: RegExp; type: CommitmentItem['type']}> = [
  // My commitments (sent by me)
  {pattern: /\bI'll\s+(?:send|share|forward|provide|update|follow.?up|get back|check|review|look into|prepare|draft|create|schedule)\b/gi, type: 'commitment'},
  {pattern: /\bI will\s+(?:send|share|forward|provide|update|follow.?up|get back|check|review|look into|prepare|draft|create|schedule)\b/gi, type: 'commitment'},
  {pattern: /\bLet me\s+(?:send|share|forward|provide|update|follow.?up|get back|check|review|look into|prepare|draft|create|schedule)\b/gi, type: 'commitment'},
  {pattern: /\bI can\s+(?:send|share|provide|prepare|draft|create|have)\b/gi, type: 'commitment'},
  {pattern: /\bI(?:'ll| will) have (?:it|this|that) (?:ready|done|completed|finished)\b/gi, type: 'commitment'},
  // Requests from others
  {pattern: /\b(?:can|could|would) you\s+(?:please\s+)?(?:send|share|provide|review|check|look into|prepare|update|let me know)\b/gi, type: 'request'},
  {pattern: /\bplease\s+(?:send|share|provide|review|check|look into|prepare|update|confirm)\b/gi, type: 'request'},
  {pattern: /\b(?:need|needs) (?:you|your|someone) to\b/gi, type: 'request'},
  {pattern: /\b(?:action required|response needed|please respond)\b/gi, type: 'request'},
  // Open questions
  {pattern: /\b(?:what|when|where|who|why|how|which)\b.*\?/gi, type: 'open-question'},
  // Meeting RSVP
  {pattern: /\b(?:meeting|call|sync|standup|1.?on.?1|catch.?up)\s+(?:at|on|tomorrow|this|next)\b/gi, type: 'meeting-rsvp'},
  {pattern: /\b(?:invited|invitation|calendar invite|please join)\b/gi, type: 'meeting-rsvp'},
  // Pending review
  {pattern: /\b(?:PR|pull request|code review|please review|review (?:requested|needed))\b/gi, type: 'pending-review'},
  {pattern: /\b(?:document|doc|proposal|draft) (?:for|ready for) (?:your )?review\b/gi, type: 'pending-review'},
];

const DEADLINE_PATTERNS: RegExp[] = [
  /\bby\s+(?:end of )?(?:today|tomorrow|EOD|COB|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/gi,
  /\bby\s+(?:the )?(?:end of (?:this|next) (?:week|month|quarter))\b/gi,
  /\b(?:due|deadline)\s*(?::|is|by)?\s*\b/gi,
  /\b(?:this|next) (?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/gi,
  /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}\b/gi,
  /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g,
];

const URGENCY_PATTERNS: RegExp[] = [
  /\b(?:urgent|asap|immediately|critical|emergency|time.?sensitive)\b/gi,
  /\b(?:block|blocked|blocking)\b/gi,
  /\b(?:action required|response needed)\b/gi,
];

// ── Detection Engine ──

function generateId(text: string, emailId: string): string {
  // Simple hash for stable IDs
  let hash = 0;
  const str = `${emailId}:${text.slice(0, 50)}`;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return `fu-${Math.abs(hash).toString(36)}`;
}

function extractDeadline(text: string): string | null {
  for (const pattern of DEADLINE_PATTERNS) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    if (match) return match[0];
  }
  return null;
}

function detectUrgency(text: string): boolean {
  return URGENCY_PATTERNS.some(p => {
    p.lastIndex = 0;
    return p.test(text);
  });
}

function summarizeCommitment(text: string, type: CommitmentItem['type']): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  if (clean.length <= 80) return clean;

  // Extract the key verb phrase
  const verbMatch = clean.match(/(?:I'll|I will|Let me|can you|please|could you|would you)\s+(.{20,60}?)(?:\.|!|$)/i);
  if (verbMatch) return verbMatch[1].trim();

  return clean.slice(0, 77) + '...';
}

function determineAssignedTo(from: string): 'me' | 'them' {
  // If the email is from me, the commitment is mine
  if (from === 'me@anvil.local' || from === 'Me') return 'me';
  // If someone else sent it with a request, they need me to act
  return 'them';
}

function classifyPriority(text: string, hasDeadline: boolean, isUrgent: boolean): CommitmentItem['priority'] {
  if (isUrgent) return 'urgent';
  if (hasDeadline) return 'high';
  // Check for medium indicators
  if (/\b(?:important|priority|please|need)\b/i.test(text)) return 'medium';
  return 'low';
}

// ── Public API ──

export interface ScannableEmail {
  id: string;
  from: {name: string; email: string};
  subject: string;
  body: string;
  date: string;
  threadId: string;
}

export function scanForFollowUps(emails: ScannableEmail[]): CommitmentItem[] {
  const items: CommitmentItem[] = [];

  for (const email of emails) {
    const text = `${email.subject} ${email.body}`;
    const fullText = text.toLowerCase();

    for (const {pattern, type} of COMMITMENT_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(text)) !== null) {
        // Get surrounding context (±100 chars)
        const start = Math.max(0, match.index - 50);
        const end = Math.min(text.length, match.index + match[0].length + 80);
        const context = text.slice(start, end).trim();

        const id = generateId(context, email.id);

        // Deduplicate within same email
        if (items.some(i => i.id === id)) continue;

        const dueDate = extractDeadline(context);
        const isUrgent = detectUrgency(fullText);

        items.push({
          id,
          type,
          text: context,
          summary: summarizeCommitment(context, type),
          from: email.from.name || email.from.email,
          emailId: email.id,
          emailSubject: email.subject,
          threadId: email.threadId,
          date: email.date,
          dueDate,
          priority: classifyPriority(context, !!dueDate, isUrgent),
          status: 'pending',
          assignedTo: determineAssignedTo(email.from.email),
        });
      }
    }
  }

  // Sort by priority then date
  const priorityOrder: Record<string, number> = {urgent: 0, high: 1, medium: 2, low: 3};
  return items.sort((a, b) => {
    const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (pDiff !== 0) return pDiff;
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });
}

export function getCommitmentStats(items: CommitmentItem[]): CommitmentStats {
  const now = Date.now();
  const stats: CommitmentStats = {
    total: items.length,
    pending: 0,
    overdue: 0,
    urgent: 0,
    byType: {commitment: 0, request: 0, deadline: 0, 'open-question': 0, 'meeting-rsvp': 0, 'pending-review': 0},
  };

  for (const item of items) {
    if (item.status === 'pending') stats.pending++;
    if (item.priority === 'urgent') stats.urgent++;
    if (item.dueDate) {
      // Simple overdue check: if due date text contains past indicators
      const dueText = item.dueDate.toLowerCase();
      if (dueText.includes('today') || dueText.includes('yesterday') || dueText.includes('eod')) {
        // Rough heuristic: if the email is from more than a day ago, it's overdue
        const emailAge = now - new Date(item.date).getTime();
        if (emailAge > 24 * 60 * 60 * 1000) {
          stats.overdue++;
        }
      }
    }
    stats.byType[item.type]++;
  }

  return stats;
}

/**
 * AI-enhanced follow-up scanning.
 * Uses the LLM to detect subtler commitments and extract better summaries.
 */
export async function scanForFollowUpsAI(emails: ScannableEmail[]): Promise<CommitmentItem[]> {
  // First, get local results (fast)
  const localItems = scanForFollowUps(emails);

  // Then enhance with AI for emails with no local matches but that might contain commitments
  const emailsWithoutMatches = emails.filter(e =>
    !localItems.some(i => i.emailId === e.id)
  ).slice(0, 5); // Limit to 5 for performance

  if (emailsWithoutMatches.length === 0) return localItems;

  try {
    const resp = await fetch('/api/ai', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        action: 'extract-deadlines',
        payload: {
          emails: emailsWithoutMatches.map(e => ({
            from: e.from.email,
            subject: e.subject,
            body: e.body.slice(0, 500),
          })),
        },
      }),
    });

    if (resp.ok) {
      const data = await resp.json();
      if (data.actionItems && Array.isArray(data.actionItems)) {
        const aiItems: CommitmentItem[] = data.actionItems.map((item: {text: string; dueDate?: string}, idx: number) => ({
          id: `ai-${Date.now()}-${idx}`,
          type: 'commitment' as const,
          text: item.text,
          summary: item.text.slice(0, 80),
          from: emailsWithoutMatches[idx]?.from.name || 'Unknown',
          emailId: emailsWithoutMatches[idx]?.id || '',
          emailSubject: emailsWithoutMatches[idx]?.subject || '',
          threadId: emailsWithoutMatches[idx]?.threadId || '',
          date: emailsWithoutMatches[idx]?.date || new Date().toISOString(),
          dueDate: item.dueDate || null,
          priority: 'medium' as const,
          status: 'pending' as const,
          assignedTo: 'me' as const,
        }));

        return [...localItems, ...aiItems].sort((a, b) => {
          const pOrder: Record<string, number> = {urgent: 0, high: 1, medium: 2, low: 3};
          return pOrder[a.priority] - pOrder[b.priority];
        });
      }
    }
  } catch {
    // AI enhancement failed — return local results only
  }

  return localItems;
}

// ── Legacy Compatibility (for existing follow-up-panel.tsx) ──

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

export function detectFollowUps(
  messages: Array<{id: string; from: {name: string; email: string}; subject: string; body: string; date: string; threadId: string; read: boolean}>,
  currentUserEmail: string = 'me@anvil.local'
): FollowUpItem[] {
  const items: FollowUpItem[] = [];
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  // Group by thread
  const threads = new Map<string, typeof messages>();
  for (const msg of messages) {
    const existing = threads.get(msg.threadId) || [];
    existing.push(msg);
    threads.set(msg.threadId, existing);
  }

  for (const [threadId, threadMsgs] of threads) {
    const sorted = [...threadMsgs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const lastMsg = sorted[sorted.length - 1];
    const daysSince = Math.floor((now - new Date(lastMsg.date).getTime()) / dayMs);

    // No-reply: I sent last message, no response for 2+ days
    if (lastMsg.from.email === currentUserEmail && daysSince >= 2) {
      const prevMsg = sorted.length > 1 ? sorted[sorted.length - 2] : null;
      items.push({
        type: 'no-reply',
        threadId,
        subject: lastMsg.subject,
        from: prevMsg?.from.name || lastMsg.from.name,
        date: lastMsg.date,
        urgency: daysSince >= 7 ? 'high' : daysSince >= 4 ? 'medium' : 'low',
        description: `No reply for ${daysSince} days`,
        suggestedAction: 'Send follow-up',
        daysSince,
      });
    }

    // Unanswered questions in received emails
    for (const msg of sorted) {
      if (msg.from.email === currentUserEmail) continue;
      const questions = [];
      const sentences = msg.body.split(/[.!?]+/);
      for (const s of sentences) {
        if (s.includes('?') && s.trim().length > 5 && s.trim().length < 200) {
          questions.push(s.trim());
        }
      }
      if (questions.length > 0 && daysSince >= 1) {
        items.push({
          type: 'unanswered-question',
          threadId,
          subject: msg.subject,
          from: msg.from.name,
          date: msg.date,
          urgency: daysSince >= 5 ? 'high' : 'medium',
          description: `${questions.length} unanswered question(s): "${questions[0].slice(0, 60)}..."`,
          suggestedAction: 'Reply with answers',
          daysSince,
        });
      }
    }

    // Approaching deadlines
    const fullText = sorted.map(m => m.body).join(' ');
    const deadlinePatterns = [
      /by (monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
      /by (tomorrow|next week|eod|eow|cob)/i,
      /due (?:by|on|date:)?\s*\w+/i,
      /deadline:?\s*\w+/i,
    ];
    for (const pat of deadlinePatterns) {
      const match = fullText.match(pat);
      if (match) {
        items.push({
          type: 'approaching-deadline',
          threadId,
          subject: lastMsg.subject,
          from: lastMsg.from.name,
          date: lastMsg.date,
          urgency: daysSince >= 3 ? 'high' : 'medium',
          description: `Deadline: "${match[0]}"`,
          suggestedAction: 'Check deadline status',
          daysSince,
        });
        break;
      }
    }

    // Stale threads (no activity for 7+ days)
    if (daysSince >= 7 && sorted.length >= 2) {
      items.push({
        type: 'stale-thread',
        threadId,
        subject: lastMsg.subject,
        from: lastMsg.from.name,
        date: lastMsg.date,
        urgency: daysSince >= 14 ? 'high' : 'low',
        description: `Thread inactive for ${daysSince} days`,
        suggestedAction: 'Follow up or archive',
        daysSince,
      });
    }
  }

  return items.sort((a, b) => {
    const urgOrder = {high: 0, medium: 1, low: 2};
    return urgOrder[a.urgency] - urgOrder[b.urgency] || b.daysSince - a.daysSince;
  });
}

export function useFollowUpDetector(messages: Array<{id: string; from: {name: string; email: string}; subject: string; body: string; date: string; threadId: string; read: boolean}>) {
  const followUps = useMemo(() => detectFollowUps(messages), [messages]);

  const stats = useMemo(() => ({
    total: followUps.length,
    urgent: followUps.filter(f => f.urgency === 'high').length,
    noReply: followUps.filter(f => f.type === 'no-reply').length,
    unanswered: followUps.filter(f => f.type === 'unanswered-question').length,
    deadlines: followUps.filter(f => f.type === 'approaching-deadline').length,
    stale: followUps.filter(f => f.type === 'stale-thread').length,
  }), [followUps]);

  const markDone = useCallback((threadId: string) => {
    // Could persist to localStorage for cross-session tracking
  }, []);

  return {followUps, stats, markDone};
}

// Re-export for backward compat — export the legacy FollowUpItem as the default

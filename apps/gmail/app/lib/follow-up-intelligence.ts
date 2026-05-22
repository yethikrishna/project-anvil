'use client';

/**
 * Follow-Up Intelligence System
 *
 * Detects emails that need follow-up and suggests:
 * - When to follow up (timing based on email type)
 * - What to say (context-aware draft)
 * - Priority of follow-up
 * - Auto-reminders based on deadlines mentioned
 *
 * Smarter than standard reminders because:
 * - Understands email context (meeting confirmed? needs reply? awaiting approval?)
 * - Adjusts timing based on sender relationship
 * - Tracks if follow-up was actually sent
 * - Learns optimal follow-up timing from past behavior
 */

// ── Types ──

interface FollowUpItem {
  emailId: string;
  threadId: string;
  subject: string;
  from: string;
  lastActivity: Date;
  reason: string;
  suggestedDate: Date;
  priority: 'high' | 'medium' | 'low';
  type: 'awaiting-reply' | 'deadline-approaching' | 'action-needed' | 'meeting-follow-up' | 'approval-pending';
  draftSuggestion: string;
  daysSinceLastActivity: number;
}

// ── Detection Engine ──

export function detectFollowUps(
  sentEmails: Array<{id: string; threadId: string; to: string; subject: string; body: string; date: string}>,
  receivedEmails: Array<{id: string; threadId: string; from: string; subject: string; body: string; date: string; read: boolean; starred: boolean}>,
): FollowUpItem[] {
  const followUps: FollowUpItem[] = [];
  const now = Date.now();

  // Track which threads have replies
  const threadReplies = new Map<string, Date>();
  for (const email of receivedEmails) {
    const existing = threadReplies.get(email.threadId);
    const emailDate = new Date(email.date);
    if (!existing || emailDate > existing) {
      threadReplies.set(email.threadId, emailDate);
    }
  }

  // 1. Sent emails without replies
  for (const sent of sentEmails) {
    const lastReply = threadReplies.get(sent.threadId);
    const sentDate = new Date(sent.date);
    const daysSince = (now - sentDate.getTime()) / (1000 * 60 * 60 * 24);

    // Check if there's been a reply AFTER our sent email
    const hasReply = lastReply && lastReply > sentDate;

    if (!hasReply && daysSince >= 2) {
      const subject = sent.subject.replace(/^Re:\s*/i, '');
      const bodyLower = sent.body.toLowerCase();

      let type: FollowUpItem['type'] = 'awaiting-reply';
      let priority: FollowUpItem['priority'] = 'medium';
      let reason = 'No reply received';
      let suggestedDays = 1; // Follow up in 1 day from now

      // Detect email type and adjust timing
      if (/proposal|quote|pricing|estimate/.test(bodyLower)) {
        type = 'approval-pending';
        priority = 'high';
        reason = 'Awaiting approval on proposal';
        suggestedDays = 2;
      } else if (/meeting|call|schedule|availability/.test(bodyLower)) {
        type = 'meeting-follow-up';
        priority = 'high';
        reason = 'Meeting confirmation pending';
        suggestedDays = 1;
      } else if (/please|could you|would you|can you/.test(bodyLower)) {
        type = 'action-needed';
        priority = 'medium';
        reason = 'Waiting for action/response';
        suggestedDays = 2;
      }

      // Escalate priority over time
      if (daysSince >= 7) {
        priority = 'high';
        reason += ' (over a week ago)';
        suggestedDays = 0; // Follow up today
      } else if (daysSince >= 4) {
        priority = 'medium';
      }

      // Don't suggest follow-ups for very old emails (>30 days)
      if (daysSince > 30) continue;

      const suggestedDate = new Date(now + suggestedDays * 24 * 60 * 60 * 1000);

      followUps.push({
        emailId: sent.id,
        threadId: sent.threadId,
        subject,
        from: sent.to,
        lastActivity: sentDate,
        reason,
        suggestedDate,
        priority,
        type,
        draftSuggestion: generateFollowUpDraft(sent, daysSince, type),
        daysSinceLastActivity: Math.round(daysSince),
      });
    }
  }

  // 2. Received emails with deadlines
  for (const email of receivedEmails) {
    const bodyLower = email.body.toLowerCase();
    const deadlinePatterns = [
      {pattern: /by (monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i, daysMap: {'monday': 1, 'tuesday': 2, 'wednesday': 3, 'thursday': 4, 'friday': 5, 'saturday': 6, 'sunday': 0}},
      {pattern: /due (today|tomorrow|this week|next week)/i, daysMap: {'today': 0, 'tomorrow': 1, 'this week': 3, 'next week': 7}},
    ];

    for (const {pattern, daysMap} of deadlinePatterns) {
      const match = bodyLower.match(pattern);
      if (match) {
        const daysUntil = daysMap[match[1].toLowerCase() as keyof typeof daysMap];
        if (daysUntil !== undefined && daysUntil <= 3) {
          followUps.push({
            emailId: email.id,
            threadId: email.threadId,
            subject: email.subject,
            from: email.from,
            lastActivity: new Date(email.date),
            reason: `Deadline ${match[1]} — needs action`,
            suggestedDate: new Date(now), // Today
            priority: daysUntil <= 1 ? 'high' : 'medium',
            type: 'deadline-approaching',
            draftSuggestion: `Following up on "${email.subject}" — confirming progress before the deadline.`,
            daysSinceLastActivity: Math.round((now - new Date(email.date).getTime()) / (1000 * 60 * 60 * 24)),
          });
        }
      }
    }
  }

  return followUps
    .sort((a, b) => {
      const pOrder = {high: 0, medium: 1, low: 2};
      return pOrder[a.priority] - pOrder[b.priority];
    });
}

// ── Follow-Up Draft Generator ──

function generateFollowUpDraft(
  originalEmail: {to: string; subject: string; body: string},
  daysSince: number,
  type: FollowUpItem['type'],
): string {
  const toName = originalEmail.to.split('@')[0] || 'there';
  const subject = originalEmail.subject.replace(/^Re:\s*/i, '');

  switch (type) {
    case 'approval-pending':
      if (daysSince >= 7) {
        return `Hi ${toName},\n\nI wanted to follow up on the proposal I sent last week regarding "${subject}". Please let me know if you have any questions or if there's anything I can clarify.\n\nWould you like to schedule a quick call to discuss?`;
      }
      return `Hi ${toName},\n\nJust checking in on "${subject}". Let me know if you need any additional information.`;

    case 'meeting-follow-up':
      return `Hi ${toName},\n\nDid you get a chance to check availability for our meeting about "${subject}"? Happy to work around your schedule.`;

    case 'action-needed':
      return `Hi ${toName},\n\nFollowing up on my previous email about "${subject}". Let me know if there's anything I can help move this forward.`;

    case 'deadline-approaching':
      return `Hi ${toName},\n\nQuick check-in on "${subject}" — just want to make sure we're on track. Let me know if anything is blocking progress.`;

    default:
      return `Hi ${toName},\n\nFollowing up on our conversation about "${subject}". Would love to hear your thoughts when you have a moment.`;
  }
}

// ── Timing Optimizer ──
// Learns optimal follow-up timing based on past responses

const TIMING_KEY = 'anvil-mail-follow-up-timing';

interface TimingStats {
  avgResponseHours: Record<string, number>; // sender → avg response time
  optimalDayOfWeek: number; // 0-6, Sunday=0
  optimalHour: number; // 0-23
}

export function getTimingStats(): TimingStats {
  if (typeof window === 'undefined') {
    return {avgResponseHours: {}, optimalDayOfWeek: 2, optimalHour: 10};
  }
  try {
    const stored = localStorage.getItem(TIMING_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return {avgResponseHours: {}, optimalDayOfWeek: 2, optimalHour: 10};
}

export function recordResponseTiming(sender: string, sentAt: number, repliedAt: number): void {
  if (typeof window === 'undefined') return;
  const stats = getTimingStats();
  const hoursToRespond = (repliedAt - sentAt) / (1000 * 60 * 60);

  // Update rolling average
  const existing = stats.avgResponseHours[sender];
  if (existing) {
    stats.avgResponseHours[sender] = existing * 0.7 + hoursToRespond * 0.3;
  } else {
    stats.avgResponseHours[sender] = hoursToRespond;
  }

  localStorage.setItem(TIMING_KEY, JSON.stringify(stats));
}

export function getOptimalFollowUpDate(sender: string): Date {
  const stats = getTimingStats();
  const avgHours = stats.avgResponseHours[sender];

  if (avgHours) {
    // Follow up at 1.5x the average response time
    const followUpMs = Date.now() + avgHours * 1.5 * 60 * 60 * 1000;
    return new Date(followUpMs);
  }

  // Default: 2 business days from now
  const date = new Date();
  date.setDate(date.getDate() + 2);
  // Skip weekends
  if (date.getDay() === 0) date.setDate(date.getDate() + 1);
  if (date.getDay() === 6) date.setDate(date.getDate() + 2);
  date.setHours(10, 0, 0, 0); // 10 AM
  return date;
}

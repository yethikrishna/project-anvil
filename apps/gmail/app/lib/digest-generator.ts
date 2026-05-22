'use client';

/**
 * AI Mail Digest Generator
 *
 * Generates a comprehensive daily digest of unread emails.
 * Sections:
 * 1. Action Required — emails needing immediate response
 * 2. Key Updates — important informational emails
 * 3. FYI — things worth knowing but no action needed
 * 4. Deadlines — approaching deadlines extracted from emails
 * 5. Follow-ups — commitments detected in sent emails
 *
 * Can be exported as HTML for sharing or saved for reference.
 */

import {
  scanForFollowUps,
  type CommitmentItem,
  type ScannableEmail,
} from './follow-up-detector';
import {
  classifyEnhanced,
  type EnhancedCategoryResult,
} from './ai-categorizer-enhanced';

// ── Types ──

export interface DigestEmail {
  id: string;
  from: string;
  subject: string;
  bodyPreview: string;
  date: string;
  category: EnhancedCategoryResult;
  hasDeadline: boolean;
  deadlineText: string | null;
  followUpItem?: CommitmentItem;
  threadId: string;
}

export interface DigestSection {
  title: string;
  icon: string;
  color: string;
  emails: DigestEmail[];
  summary: string;
}

export interface DailyDigest {
  date: string;
  generatedAt: number;
  sections: DigestSection[];
  totalEmails: number;
  urgentCount: number;
  actionRequiredCount: number;
  followUpCount: number;
  executiveSummary: string;
}

// ── Deadline Detection ──

function detectDeadline(text: string): string | null {
  const patterns = [
    /\bby\s+(?:end of )?(?:today|tomorrow|EOD|COB)\b/i,
    /\bby\s+(?:this|next)?\s*(?:Monday|Tuesday|Wednesday|Thursday|Friday)\b/i,
    /\bdue\s*(?::|is|by)?\s*\w+\s*\d{0,2}/i,
    /\bdeadline\s*:?\s*\w+/i,
    /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\b/i,
  ];

  for (const p of patterns) {
    const match = text.match(p);
    if (match) return match[0];
  }
  return null;
}

// ── Digest Generator ──

export function generateDigest(
  emails: ScannableEmail[],
): DailyDigest {
  // Classify and enrich emails
  const digestEmails: DigestEmail[] = emails.map(email => {
    const category = classifyEnhanced({
      subject: email.subject,
      from: email.from.email,
      body: email.body,
    });

    const fullText = `${email.subject} ${email.body}`;
    const deadline = detectDeadline(fullText);

    return {
      id: email.id,
      from: email.from.name || email.from.email,
      subject: email.subject,
      bodyPreview: email.body.slice(0, 150).replace(/\n/g, ' '),
      date: email.date,
      category,
      hasDeadline: !!deadline,
      deadlineText: deadline,
      threadId: email.threadId,
    };
  });

  // Scan for follow-ups
  const followUps = scanForFollowUps(emails);
  const followUpMap = new Map(followUps.map(f => [f.emailId, f]));

  // Attach follow-up items
  for (const de of digestEmails) {
    const fu = followUpMap.get(de.id);
    if (fu) de.followUpItem = fu;
  }

  // Build sections
  const sections: DigestSection[] = [];

  // 1. Action Required
  const actionEmails = digestEmails.filter(e =>
    e.category.category === 'action-needed' ||
    e.category.priority === 'urgent' ||
    e.followUpItem
  );
  sections.push({
    title: 'Action Required',
    icon: '🔴',
    color: '#ef4444',
    emails: actionEmails,
    summary: actionEmails.length > 0
      ? `${actionEmails.length} email${actionEmails.length > 1 ? 's' : ''} need your attention`
      : 'No action items — you\'re all caught up!',
  });

  // 2. Deadlines
  const deadlineEmails = digestEmails.filter(e => e.hasDeadline);
  if (deadlineEmails.length > 0) {
    sections.push({
      title: 'Approaching Deadlines',
      icon: '⏰',
      color: '#f59e0b',
      emails: deadlineEmails,
      summary: `${deadlineEmails.length} deadline${deadlineEmails.length > 1 ? 's' : ''} detected`,
    });
  }

  // 3. Key Updates
  const updateEmails = digestEmails.filter(e =>
    e.category.category === 'primary' && !actionEmails.includes(e)
  );
  if (updateEmails.length > 0) {
    sections.push({
      title: 'Key Updates',
      icon: '📬',
      color: '#3b82f6',
      emails: updateEmails,
      summary: `${updateEmails.length} important update${updateEmails.length > 1 ? 's' : ''}`,
    });
  }

  // 4. FYI
  const fyiEmails = digestEmails.filter(e =>
    e.category.category === 'updates' || e.category.category === 'fyi'
  );
  if (fyiEmails.length > 0) {
    sections.push({
      title: 'FYI',
      icon: '📄',
      color: '#6b7280',
      emails: fyiEmails,
      summary: `${fyiEmails.length} informational email${fyiEmails.length > 1 ? 's' : ''}`,
    });
  }

  // 5. Follow-up Commitments
  const commitmentEmails = digestEmails.filter(e => e.followUpItem);
  if (commitmentEmails.length > 0) {
    sections.push({
      title: 'Your Commitments',
      icon: '✅',
      color: '#10b981',
      emails: commitmentEmails,
      summary: `${commitmentEmails.length} commitment${commitmentEmails.length > 1 ? 's' : ''} detected`,
    });
  }

  // Build executive summary
  const urgentCount = digestEmails.filter(e => e.category.priority === 'urgent').length;
  const actionCount = actionEmails.length;
  const fuCount = commitmentEmails.length;

  const summaryParts: string[] = [];
  if (actionCount > 0) summaryParts.push(`${actionCount} need action`);
  if (urgentCount > 0) summaryParts.push(`${urgentCount} urgent`);
  if (fuCount > 0) summaryParts.push(`${fuCount} commitments`);
  if (deadlineEmails.length > 0) summaryParts.push(`${deadlineEmails.length} deadlines`);

  const executiveSummary = summaryParts.length > 0
    ? `You have ${digestEmails.length} unread emails: ${summaryParts.join(', ')}.`
    : `You have ${digestEmails.length} unread emails. Nothing urgent — all clear!`;

  return {
    date: new Date().toISOString().split('T')[0],
    generatedAt: Date.now(),
    sections,
    totalEmails: digestEmails.length,
    urgentCount,
    actionRequiredCount: actionCount,
    followUpCount: fuCount,
    executiveSummary,
  };
}

// ── HTML Export ──

export function digestToHTML(digest: DailyDigest): string {
  const parts: string[] = [];

  parts.push('<!DOCTYPE html>');
  parts.push('<html><head><meta charset="utf-8">');
  parts.push('<style>body{font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333}');
  parts.push('.header{border-bottom:2px solid #6366f1;padding-bottom:12px;margin-bottom:20px}');
  parts.push('.section{margin-bottom:24px}');
  parts.push('.section-title{font-size:16px;font-weight:600;margin-bottom:8px;display:flex;align-items:center;gap:8px}');
  parts.push('.email{padding:8px 12px;border-left:3px solid #e5e7eb;margin-bottom:8px;background:#fafafa;border-radius:0 6px 6px 0}');
  parts.push('.email-subject{font-weight:500;font-size:14px;margin-bottom:2px}');
  parts.push('.email-from{font-size:12px;color:#6b7280}');
  parts.push('.email-preview{font-size:13px;color:#374151;margin-top:4px}');
  parts.push('.deadline{color:#f59e0b;font-weight:500;font-size:12px}');
  parts.push('.summary{font-size:13px;color:#6b7280;font-style:italic;margin-bottom:8px}');
  parts.push('</style></head><body>');

  parts.push('<div class="header">');
  parts.push(`<h1 style="margin:0;font-size:20px">📬 Daily Digest — ${digest.date}</h1>`);
  parts.push(`<p style="margin:4px 0 0;color:#6b7280;font-size:14px">${digest.executiveSummary}</p>`);
  parts.push('</div>');

  for (const section of digest.sections) {
    parts.push('<div class="section">');
    parts.push(`<div class="section-title"><span>${section.icon}</span> ${section.title} <span style="color:${section.color};font-size:12px">(${section.emails.length})</span></div>`);
    parts.push(`<p class="summary">${section.summary}</p>`);

    for (const email of section.emails) {
      parts.push('<div class="email" style="border-left-color:' + section.color + '">');
      parts.push(`<div class="email-subject">${email.subject}</div>`);
      parts.push(`<div class="email-from">From: ${email.from} · ${new Date(email.date).toLocaleDateString()}</div>`);
      parts.push(`<div class="email-preview">${email.bodyPreview}...</div>`);
      if (email.deadlineText) {
        parts.push(`<div class="deadline">⏰ ${email.deadlineText}</div>`);
      }
      if (email.followUpItem) {
        parts.push(`<div style="font-size:12px;color:#10b981;margin-top:4px">✅ ${email.followUpItem.summary}</div>`);
      }
      parts.push('</div>');
    }

    parts.push('</div>');
  }

  parts.push('</body></html>');
  return parts.join('\n');
}

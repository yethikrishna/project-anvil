'use client';

/**
 * Priority Inbox — ML-style Email Scoring
 *
 * Unlike simple categorization, this scores each email on:
 * - Importance (is it from someone important?)
 * - Urgency (does it need a response now?)
 * - Relevance (is it related to active projects?)
 * - Engagement (have you interacted with this sender before?)
 *
 * Combined into a single priority score for inbox ordering.
 * Learns from user behavior over time.
 */

// MailMessage interface (mirrors page.tsx definition)
interface MailMessage {
  id: string;
  from: { name: string; email: string };
  to: { name: string; email: string }[];
  cc?: { name: string; email: string }[];
  subject: string;
  body: string;
  date: string;
  read: boolean;
  starred: boolean;
  labels: string[];
  threadId: string;
  attachments?: { name: string; size: string; type: string }[];
}

// ── Types ──

export interface PriorityScore {
  overall: number;       // 0-100
  importance: number;    // 0-100
  urgency: number;       // 0-100
  relevance: number;     // 0-100
  engagement: number;    // 0-100
  tier: 'critical' | 'high' | 'normal' | 'low' | 'bulk';
  reasons: string[];
}

export interface PriorityConfig {
  importantSenders: Set<string>;
  importantDomains: Set<string>;
  projectKeywords: string[];
  ignoreDomains: Set<string>;
  engagementHistory: Map<string, number>; // sender → interaction count
}

// ── Default Config ──

function getDefaultConfig(): PriorityConfig {
  return {
    importantSenders: new Set(),
    importantDomains: new Set(['company.com']),
    projectKeywords: ['sprint', 'review', 'deadline', 'urgent', 'approval', 'meeting', 'project'],
    ignoreDomains: new Set(['noreply.github.com', 'deploy.vercel.com', 'newsletter', 'noreply']),
    engagementHistory: new Map(),
  };
}

// ── Load/Save Config ──

const CONFIG_KEY = 'anvil-mail-priority-config';

export function loadPriorityConfig(): PriorityConfig {
  if (typeof window === 'undefined') return getDefaultConfig();
  try {
    const stored = localStorage.getItem(CONFIG_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        importantSenders: new Set(parsed.importantSenders || []),
        importantDomains: new Set(parsed.importantDomains || []),
        projectKeywords: parsed.projectKeywords || [],
        ignoreDomains: new Set(parsed.ignoreDomains || []),
        engagementHistory: new Map(Object.entries(parsed.engagementHistory || {})),
      };
    }
  } catch {}
  return getDefaultConfig();
}

export function savePriorityConfig(config: PriorityConfig): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify({
      importantSenders: [...config.importantSenders],
      importantDomains: [...config.importantDomains],
      projectKeywords: config.projectKeywords,
      ignoreDomains: [...config.ignoreDomains],
      engagementHistory: Object.fromEntries(config.engagementHistory),
    }));
  } catch {}
}

// ── Scoring Engine ──

export function scoreEmailPriority(
  email: MailMessage,
  threadMessages: MailMessage[],
  config: PriorityConfig,
): PriorityScore {
  const reasons: string[] = [];
  let importance = 50;
  let urgency = 30;
  let relevance = 40;
  let engagement = 30;

  const from = email.from.email.toLowerCase();
  const fromDomain = from.split('@')[1] || '';
  const subject = email.subject.toLowerCase();
  const body = email.body.toLowerCase();
  const fullText = `${subject} ${body}`;

  // ── Importance Scoring ──

  // Known important sender
  if (config.importantSenders.has(from)) {
    importance += 30;
    reasons.push('Important sender');
  }

  // Important domain
  if (config.importantDomains.has(fromDomain)) {
    importance += 15;
    reasons.push('Work domain');
  }

  // Personal email (not noreply, no-reply, etc.)
  const isAutomated = /noreply|no-reply|notification|automated|mailer|daemon|newsletter/.test(from);
  if (!isAutomated) {
    importance += 10;
  } else {
    importance -= 20;
  }

  // Sent directly to user (not cc'd or bcc'd)
  if (email.to.some(t => t.email === 'me@anvil.local') && !email.cc?.length) {
    importance += 10;
    reasons.push('Direct to you');
  }

  // Starred
  if (email.starred) {
    importance += 20;
    reasons.push('Starred');
  }

  // Has attachment (often important)
  if (email.attachments?.length) {
    importance += 5;
    reasons.push('Has attachment');
  }

  // ── Urgency Scoring ──

  // Time-sensitive keywords
  const urgencyPatterns = [
    {pattern: /urgent|asap|emergency|critical/i, score: 30, reason: 'Urgent keywords'},
    {pattern: /deadline|due (today|tomorrow|this week)/i, score: 25, reason: 'Deadline mentioned'},
    {pattern: /remind|reminder|don'?t forget/i, score: 15, reason: 'Reminder'},
    {pattern: /action required|needs? (your|attention)|please (review|approve|respond)/i, score: 20, reason: 'Action required'},
    {pattern: /meeting (today|tomorrow|in \d+ min)/i, score: 20, reason: 'Upcoming meeting'},
    {pattern: /expires?|closing (today|soon)|last (day|chance)/i, score: 20, reason: 'Time-sensitive'},
  ];

  for (const {pattern, score, reason} of urgencyPatterns) {
    if (pattern.test(fullText)) {
      urgency += score;
      reasons.push(reason);
    }
  }

  // Unread + recent = more urgent
  if (!email.read) {
    const hoursSince = (Date.now() - new Date(email.date).getTime()) / (1000 * 60 * 60);
    if (hoursSince < 1) {
      urgency += 15;
      reasons.push('Very recent');
    } else if (hoursSince < 4) {
      urgency += 10;
    }
  }

  // Thread with multiple replies = hot conversation
  if (threadMessages.length >= 3) {
    urgency += 10;
    reasons.push('Active thread');
  }

  // ── Relevance Scoring ──

  // Project keyword match
  for (const keyword of config.projectKeywords) {
    if (fullText.includes(keyword.toLowerCase())) {
      relevance += 8;
      if (!reasons.some(r => r.includes('Project'))) {
        reasons.push(`Project keyword: "${keyword}"`);
      }
    }
  }

  // Work-related topics
  const workPatterns = [
    {pattern: /sprint|roadmap|backlog|deploy|release|pr |pull request/i, score: 10},
    {pattern: /budget|invoice|contract|proposal|agreement/i, score: 10},
    {pattern: /schedule|calendar|agenda|standup|retro/i, score: 8},
  ];

  for (const {pattern, score} of workPatterns) {
    if (pattern.test(fullText)) {
      relevance += score;
    }
  }

  // ── Engagement Scoring ──

  const senderEngagement = config.engagementHistory.get(from) || 0;
  if (senderEngagement >= 5) {
    engagement += 30;
    reasons.push('Frequent contact');
  } else if (senderEngagement >= 2) {
    engagement += 15;
    reasons.push('Regular contact');
  }

  // User has replied in this thread
  const userReplied = threadMessages.some(m =>
    m.from.email === 'me@anvil.local' && m.id !== email.id
  );
  if (userReplied) {
    engagement += 20;
    reasons.push('You replied in this thread');
  }

  // ── Penalty Signals ──

  // Ignore domains
  if (config.ignoreDomains.has(fromDomain) || config.ignoreDomains.has(from)) {
    importance -= 25;
    urgency -= 20;
  }

  // Spam signals
  const spamSignals = /unsubscribe|click here|congratulations|you.{0,10}won|free money|act now/i;
  if (spamSignals.test(body)) {
    importance -= 30;
    urgency -= 30;
    relevance -= 30;
  }

  // ALL CAPS subject
  const capsRatio = (subject.match(/[A-Z]/g) || []).length / Math.max(subject.length, 1);
  if (capsRatio > 0.6 && subject.length > 10) {
    importance -= 10;
    urgency -= 5;
  }

  // ── Clamp & Combine ──

  importance = Math.max(0, Math.min(100, importance));
  urgency = Math.max(0, Math.min(100, urgency));
  relevance = Math.max(0, Math.min(100, relevance));
  engagement = Math.max(0, Math.min(100, engagement));

  // Weighted combination
  const overall = Math.round(
    importance * 0.35 +
    urgency * 0.30 +
    relevance * 0.20 +
    engagement * 0.15
  );

  // Tier assignment
  let tier: PriorityScore['tier'];
  if (overall >= 80) tier = 'critical';
  else if (overall >= 60) tier = 'high';
  else if (overall >= 35) tier = 'normal';
  else if (overall >= 15) tier = 'low';
  else tier = 'bulk';

  return {
    overall,
    importance,
    urgency,
    relevance,
    engagement,
    tier,
    reasons: [...new Set(reasons)].slice(0, 5),
  };
}

// ── Batch Scoring ──

export function scoreInbox(
  threads: Record<string, MailMessage[]>,
  config?: PriorityConfig,
): Array<{threadId: string; latestEmail: MailMessage; priority: PriorityScore}> {
  const cfg = config || loadPriorityConfig();

  return Object.entries(threads)
    .map(([threadId, messages]) => {
      const latest = messages[messages.length - 1];
      const priority = scoreEmailPriority(latest, messages, cfg);
      return {threadId, latestEmail: latest, priority};
    })
    .sort((a, b) => b.priority.overall - a.priority.overall);
}

// ── Learning: Record User Interaction ──

export function recordInteraction(
  email: MailMessage,
  action: 'read' | 'reply' | 'star' | 'archive' | 'delete',
  config?: PriorityConfig,
): PriorityConfig {
  const cfg = config || loadPriorityConfig();
  const from = email.from.email.toLowerCase();

  switch (action) {
    case 'reply':
      cfg.engagementHistory.set(from, (cfg.engagementHistory.get(from) || 0) + 2);
      break;
    case 'star':
      cfg.importantSenders.add(from);
      break;
    case 'read':
      cfg.engagementHistory.set(from, (cfg.engagementHistory.get(from) || 0) + 1);
      break;
    case 'archive':
      // Mild signal — not super important
      break;
    case 'delete':
      // Negative signal
      cfg.engagementHistory.set(from, Math.max(0, (cfg.engagementHistory.get(from) || 0) - 1));
      break;
  }

  savePriorityConfig(cfg);
  return cfg;
}

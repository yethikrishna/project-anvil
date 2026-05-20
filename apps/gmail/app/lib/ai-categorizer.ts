'use client';

/**
 * AI-powered email categorization
 *
 * Classifies emails into categories based on content analysis:
 * - Work/Professional, Personal, Newsletter, Transaction, Social, Spam
 * - Auto-labels based on category
 * - Confidence scoring
 */

// ── Types ──

export type EmailCategory =
  | 'work'
  | 'personal'
  | 'newsletter'
  | 'transaction'
  | 'social'
  | 'notification'
  | 'spam';

export interface CategoryResult {
  category: EmailCategory;
  confidence: number;  // 0-1
  subcategories?: string[];
  reasoning?: string;
}

export interface CategorizedEmail {
  id: string;
  subject: string;
  from: string;
  body: string;
  category: CategoryResult;
}

// ── Keyword-based classifier (no external AI needed, runs client-side) ──

const CATEGORY_RULES: Record<EmailCategory, {
  keywords: string[];
  fromPatterns: RegExp[];
  subjectPatterns: RegExp[];
  bodyPatterns: RegExp[];
  weight: number;
}> = {
  work: {
    keywords: ['meeting', 'sprint', 'deadline', 'project', 'review', 'standup', 'deploy', 'PR', 'pull request', 'issue', 'ticket', 'agenda', 'quarterly', 'okr', 'kpi', 'on-call', 'incident', 'post-mortem'],
    fromPatterns: [/@company\./i, /@corp\./i, /noreply@.*slack/i, /notifications@.*github/i, /noreply@.*jira/i, /@.*\.corp$/i],
    subjectPatterns: [/sprint/i, /review/i, /deploy/i, /release/i, /incident/i, /\[?PROD\]?/i, /\[?QA\]?/i, /standup/i],
    bodyPatterns: [/action items?/i, /next steps?/i, /follow.?up/i],
    weight: 1.0,
  },
  personal: {
    keywords: ['birthday', 'dinner', 'weekend', 'vacation', 'family', 'friend', 'love', 'hey', 'coffee', 'lunch', 'dinner'],
    fromPatterns: [/gmail\.com$/i, /yahoo\.com$/i, /hotmail\.com$/i, /icloud\.com$/i, /protonmail\.com$/i],
    subjectPatterns: [/re:?\s/i, /fwd?:?\s/i],
    bodyPatterns: [/how are you/i, /hope you/i, /let'?s catch up/i],
    weight: 0.8,
  },
  newsletter: {
    keywords: ['unsubscribe', 'weekly', 'digest', 'newsletter', 'update', 'issue #', 'vol.', 'edition'],
    fromPatterns: [/newsletter@/i, /digest@/i, /noreply@.*mailchimp/i, /noreply@.*sendgrid/i, /noreply@.*substack/i, /updates@/i],
    subjectPatterns: [/weekly/i, /newsletter/i, /digest/i, /\#\d+$/i, /issue/i],
    bodyPatterns: [/unsubscribe/i, /view in browser/i, /email preferences/i],
    weight: 1.2,
  },
  transaction: {
    keywords: ['receipt', 'order', 'invoice', 'payment', 'shipping', 'delivered', 'tracking', 'confirmation', 'purchase', 'refund', 'subscription', 'billing'],
    fromPatterns: [/receipt@/i, /order@/i, /billing@/i, /no.?reply@.*amazon/i, /no.?reply@.*stripe/i, /no.?reply@.*shopify/i, /@paypal/i],
    subjectPatterns: [/order confirmation/i, /receipt/i, /invoice/i, /your order/i, /shipping/i, /delivered/i, /payment receipt/i],
    bodyPatterns: [/order #/i, /tracking number/i, /total:? \$/i, /subtotal/i],
    weight: 1.2,
  },
  social: {
    keywords: ['liked', 'followed', 'commented', 'mentioned', 'shared', 'friend request', 'invited you'],
    fromPatterns: [/noreply@.*linkedin/i, /notification@.*twitter/i, /noreply@.*facebook/i, /noreply@.*instagram/i, /noreply@.*reddit/i],
    subjectPatterns: [/liked your/i, /followed you/i, /mentioned you/i, /sent you a/i, /commented on/i],
    bodyPatterns: [/view post/i, /see the comment/i, /follow back/i],
    weight: 1.0,
  },
  notification: {
    keywords: ['alert', 'reminder', 'notify', 'scheduled', 'upcoming', 'expires', 'verify', 'confirm'],
    fromPatterns: [/noreply@/i, /no-reply@/i, /notifications@/i, /alerts@/i],
    subjectPatterns: [/reminder/i, /alert/i, /verification/i, /confirm your/i, /action required/i],
    bodyPatterns: [/click here to/i, /verify your/i, /confirm your/i],
    weight: 0.7,
  },
  spam: {
    keywords: ['free', 'winner', 'congratulations', 'claim', 'urgent', 'click here now', 'act now', 'limited time', 'money', 'prize', 'lottery', 'crypto', 'investment opportunity'],
    fromPatterns: [],
    subjectPatterns: [/urgent/i, /act now/i, /you'?ve? won/i, /congratulations/i, /free money/i],
    bodyPatterns: [/click here now/i, /act immediately/i, /you have been selected/i, /claim your prize/i],
    weight: 0.6,
  },
};

// ── Classifier ──

function scoreEmail(email: { subject: string; from: string; body: string }): Record<EmailCategory, number> {
  const scores: Record<EmailCategory, number> = {
    work: 0, personal: 0, newsletter: 0, transaction: 0,
    social: 0, notification: 0, spam: 0,
  };

  const text = `${email.subject} ${email.from} ${email.body}`.toLowerCase();

  for (const [category, rules] of Object.entries(CATEGORY_RULES)) {
    let score = 0;

    // Keyword matching
    for (const keyword of rules.keywords) {
      const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      const matches = text.match(regex);
      if (matches) score += matches.length * rules.weight;
    }

    // From pattern matching
    for (const pattern of rules.fromPatterns) {
      if (pattern.test(email.from)) score += 3 * rules.weight;
    }

    // Subject pattern matching
    for (const pattern of rules.subjectPatterns) {
      if (pattern.test(email.subject)) score += 2 * rules.weight;
    }

    // Body pattern matching
    for (const pattern of rules.bodyPatterns) {
      if (pattern.test(email.body)) score += 1.5 * rules.weight;
    }

    scores[category as EmailCategory] = score;
  }

  return scores;
}

export function classifyEmail(email: { subject: string; from: string; body: string }): CategoryResult {
  const scores = scoreEmail(email);
  const entries = Object.entries(scores) as [EmailCategory, number][];

  // Sort by score descending
  entries.sort((a, b) => b[1] - a[1]);

  const [topCategory, topScore] = entries[0];
  const totalScore = entries.reduce((sum, [, s]) => sum + s, 0);

  // Calculate confidence
  let confidence = 0.5; // default low confidence
  if (totalScore > 0) {
    confidence = topScore / totalScore;
  }
  // Boost confidence if top score is significantly higher
  if (entries.length > 1 && topScore > entries[1][1] * 2) {
    confidence = Math.min(confidence + 0.2, 1.0);
  }
  // If no strong signal, default to notification
  if (topScore < 1) {
    return {
      category: 'notification',
      confidence: 0.3,
      reasoning: 'No strong category signal detected',
    };
  }

  // Build reasoning
  const rules = CATEGORY_RULES[topCategory];
  const matchedKeywords = rules.keywords.filter(kw =>
    `${email.subject} ${email.body}`.toLowerCase().includes(kw.toLowerCase())
  );

  return {
    category: topCategory,
    confidence: Math.round(confidence * 100) / 100,
    subcategories: entries.slice(1, 3).filter(([, s]) => s > 0).map(([cat]) => cat),
    reasoning: matchedKeywords.length > 0
      ? `Matched keywords: ${matchedKeywords.slice(0, 5).join(', ')}`
      : undefined,
  };
}

export function classifyEmails(emails: Array<{ id: string; subject: string; from: string; body: string }>): CategorizedEmail[] {
  return emails.map(email => ({
    ...email,
    category: classifyEmail(email),
  }));
}

// ── Category Display Helpers ──

export const CATEGORY_CONFIG: Record<EmailCategory, { label: string; color: string; icon: string }> = {
  work: { label: 'Work', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', icon: '💼' },
  personal: { label: 'Personal', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400', icon: '👤' },
  newsletter: { label: 'Newsletter', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', icon: '📰' },
  transaction: { label: 'Transaction', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400', icon: '🧾' },
  social: { label: 'Social', color: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400', icon: '👥' },
  notification: { label: 'Notification', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400', icon: '🔔' },
  spam: { label: 'Spam', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: '🚫' },
};

// ── React Hook ──

import { useState, useCallback, useMemo } from 'react';

export function useEmailCategorizer() {
  const [categorizedEmails, setCategorizedEmails] = useState<CategorizedEmail[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const categorize = useCallback((emails: Array<{ id: string; subject: string; from: string; body: string }>) => {
    setIsProcessing(true);
    // Simulate async processing
    setTimeout(() => {
      const results = classifyEmails(emails);
      setCategorizedEmails(results);
      setIsProcessing(false);
    }, 100);
  }, []);

  const stats = useMemo(() => {
    const counts: Record<EmailCategory, number> = {
      work: 0, personal: 0, newsletter: 0, transaction: 0,
      social: 0, notification: 0, spam: 0,
    };
    for (const email of categorizedEmails) {
      counts[email.category.category]++;
    }
    return counts;
  }, [categorizedEmails]);

  return { categorizedEmails, categorize, stats, isProcessing };
}

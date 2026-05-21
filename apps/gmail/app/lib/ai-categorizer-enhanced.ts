'use client';

/**
 * LLM-Powered Mail Categorizer
 *
 * Hybrid approach:
 * 1. Fast local keyword rules for instant classification
 * 2. LLM-powered classification for ambiguous emails (via /api/ai)
 * 3. Learned behavior from user corrections
 *
 * Categories: Primary, Updates, Action Needed, FYI
 * Sub-categories: Work, Personal, Newsletter, Transaction, Social, Spam
 */

import type {InboxCategory} from './ai-mail';

// ── Types ──

export interface EnhancedCategoryResult {
  category: InboxCategory;
  confidence: number;
  reasoning: string;
  subCategory?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  isAutoRule: boolean;  // true if classified by local rules, false if by LLM
}

export interface UserCategoryCorrection {
  emailId: string;
  from: string;
  subject: string;
  previousCategory: InboxCategory;
  correctedCategory: InboxCategory;
  timestamp: number;
}

interface LearnedRule {
  fromPattern: string;
  targetCategory: InboxCategory;
  confidence: number;
  correctionCount: number;
}

// ── Local Storage for Learned Rules ──

const LEARNED_RULES_KEY = 'anvil-mail-learned-rules';
const CORRECTIONS_KEY = 'anvil-mail-corrections';

function loadLearnedRules(): LearnedRule[] {
  try {
    const stored = localStorage.getItem(LEARNED_RULES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveLearnedRules(rules: LearnedRule[]) {
  try {
    localStorage.setItem(LEARNED_RULES_KEY, JSON.stringify(rules));
  } catch {
    // Silently fail
  }
}

function loadCorrections(): UserCategoryCorrection[] {
  try {
    const stored = localStorage.getItem(CORRECTIONS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

// ── Priority Detection ──

function detectPriority(subject: string, body: string): 'low' | 'medium' | 'high' | 'urgent' {
  const text = `${subject} ${body}`.toLowerCase();
  const urgentPatterns = [
    /\b(urgent|asap|immediately|critical|emergency|time.?sensitive)\b/i,
    /\baction required\b/i,
    /\bdeadline (today|tomorrow)\b/i,
    /\bbreaking\b/i,
  ];
  const highPatterns = [
    /\b(important|priority|please review|approval needed|response needed)\b/i,
    /\bdue (today|tomorrow|this week)\b/i,
    /\bdeadline\b/i,
  ];

  for (const pattern of urgentPatterns) {
    if (pattern.test(text)) return 'urgent';
  }
  for (const pattern of highPatterns) {
    if (pattern.test(text)) return 'high';
  }
  return 'medium';
}

// ── Sub-category Detection ──

function detectSubCategory(from: string, subject: string, body: string): string {
  const text = `${from} ${subject} ${body}`.toLowerCase();

  if (/noreply@.*(github|gitlab|bitbucket|jira|slack|notion|linear)/i.test(from)) return 'dev-tools';
  if (/noreply@.*(vercel|netlify|aws|cloudflare|heroku)/i.test(from)) return 'infra';
  if (/(newsletter|digest|weekly|@substack|@mailchimp)/i.test(from)) return 'newsletter';
  if (/(stripe|paypal|invoice|receipt|billing|order|amazon|shopify)/i.test(text)) return 'transaction';
  if (/(linkedin|twitter|x\.com|facebook|instagram|reddit)/i.test(from)) return 'social';
  if (/(calendar|meeting|invite|schedule)/i.test(text)) return 'calendar';
  if (/(university|school|edu\b|professor|course)/i.test(text)) return 'education';
  if (/(health|doctor|appointment|medical|pharmacy)/i.test(text)) return 'health';
  if (/(bank|finance|investment|mortgage|loan)/i.test(text)) return 'finance';
  if (/(travel|flight|hotel|airbnb|booking)/i.test(text)) return 'travel';

  return 'general';
}

// ── Check Learned Rules ──

function checkLearnedRules(from: string, subject: string): EnhancedCategoryResult | null {
  const rules = loadLearnedRules();
  const domain = from.split('@')[1] || '';

  for (const rule of rules) {
    if (rule.fromPattern === domain || from.includes(rule.fromPattern)) {
      return {
        category: rule.targetCategory,
        confidence: rule.confidence,
        reasoning: `Learned from ${rule.correctionCount} correction(s)`,
        isAutoRule: true,
      };
    }
  }

  return null;
}

// ── LLM Classification (via server) ──

export async function classifyWithLLM(
  email: {subject: string; from: string; body: string}
): Promise<EnhancedCategoryResult> {
  try {
    const resp = await fetch('/api/ai', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        action: 'classify',
        payload: {
          subject: email.subject,
          from: email.from,
          bodyPreview: email.body.slice(0, 500),
          categories: ['primary', 'updates', 'action-needed', 'fyi'],
        },
      }),
    });

    if (resp.ok) {
      const data = await resp.json();
      return {
        category: data.category || 'primary',
        confidence: data.confidence || 0.5,
        reasoning: data.reasoning || 'AI classified',
        subCategory: data.subCategory,
        priority: data.priority,
        isAutoRule: false,
      };
    }
  } catch (err) {
    console.error('LLM classification failed:', err);
  }

  // Fallback to primary
  return {
    category: 'primary',
    confidence: 0.3,
    reasoning: 'Fallback — LLM unavailable',
    isAutoRule: false,
  };
}

// ── Hybrid Classifier ──

import {classifyInboxCategory} from './ai-mail';

export function classifyEnhanced(
  email: {subject: string; from: string; body: string}
): EnhancedCategoryResult {
  // 1. Check learned rules first (highest priority)
  const learned = checkLearnedRules(email.from, email.subject);
  if (learned && learned.confidence > 0.7) {
    return learned;
  }

  // 2. Local keyword rules (fast)
  const local = classifyInboxCategory(email);

  // 3. Enhance with priority and sub-category
  const priority = detectPriority(email.subject, email.body);
  const subCategory = detectSubCategory(email.from, email.subject, email.body);

  // Boost action-needed if priority is high/urgent
  let finalCategory = local.category;
  let confidence = local.confidence;

  if (priority === 'urgent' && local.category !== 'action-needed') {
    finalCategory = 'action-needed';
    confidence = 0.9;
  } else if (priority === 'high' && local.category === 'primary') {
    finalCategory = 'action-needed';
    confidence = Math.max(confidence, 0.7);
  }

  return {
    category: finalCategory,
    confidence,
    reasoning: local.reasoning || 'Keyword-based classification',
    subCategory,
    priority,
    isAutoRule: true,
  };
}

// ── Learn from User Corrections ──

export function recordCorrection(
  email: {id: string; from: string; subject: string},
  previousCategory: InboxCategory,
  correctedCategory: InboxCategory
): void {
  // Store correction
  const corrections = loadCorrections();
  const correction: UserCategoryCorrection = {
    emailId: email.id,
    from: email.from,
    subject: email.subject,
    previousCategory,
    correctedCategory,
    timestamp: Date.now(),
  };
  corrections.push(correction);

  // Keep only last 500 corrections
  if (corrections.length > 500) {
    corrections.splice(0, corrections.length - 500);
  }

  try {
    localStorage.setItem(CORRECTIONS_KEY, JSON.stringify(corrections));
  } catch {
    // Silently fail
  }

  // Update learned rules
  const rules = loadLearnedRules();
  const domain = email.from.split('@')[1] || email.from;

  const existing = rules.find(r => r.fromPattern === domain);
  if (existing) {
    existing.targetCategory = correctedCategory;
    existing.correctionCount++;
    existing.confidence = Math.min(0.95, existing.confidence + 0.1);
  } else {
    rules.push({
      fromPattern: domain,
      targetCategory: correctedCategory,
      confidence: 0.7,
      correctionCount: 1,
    });
  }

  saveLearnedRules(rules);
}

// ── Batch Classify ──

export function classifyEmailsEnhanced(
  emails: Array<{id: string; subject: string; from: string; body: string}>
): Map<string, EnhancedCategoryResult> {
  const results = new Map<string, EnhancedCategoryResult>();
  for (const email of emails) {
    results.set(email.id, classifyEnhanced(email));
  }
  return results;
}

// ── Stats ──

export function getCategoryStats(
  results: Map<string, EnhancedCategoryResult>
): Record<InboxCategory, number> & {total: number} {
  const counts: Record<InboxCategory, number> & {total: number} = {
    primary: 0,
    updates: 0,
    'action-needed': 0,
    fyi: 0,
    total: 0,
  };

  for (const result of results.values()) {
    counts[result.category]++;
    counts.total++;
  }

  return counts;
}

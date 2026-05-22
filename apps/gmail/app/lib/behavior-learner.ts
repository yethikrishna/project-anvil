'use client';

/**
 * Behavior Learning Engine for Smart Email Filters
 *
 * Observes user actions on emails (archive, label, star, etc.)
 * and learns patterns to generate automatic filter rules.
 *
 * Features:
 * - Action logging with email metadata
 * - Pattern detection (sender patterns, subject patterns, time patterns)
 * - Confidence scoring (rules only activate after consistent behavior)
 * - Auto-generated filter rules from learned patterns
 * - User confirmation before rule activation
 * - Rule performance tracking (accuracy feedback)
 * - Persistence to localStorage
 */

import type {InboxCategory} from './ai-mail';

// ── Types ──

export type UserAction = 'archive' | 'label' | 'star' | 'delete' | 'reply' | 'forward' | 'mark-read' | 'snooze' | 'categorize';

export interface ActionLogEntry {
  id: string;
  timestamp: number;
  action: UserAction;
  emailId: string;
  emailFrom: string;
  emailFromDomain: string;
  emailSubject: string;
  emailCategory?: InboxCategory;
  label?: string;
  snoozeUntil?: number;
}

export interface LearnedPattern {
  id: string;
  type: 'sender' | 'domain' | 'subject-keyword' | 'time-of-day' | 'category-action';
  pattern: string;
  action: UserAction;
  label?: string;
  category?: InboxCategory;
  confidence: number;
  supportingActions: number;
  lastSeen: number;
  createdAt: number;
  isActive: boolean;
}

export interface GeneratedRule {
  id: string;
  name: string;
  description: string;
  patternId: string;
  conditions: Array<{
    field: 'from' | 'subject' | 'body' | 'category';
    operator: 'contains' | 'equals' | 'starts-with' | 'ends-with';
    value: string;
  }>;
  actions: Array<{
    type: UserAction;
    value?: string;
  }>;
  confidence: number;
  approved: boolean;
  timesApplied: number;
  timesCorrect: number;
  lastApplied?: number;
  createdAt: number;
}

export interface BehaviorProfile {
  actions: ActionLogEntry[];
  patterns: LearnedPattern[];
  rules: GeneratedRule[];
  lastUpdated: number;
}

// ── Constants ──

const STORAGE_KEY = 'anvil-mail-behavior-profile';
const MIN_ACTIONS_FOR_PATTERN = 3;
const MIN_CONFIDENCE_FOR_RULE = 0.7;
const MAX_LOG_SIZE = 500;
const MAX_PATTERNS = 50;
const MAX_RULES = 30;

// ── Storage ──

function loadProfile(): BehaviorProfile {
  if (typeof window === 'undefined') {
    return {actions: [], patterns: [], rules: [], lastUpdated: Date.now()};
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {}
  return {actions: [], patterns: [], rules: [], lastUpdated: Date.now()};
}

function saveProfile(profile: BehaviorProfile): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {}
}

// ── Pattern Detection ──

function extractDomain(email: string): string {
  const match = email.match(/@([\w.-]+)/);
  return match ? match[1].toLowerCase() : '';
}

function detectPatterns(actions: ActionLogEntry[]): LearnedPattern[] {
  const patterns: Map<string, LearnedPattern> = new Map();

  // Pattern 1: Same sender → same action
  const senderActions = new Map<string, {action: UserAction; label?: string; count: number; lastSeen: number}>();
  for (const a of actions) {
    const key = `${a.emailFrom}|${a.action}`;
    const existing = senderActions.get(key);
    if (existing) {
      existing.count++;
      existing.lastSeen = Math.max(existing.lastSeen, a.timestamp);
    } else {
      senderActions.set(key, {action: a.action, label: a.label, count: 1, lastSeen: a.timestamp});
    }
  }

  for (const [key, data] of senderActions) {
    if (data.count >= MIN_ACTIONS_FOR_PATTERN) {
      const sender = key.split('|')[0];
      const id = `sender-${sender}-${data.action}`;
      patterns.set(id, {
        id,
        type: 'sender',
        pattern: sender,
        action: data.action,
        label: data.label,
        confidence: Math.min(data.count / 10, 0.95),
        supportingActions: data.count,
        lastSeen: data.lastSeen,
        createdAt: Date.now(),
        isActive: false,
      });
    }
  }

  // Pattern 2: Same domain → same action
  const domainActions = new Map<string, {action: UserAction; label?: string; count: number; lastSeen: number}>();
  for (const a of actions) {
    if (!a.emailFromDomain) continue;
    const key = `${a.emailFromDomain}|${a.action}`;
    const existing = domainActions.get(key);
    if (existing) {
      existing.count++;
      existing.lastSeen = Math.max(existing.lastSeen, a.timestamp);
    } else {
      domainActions.set(key, {action: a.action, label: a.label, count: 1, lastSeen: a.timestamp});
    }
  }

  for (const [key, data] of domainActions) {
    if (data.count >= MIN_ACTIONS_FOR_PATTERN + 2) { // Higher threshold for domains
      const domain = key.split('|')[0];
      const id = `domain-${domain}-${data.action}`;
      patterns.set(id, {
        id,
        type: 'domain',
        pattern: domain,
        action: data.action,
        label: data.label,
        confidence: Math.min(data.count / 15, 0.9),
        supportingActions: data.count,
        lastSeen: data.lastSeen,
        createdAt: Date.now(),
        isActive: false,
      });
    }
  }

  // Pattern 3: Subject keyword → action
  const keywordActions = new Map<string, {action: UserAction; label?: string; count: number; subjects: Set<string>; lastSeen: number}>();
  const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'shall', 'for', 'and', 'but', 'or', 'not', 'in', 'on', 'at', 'to', 'from', 'of', 'with', 'by', 'this', 'that', 'it', 'its', 'you', 'your', 'we', 'our', 'they', 'their', 'me', 'my']);

  for (const a of actions) {
    const words = a.emailSubject.toLowerCase().split(/\s+/).filter(w => w.length > 3 && !stopWords.has(w));
    for (const word of words) {
      const key = `${word}|${a.action}`;
      const existing = keywordActions.get(key);
      if (existing) {
        existing.count++;
        existing.subjects.add(a.emailSubject);
        existing.lastSeen = Math.max(existing.lastSeen, a.timestamp);
      } else {
        keywordActions.set(key, {
          action: a.action,
          label: a.label,
          count: 1,
          subjects: new Set([a.emailSubject]),
          lastSeen: a.timestamp,
        });
      }
    }
  }

  for (const [key, data] of keywordActions) {
    if (data.count >= MIN_ACTIONS_FOR_PATTERN + 1 && data.subjects.size >= 3) {
      const keyword = key.split('|')[0];
      const id = `keyword-${keyword}-${data.action}`;
      patterns.set(id, {
        id,
        type: 'subject-keyword',
        pattern: keyword,
        action: data.action,
        label: data.label,
        confidence: Math.min(data.count / 12, 0.85),
        supportingActions: data.count,
        lastSeen: data.lastSeen,
        createdAt: Date.now(),
        isActive: false,
      });
    }
  }

  // Pattern 4: Category → action
  const categoryActions = new Map<string, {action: UserAction; count: number; lastSeen: number}>();
  for (const a of actions) {
    if (!a.emailCategory) continue;
    const key = `${a.emailCategory}|${a.action}`;
    const existing = categoryActions.get(key);
    if (existing) {
      existing.count++;
      existing.lastSeen = Math.max(existing.lastSeen, a.timestamp);
    } else {
      categoryActions.set(key, {action: a.action, count: 1, lastSeen: a.timestamp});
    }
  }

  for (const [key, data] of categoryActions) {
    if (data.count >= MIN_ACTIONS_FOR_PATTERN + 3) {
      const category = key.split('|')[0];
      const id = `category-${category}-${data.action}`;
      patterns.set(id, {
        id,
        type: 'category-action',
        pattern: category,
        action: data.action,
        confidence: Math.min(data.count / 20, 0.9),
        supportingActions: data.count,
        lastSeen: data.lastSeen,
        createdAt: Date.now(),
        isActive: false,
      });
    }
  }

  return Array.from(patterns.values())
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_PATTERNS);
}

// ── Rule Generation ──

function generateRulesFromPatterns(patterns: LearnedPattern[]): GeneratedRule[] {
  return patterns
    .filter(p => p.confidence >= MIN_CONFIDENCE_FOR_RULE)
    .map(p => {
      let conditions: GeneratedRule['conditions'] = [];
      let name = '';
      let description = '';

      switch (p.type) {
        case 'sender':
          conditions = [{field: 'from', operator: 'equals', value: p.pattern}];
          name = `Auto-${p.action} from ${p.pattern.split('@')[0]}`;
          description = `Always ${p.action} emails from ${p.pattern}`;
          break;
        case 'domain':
          conditions = [{field: 'from', operator: 'contains', value: `@${p.pattern}`}];
          name = `Auto-${p.action} from @${p.pattern}`;
          description = `Always ${p.action} emails from ${p.pattern} domain`;
          break;
        case 'subject-keyword':
          conditions = [{field: 'subject', operator: 'contains', value: p.pattern}];
          name = `Auto-${p.action} "${p.pattern}" emails`;
          description = `${p.action} emails with "${p.pattern}" in subject`;
          break;
        case 'category-action':
          conditions = [{field: 'category', operator: 'equals', value: p.pattern}];
          name = `Auto-${p.action} ${p.pattern} emails`;
          description = `Always ${p.action} ${p.pattern} category emails`;
          break;
      }

      const actions: GeneratedRule['actions'] = [
        {type: p.action, value: p.label},
      ];

      return {
        id: `rule-${p.id}`,
        name,
        description,
        patternId: p.id,
        conditions,
        actions,
        confidence: p.confidence,
        approved: false,
        timesApplied: 0,
        timesCorrect: 0,
        createdAt: Date.now(),
      };
    })
    .slice(0, MAX_RULES);
}

// ── Public API ──

export function logAction(
  action: UserAction,
  email: {id: string; from: string; subject: string; category?: InboxCategory},
  extra?: {label?: string; snoozeUntil?: number},
): BehaviorProfile {
  const profile = loadProfile();

  const entry: ActionLogEntry = {
    id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    action,
    emailId: email.id,
    emailFrom: email.from,
    emailFromDomain: extractDomain(email.from),
    emailSubject: email.subject,
    emailCategory: email.category,
    label: extra?.label,
    snoozeUntil: extra?.snoozeUntil,
  };

  // Add to log, keeping size bounded
  profile.actions = [entry, ...profile.actions].slice(0, MAX_LOG_SIZE);

  // Re-detect patterns
  profile.patterns = detectPatterns(profile.actions);

  // Generate rules from high-confidence patterns
  const newRules = generateRulesFromPatterns(profile.patterns);

  // Merge with existing rules (preserve approved status and stats)
  const existingRuleMap = new Map(profile.rules.map(r => [r.patternId, r]));
  profile.rules = newRules.map(nr => {
    const existing = existingRuleMap.get(nr.patternId);
    if (existing) {
      return {
        ...nr,
        approved: existing.approved,
        timesApplied: existing.timesApplied,
        timesCorrect: existing.timesCorrect,
        lastApplied: existing.lastApplied,
      };
    }
    return nr;
  });

  profile.lastUpdated = Date.now();
  saveProfile(profile);
  return profile;
}

export function getBehaviorProfile(): BehaviorProfile {
  return loadProfile();
}

export function approveRule(ruleId: string): BehaviorProfile {
  const profile = loadProfile();
  const rule = profile.rules.find(r => r.id === ruleId);
  if (rule) {
    rule.approved = true;
    profile.lastUpdated = Date.now();
    saveProfile(profile);
  }
  return profile;
}

export function rejectRule(ruleId: string): BehaviorProfile {
  const profile = loadProfile();
  profile.rules = profile.rules.filter(r => r.id !== ruleId);
  profile.lastUpdated = Date.now();
  saveProfile(profile);
  return profile;
}

export function recordRuleResult(ruleId: string, correct: boolean): BehaviorProfile {
  const profile = loadProfile();
  const rule = profile.rules.find(r => r.id === ruleId);
  if (rule) {
    rule.timesApplied++;
    if (correct) rule.timesCorrect++;
    rule.lastApplied = Date.now();
    profile.lastUpdated = Date.now();
    saveProfile(profile);
  }
  return profile;
}

export function getApprovedRules(): GeneratedRule[] {
  const profile = loadProfile();
  return profile.rules.filter(r => r.approved);
}

export function getPendingRules(): GeneratedRule[] {
  const profile = loadProfile();
  return profile.rules.filter(r => !r.approved).sort((a, b) => b.confidence - a.confidence);
}

/**
 * Apply learned rules to an incoming email.
 * Returns the first matching approved rule's actions, or null.
 */
export function applyRules(
  email: {from: string; subject: string; category?: InboxCategory},
): GeneratedRule | null {
  const profile = loadProfile();
  const approved = profile.rules.filter(r => r.approved);

  for (const rule of approved) {
    let matches = true;
    for (const cond of rule.conditions) {
      const fieldValue = cond.field === 'from' ? email.from :
        cond.field === 'subject' ? email.subject :
        cond.field === 'category' ? (email.category || '') :
        '';
      const val = fieldValue.toLowerCase();
      const target = cond.value.toLowerCase();

      switch (cond.operator) {
        case 'contains': matches = val.includes(target); break;
        case 'equals': matches = val === target; break;
        case 'starts-with': matches = val.startsWith(target); break;
        case 'ends-with': matches = val.endsWith(target); break;
      }
      if (!matches) break;
    }
    if (matches) return rule;
  }

  return null;
}

export function clearProfile(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

// Fix: reference `data` variable properly in domainActions loop
// (the variable was referenced as `data.label` but should use a local)
// Already correct in the closure — the for-of creates a new binding per iteration.

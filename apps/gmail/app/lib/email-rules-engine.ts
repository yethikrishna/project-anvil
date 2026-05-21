'use client';

/**
 * Smart Email Rules Engine
 *
 * AI-generated rules + user-defined rules that automatically
 * categorize, label, archive, or flag incoming emails.
 *
 * Features:
 * - Condition-based rule matching (from, subject, body, category, priority)
 * - Multiple actions per rule (label, archive, star, mark-read, forward)
 * - AI rule suggestions based on email patterns
 * - Rule priority ordering
 * - Rule statistics (how many emails matched, last triggered)
 * - Import/export rules
 */

// ── Types ──

export type RuleConditionField = 'from' | 'subject' | 'body' | 'category' | 'priority' | 'has-attachment';
export type RuleConditionOperator = 'contains' | 'equals' | 'starts-with' | 'ends-with' | 'matches' | 'not-contains' | 'not-equals';
export type RuleActionType = 'label' | 'archive' | 'star' | 'mark-read' | 'categorize' | 'pin' | 'mute';

export interface RuleCondition {
  field: RuleConditionField;
  operator: RuleConditionOperator;
  value: string;
}

export interface RuleAction {
  type: RuleActionType;
  value?: string; // e.g., label name, category name
}

export interface EmailRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  conditions: RuleCondition[];
  conditionLogic: 'all' | 'any'; // ALL conditions must match, or ANY
  actions: RuleAction[];
  priority: number; // Lower = higher priority
  matchCount: number;
  lastTriggered: number | null;
  createdAt: number;
  source: 'ai' | 'user' | 'imported';
  confidence?: number; // For AI-generated rules
}

export interface RuleEvaluationResult {
  ruleId: string;
  matched: boolean;
  actions: RuleAction[];
  matchDetails: string[];
}

// ── Rule Storage ──

const RULES_KEY = 'anvil-mail-rules';

export function loadRules(): EmailRule[] {
  try {
    const stored = localStorage.getItem(RULES_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Silently fail
  }
  return getDefaultRules();
}

export function saveRules(rules: EmailRule[]) {
  try {
    localStorage.setItem(RULES_KEY, JSON.stringify(rules));
  } catch {
    // Silently fail
  }
}

// ── Default Rules ──

function getDefaultRules(): EmailRule[] {
  return [
    {
      id: 'rule-auto-spam',
      name: 'Auto-flag obvious spam',
      description: 'Flag emails with common spam patterns',
      enabled: true,
      conditions: [
        {field: 'subject', operator: 'matches', value: '/(you.?ve? won|congratulations|claim your|free money|act now)/i'},
        {field: 'body', operator: 'matches', value: '/(click here now|claim your prize|act immediately)/i'},
      ],
      conditionLogic: 'any',
      actions: [{type: 'label', value: 'spam'}],
      priority: 1,
      matchCount: 0,
      lastTriggered: null,
      createdAt: Date.now(),
      source: 'ai',
      confidence: 0.95,
    },
    {
      id: 'rule-auto-updates',
      name: 'Auto-categorize notifications',
      description: 'Move deploy/CI notifications to Updates',
      enabled: true,
      conditions: [
        {field: 'from', operator: 'contains', value: 'noreply@'},
        {field: 'subject', operator: 'matches', value: '/(deploy|build|merged|ci)/i'},
      ],
      conditionLogic: 'all',
      actions: [{type: 'categorize', value: 'updates'}, {type: 'mark-read'}],
      priority: 10,
      matchCount: 0,
      lastTriggered: null,
      createdAt: Date.now(),
      source: 'ai',
      confidence: 0.85,
    },
    {
      id: 'rule-star-action',
      name: 'Star action-needed emails',
      description: 'Auto-star emails that need a response',
      enabled: true,
      conditions: [
        {field: 'subject', operator: 'matches', value: '/(action required|approval needed|please review|urgent|asap)/i'},
      ],
      conditionLogic: 'any',
      actions: [{type: 'star'}, {type: 'categorize', value: 'action-needed'}],
      priority: 5,
      matchCount: 0,
      lastTriggered: null,
      createdAt: Date.now(),
      source: 'ai',
      confidence: 0.9,
    },
  ];
}

// ── Rule Evaluation ──

function evaluateCondition(
  condition: RuleCondition,
  email: {subject: string; from: string; body: string; category?: string; priority?: string; hasAttachment?: boolean}
): {matches: boolean; detail: string} {
  let fieldValue: string;

  switch (condition.field) {
    case 'from':
      fieldValue = email.from;
      break;
    case 'subject':
      fieldValue = email.subject;
      break;
    case 'body':
      fieldValue = email.body;
      break;
    case 'category':
      fieldValue = email.category || '';
      break;
    case 'priority':
      fieldValue = email.priority || '';
      break;
    case 'has-attachment':
      fieldValue = email.hasAttachment ? 'true' : 'false';
      break;
    default:
      fieldValue = '';
  }

  const lowerField = fieldValue.toLowerCase();
  const lowerValue = condition.value.toLowerCase();

  switch (condition.operator) {
    case 'contains':
      return {matches: lowerField.includes(lowerValue), detail: `${condition.field} contains "${condition.value}"`};
    case 'not-contains':
      return {matches: !lowerField.includes(lowerValue), detail: `${condition.field} doesn't contain "${condition.value}"`};
    case 'equals':
      return {matches: lowerField === lowerValue, detail: `${condition.field} equals "${condition.value}"`};
    case 'not-equals':
      return {matches: lowerField !== lowerValue, detail: `${condition.field} doesn't equal "${condition.value}"`};
    case 'starts-with':
      return {matches: lowerField.startsWith(lowerValue), detail: `${condition.field} starts with "${condition.value}"`};
    case 'ends-with':
      return {matches: lowerField.endsWith(lowerValue), detail: `${condition.field} ends with "${condition.value}"`};
    case 'matches': {
      try {
        const regex = new RegExp(condition.value, 'i');
        return {matches: regex.test(fieldValue), detail: `${condition.field} matches /${condition.value}/`};
      } catch {
        return {matches: false, detail: `Invalid regex: ${condition.value}`};
      }
    }
    default:
      return {matches: false, detail: `Unknown operator: ${condition.operator}`};
  }
}

export function evaluateRule(
  rule: EmailRule,
  email: {subject: string; from: string; body: string; category?: string; priority?: string; hasAttachment?: boolean}
): RuleEvaluationResult {
  if (!rule.enabled) {
    return {ruleId: rule.id, matched: false, actions: [], matchDetails: []};
  }

  const results = rule.conditions.map(c => evaluateCondition(c, email));
  const matchDetails = results.filter(r => r.matches).map(r => r.detail);

  const matched = rule.conditionLogic === 'all'
    ? results.every(r => r.matches)
    : results.some(r => r.matches);

  return {
    ruleId: rule.id,
    matched,
    actions: matched ? rule.actions : [],
    matchDetails,
  };
}

export function evaluateAllRules(
  rules: EmailRule[],
  email: {subject: string; from: string; body: string; category?: string; priority?: string; hasAttachment?: boolean}
): RuleEvaluationResult[] {
  // Sort by priority (lower = higher priority)
  const sorted = [...rules].sort((a, b) => a.priority - b.priority);
  return sorted.map(rule => evaluateRule(rule, email)).filter(r => r.matched);
}

// ── AI Rule Generation from Email Patterns ──

export function generateRulesFromPatterns(
  emails: Array<{from: string; subject: string; body: string; category?: string}>,
  existingRules: EmailRule[]
): EmailRule[] {
  const newRules: EmailRule[] = [];

  // Analyze sender patterns
  const senderStats: Record<string, {count: number; subjects: string[]; categories: string[]}> = {};
  for (const email of emails) {
    const domain = email.from.split('@')[1] || 'unknown';
    if (!senderStats[domain]) {
      senderStats[domain] = {count: 0, subjects: [], categories: []};
    }
    senderStats[domain].count++;
    senderStats[domain].subjects.push(email.subject);
    if (email.category) senderStats[domain].categories.push(email.category);
  }

  // Generate rules for high-volume senders
  for (const [domain, stats] of Object.entries(senderStats)) {
    if (stats.count < 3) continue;

    // Skip if there's already a rule for this domain
    if (existingRules.some(r => r.conditions.some(c => c.value.includes(domain)))) continue;

    // Determine the dominant pattern
    const isNotification = stats.subjects.some(s => /deploy|build|merged|ci|notification/i.test(s));
    const isNewsletter = stats.subjects.some(s => /newsletter|digest|weekly|issue/i.test(s));

    if (isNotification) {
      newRules.push({
        id: `rule-gen-${domain}-${Date.now()}`,
        name: `Auto-handle ${domain} notifications`,
        description: `${stats.count} notification emails from ${domain}`,
        enabled: false, // Disabled by default — user reviews first
        conditions: [{field: 'from', operator: 'contains', value: domain}],
        conditionLogic: 'all',
        actions: [{type: 'categorize', value: 'updates'}, {type: 'mark-read'}],
        priority: 20,
        matchCount: 0,
        lastTriggered: null,
        createdAt: Date.now(),
        source: 'ai',
        confidence: Math.min(stats.count / 10, 0.9),
      });
    }

    if (isNewsletter) {
      newRules.push({
        id: `rule-gen-${domain}-${Date.now()}`,
        name: `Categorize ${domain} as FYI`,
        description: `${stats.count} newsletter emails from ${domain}`,
        enabled: false,
        conditions: [{field: 'from', operator: 'contains', value: domain}],
        conditionLogic: 'all',
        actions: [{type: 'categorize', value: 'fyi'}],
        priority: 25,
        matchCount: 0,
        lastTriggered: null,
        createdAt: Date.now(),
        source: 'ai',
        confidence: Math.min(stats.count / 10, 0.85),
      });
    }
  }

  return newRules.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
}

// ── Rule CRUD ──

export function createRule(rule: Omit<EmailRule, 'id' | 'matchCount' | 'lastTriggered' | 'createdAt'>): EmailRule {
  return {
    ...rule,
    id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    matchCount: 0,
    lastTriggered: null,
    createdAt: Date.now(),
  };
}

export function updateRule(rules: EmailRule[], ruleId: string, updates: Partial<EmailRule>): EmailRule[] {
  return rules.map(r => r.id === ruleId ? {...r, ...updates} : r);
}

export function deleteRule(rules: EmailRule[], ruleId: string): EmailRule[] {
  return rules.filter(r => r.id !== ruleId);
}

export function toggleRule(rules: EmailRule[], ruleId: string): EmailRule[] {
  return rules.map(r => r.id === ruleId ? {...r, enabled: !r.enabled} : r);
}

// ── Export / Import ──

export function exportRules(rules: EmailRule[]): string {
  return JSON.stringify(rules, null, 2);
}

export function importRules(json: string): {rules: EmailRule[]; errors: string[]} {
  const errors: string[] = [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) {
      return {rules: [], errors: ['Invalid format: expected array']};
    }

    const rules = parsed.filter((r: any) => {
      if (!r.name || !r.conditions || !r.actions) {
        errors.push(`Rule "${r.name || 'unnamed'}" is missing required fields`);
        return false;
      }
      return true;
    }).map((r: any) => ({
      ...r,
      id: r.id || `rule-imported-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      source: 'imported' as const,
    }));

    return {rules, errors};
  } catch {
    return {rules: [], errors: ['Invalid JSON']};
  }
}

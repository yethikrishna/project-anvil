'use client';

/**
 * Smart Rules Auto-Generator
 *
 * Automatically generates email rules from:
 * 1. User behavior patterns (what they archive, star, label)
 * 2. Email content patterns (recurring senders, subjects)
 * 3. Time patterns (when certain emails arrive)
 * 4. Category patterns (auto-filing by category)
 *
 * Produces actionable rules that the user can review and enable.
 */

// Sender importance is tracked via smart-priority-inbox

// ── Types ──

export interface SmartRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  conditions: SmartRuleCondition[];
  actions: SmartRuleAction[];
  confidence: number;   // 0-1
  source: 'behavior' | 'pattern' | 'category' | 'time';
  createdAt: number;
  appliedCount: number;
  lastApplied: number | null;
}

export interface SmartRuleCondition {
  field: 'from' | 'subject' | 'body' | 'category' | 'time' | 'has-attachment';
  operator: 'contains' | 'equals' | 'matches' | 'starts-with' | 'in-category' | 'between';
  value: string;
}

export interface SmartRuleAction {
  type: 'label' | 'archive' | 'star' | 'mark-read' | 'categorize' | 'forward' | 'snooze';
  value?: string;
}

export interface RuleSuggestion {
  rule: SmartRule;
  reason: string;
  evidence: string;
  canAutoApply: boolean;
}

// ── Rule Storage ──

const RULES_KEY = 'anvil-smart-rules';

export function loadSmartRules(): SmartRule[] {
  try {
    const stored = localStorage.getItem(RULES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function saveSmartRules(rules: SmartRule[]): void {
  try {
    localStorage.setItem(RULES_KEY, JSON.stringify(rules));
  } catch {}
}

export function addSmartRule(rule: SmartRule): void {
  const rules = loadSmartRules();
  rules.push(rule);
  saveSmartRules(rules);
}

export function removeSmartRule(id: string): void {
  const rules = loadSmartRules().filter(r => r.id !== id);
  saveSmartRules(rules);
}

export function toggleSmartRule(id: string): void {
  const rules = loadSmartRules();
  const rule = rules.find(r => r.id === id);
  if (rule) {
    rule.enabled = !rule.enabled;
    saveSmartRules(rules);
  }
}

// ── Behavior Pattern Analysis ──

interface ActionLog {
  action: string;
  emailFrom: string;
  emailSubject: string;
  timestamp: number;
}

const ACTION_LOG_KEY = 'anvil-action-log';

export function logAction(action: string, emailFrom: string, emailSubject: string): void {
  try {
    const log: ActionLog[] = JSON.parse(localStorage.getItem(ACTION_LOG_KEY) || '[]');
    log.push({action, emailFrom, emailSubject, timestamp: Date.now()});
    // Keep last 1000 actions
    if (log.length > 1000) log.splice(0, log.length - 1000);
    localStorage.setItem(ACTION_LOG_KEY, JSON.stringify(log));
  } catch {}
}

function loadActionLog(): ActionLog[] {
  try {
    return JSON.parse(localStorage.getItem(ACTION_LOG_KEY) || '[]');
  } catch {
    return [];
  }
}

// ── Pattern Detection ──

function getDomain(email: string): string {
  return email.split('@')[1] || email;
}

function detectBehaviorPatterns(log: ActionLog[]): RuleSuggestion[] {
  const suggestions: RuleSuggestion[] = [];

  // Group actions by domain
  const domainActions = new Map<string, {archive: number; star: number; label: Map<string, number>; total: number}>();

  for (const entry of log) {
    const domain = getDomain(entry.emailFrom);
    const existing = domainActions.get(domain) || {archive: 0, star: 0, label: new Map(), total: 0};
    existing.total++;

    if (entry.action === 'archive') existing.archive++;
    if (entry.action === 'star') existing.star++;
    if (entry.action.startsWith('label:')) {
      const label = entry.action.slice(6);
      existing.label.set(label, (existing.label.get(label) || 0) + 1);
    }

    domainActions.set(domain, existing);
  }

  // Generate rules for domains with consistent behavior
  for (const [domain, stats] of domainActions) {
    if (stats.total < 3) continue; // Need at least 3 data points

    const archiveRate = stats.archive / stats.total;
    const starRate = stats.star / stats.total;
    const topLabel = [...stats.label.entries()].sort((a, b) => b[1] - a[1])[0];

    // Auto-archive rule
    if (archiveRate >= 0.8 && stats.total >= 5) {
      suggestions.push({
        rule: {
          id: `rule-archive-${domain}`,
          name: `Auto-archive from ${domain}`,
          description: `${Math.round(archiveRate * 100)}% of emails from ${domain} are archived`,
          enabled: false,
          conditions: [{field: 'from', operator: 'contains', value: domain}],
          actions: [{type: 'archive'}],
          confidence: Math.min(0.95, archiveRate * 0.9 + 0.1),
          source: 'behavior',
          createdAt: Date.now(),
          appliedCount: 0,
          lastApplied: null,
        },
        reason: `You archive ${Math.round(archiveRate * 100)}% of emails from ${domain}`,
        evidence: `${stats.archive}/${stats.total} archived in recent history`,
        canAutoApply: archiveRate >= 0.9,
      });
    }

    // Auto-star rule
    if (starRate >= 0.7 && stats.total >= 3) {
      suggestions.push({
        rule: {
          id: `rule-star-${domain}`,
          name: `Auto-star from ${domain}`,
          description: `${Math.round(starRate * 100)}% of emails from ${domain} are starred`,
          enabled: false,
          conditions: [{field: 'from', operator: 'contains', value: domain}],
          actions: [{type: 'star'}],
          confidence: Math.min(0.95, starRate * 0.85 + 0.1),
          source: 'behavior',
          createdAt: Date.now(),
          appliedCount: 0,
          lastApplied: null,
        },
        reason: `You star ${Math.round(starRate * 100)}% of emails from ${domain}`,
        evidence: `${stats.star}/${stats.total} starred in recent history`,
        canAutoApply: starRate >= 0.85,
      });
    }

    // Auto-label rule
    if (topLabel && topLabel[1] / stats.total >= 0.6 && stats.total >= 3) {
      const labelName = topLabel[0];
      suggestions.push({
        rule: {
          id: `rule-label-${domain}-${labelName}`,
          name: `Label ${domain} as "${labelName}"`,
          description: `${Math.round(topLabel[1] / stats.total * 100)}% of emails from ${domain} get labeled "${labelName}"`,
          enabled: false,
          conditions: [{field: 'from', operator: 'contains', value: domain}],
          actions: [{type: 'label', value: labelName}],
          confidence: Math.min(0.9, (topLabel[1] / stats.total) * 0.8 + 0.1),
          source: 'behavior',
          createdAt: Date.now(),
          appliedCount: 0,
          lastApplied: null,
        },
        reason: `You label ${Math.round(topLabel[1] / stats.total * 100)}% of emails from ${domain} as "${labelName}"`,
        evidence: `${topLabel[1]}/${stats.total} labeled in recent history`,
        canAutoApply: topLabel[1] / stats.total >= 0.8,
      });
    }
  }

  return suggestions;
}

// ── Category-based Rules ──

function detectCategoryRules(): RuleSuggestion[] {
  const suggestions: RuleSuggestion[] = [
    {
      rule: {
        id: 'rule-cat-updates',
        name: 'Auto-archive Updates',
        description: 'Archive emails categorized as Updates',
        enabled: false,
        conditions: [{field: 'category', operator: 'in-category', value: 'updates'}],
        actions: [{type: 'archive'}],
        confidence: 0.6,
        source: 'category',
        createdAt: Date.now(),
        appliedCount: 0,
        lastApplied: null,
      },
      reason: 'Update emails are typically low-priority',
      evidence: 'Category-based heuristic',
      canAutoApply: false,
    },
    {
      rule: {
        id: 'rule-cat-action',
        name: 'Star Action Needed',
        description: 'Star emails that require action',
        enabled: false,
        conditions: [{field: 'category', operator: 'in-category', value: 'action-needed'}],
        actions: [{type: 'star'}],
        confidence: 0.7,
        source: 'category',
        createdAt: Date.now(),
        appliedCount: 0,
        lastApplied: null,
      },
      reason: 'Action-needed emails should be highlighted',
      evidence: 'Category-based heuristic',
      canAutoApply: false,
    },
  ];

  return suggestions;
}

// ── Newsletter Detection Rule ──

function detectNewsletterRule(): RuleSuggestion {
  return {
    rule: {
      id: 'rule-newsletter',
      name: 'Auto-label Newsletters',
      description: 'Label newsletter and digest emails',
      enabled: false,
      conditions: [
        {field: 'from', operator: 'matches', value: '(newsletter|digest|noreply|@substack|@mailchimp|@sendgrid|@mailgun)'},
      ],
      actions: [{type: 'label', value: 'newsletter'}, {type: 'categorize', value: 'updates'}],
      confidence: 0.8,
      source: 'pattern',
      createdAt: Date.now(),
      appliedCount: 0,
      lastApplied: null,
    },
    reason: 'Newsletters are consistently identifiable from sender patterns',
    evidence: 'Pattern-based: sender domain contains newsletter service identifiers',
    canAutoApply: true,
  };
}

// ── Main Generator ──

export function generateRuleSuggestions(): RuleSuggestion[] {
  const suggestions: RuleSuggestion[] = [];

  // 1. Behavior-based rules
  const log = loadActionLog();
  if (log.length >= 5) {
    suggestions.push(...detectBehaviorPatterns(log));
  }

  // 2. Category-based rules
  suggestions.push(...detectCategoryRules());

  // 3. Pattern-based rules
  suggestions.push(detectNewsletterRule());

  // Sort by confidence
  return suggestions.sort((a, b) => b.rule.confidence - a.rule.confidence);
}

// ── Rule Application ──

export function applyRules(
  email: {from: string; subject: string; body: string; category?: string},
  rules?: SmartRule[],
): SmartRuleAction[] {
  const enabledRules = (rules || loadSmartRules()).filter(r => r.enabled);
  const actions: SmartRuleAction[] = [];

  for (const rule of enabledRules) {
    let matches = true;

    for (const condition of rule.conditions) {
      switch (condition.field) {
        case 'from':
          matches = email.from.toLowerCase().includes(condition.value.toLowerCase());
          break;
        case 'subject':
          matches = email.subject.toLowerCase().includes(condition.value.toLowerCase());
          break;
        case 'body':
          matches = email.body.toLowerCase().includes(condition.value.toLowerCase());
          break;
        case 'category':
          matches = email.category === condition.value;
          break;
        default:
          matches = false;
      }
      if (!matches) break;
    }

    if (matches) {
      actions.push(...rule.actions);
      // Update rule stats
      const rules = loadSmartRules();
      const r = rules.find(rr => rr.id === rule.id);
      if (r) {
        r.appliedCount++;
        r.lastApplied = Date.now();
        saveSmartRules(rules);
      }
    }
  }

  return actions;
}

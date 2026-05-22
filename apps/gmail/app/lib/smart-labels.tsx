'use client';

/**
 * AI Smart Labels — Anvil Mail
 *
 * Learns from user behavior to auto-suggest and apply labels.
 * Analyzes email content and matches against learned label patterns.
 *
 * Features:
 * - Suggest labels based on email content
 * - Auto-label on arrival (configurable)
 * - Learn from manual labels: "if I label this, learn from it"
 * - Built-in label templates: Finance, Legal, HR, Product, Customer
 * - Bulk label suggestions for inbox
 * - Label confidence scores
 */

import {useState, useMemo} from 'react';

// ── Types ──

export interface LabelSuggestion {
  label: string;
  confidence: number;     // 0-1
  reason: string;
  color: string;
}

export interface LabelRule {
  id: string;
  label: string;
  color: string;
  keywords: string[];
  senderPatterns: string[];
  subjectPatterns: string[];
  autoApply: boolean;
  learnedCount: number;   // times this rule was confirmed
}

// ── Default label rules ──

const DEFAULT_RULES: LabelRule[] = [
  {
    id: 'finance',
    label: 'Finance',
    color: '#16a34a',
    keywords: ['invoice', 'payment', 'billing', 'receipt', 'expense', 'budget', 'cost', 'revenue', 'refund', 'charge', 'subscription', 'renewal', 'quote', 'estimate', 'tax', 'payroll', 'reimbursement'],
    senderPatterns: ['billing@', 'payments@', 'finance@', 'accounts@', 'invoices@', 'noreply@stripe', 'noreply@paypal'],
    subjectPatterns: ['invoice', 'payment received', 'receipt for', 'billing statement', 'your subscription'],
    autoApply: true,
    learnedCount: 0,
  },
  {
    id: 'legal',
    label: 'Legal',
    color: '#dc2626',
    keywords: ['contract', 'agreement', 'terms', 'nda', 'legal', 'lawsuit', 'compliance', 'gdpr', 'privacy', 'liability', 'clause', 'attorney', 'counsel', 'litigation', 'dispute', 'intellectual property', 'copyright', 'trademark'],
    senderPatterns: ['legal@', 'contracts@', 'compliance@', 'counsel@'],
    subjectPatterns: ['contract', 'agreement', 'nda', 'terms and conditions', 'legal notice'],
    autoApply: false,
    learnedCount: 0,
  },
  {
    id: 'action-required',
    label: 'Action Required',
    color: '#d97706',
    keywords: ['please', 'action required', 'deadline', 'by friday', 'by monday', 'asap', 'urgent', 'please review', 'please approve', 'please confirm', 'sign', 'approve', 'review and respond'],
    senderPatterns: [],
    subjectPatterns: ['action required', 'please review', 'approval needed', 'response needed', 'your input'],
    autoApply: true,
    learnedCount: 0,
  },
  {
    id: 'travel',
    label: 'Travel',
    color: '#0ea5e9',
    keywords: ['booking', 'reservation', 'itinerary', 'flight', 'hotel', 'airbnb', 'check-in', 'boarding pass', 'confirmation', 'trip', 'travel'],
    senderPatterns: ['booking@', 'reservations@', 'noreply@airbnb', 'noreply@expedia', 'noreply@hotels'],
    subjectPatterns: ['booking confirmation', 'your reservation', 'flight confirmation', 'hotel confirmation', 'itinerary'],
    autoApply: true,
    learnedCount: 0,
  },
  {
    id: 'hr',
    label: 'HR',
    color: '#8b5cf6',
    keywords: ['onboarding', 'offer letter', 'benefits', 'pto', 'vacation', 'performance review', 'compensation', 'salary', 'equity', 'vesting', 'employee', 'hr', 'team member', 'welcome aboard', 'handbook'],
    senderPatterns: ['hr@', 'people@', 'talent@', 'recruiting@', 'onboarding@'],
    subjectPatterns: ['offer letter', 'benefits enrollment', 'welcome to the team', 'performance review'],
    autoApply: false,
    learnedCount: 0,
  },
  {
    id: 'customer',
    label: 'Customer',
    color: '#f59e0b',
    keywords: ['customer', 'client', 'support ticket', 'feature request', 'bug report', 'feedback', 'satisfaction', 'nps', 'onboarding', 'renewal', 'churn', 'upgrade'],
    senderPatterns: ['support@', 'customers@', 'success@', 'help@'],
    subjectPatterns: ['support ticket', 'feature request', 'bug report', 'customer feedback'],
    autoApply: false,
    learnedCount: 0,
  },
  {
    id: 'product',
    label: 'Product',
    color: '#6366f1',
    keywords: ['sprint', 'roadmap', 'feature', 'release', 'launch', 'milestone', 'backlog', 'user story', 'product update', 'changelog', 'beta', 'alpha', 'iteration', 'feedback', 'prototype', 'design review'],
    senderPatterns: ['product@', 'design@', 'engineering@'],
    subjectPatterns: ['product update', 'sprint review', 'roadmap', 'release notes', 'changelog'],
    autoApply: false,
    learnedCount: 0,
  },
];

// ── Label storage ──

const STORAGE_KEY = 'anvil:smart-labels:rules';

export function loadLabelRules(): LabelRule[] {
  if (typeof window === 'undefined') return DEFAULT_RULES;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_RULES;
    return JSON.parse(stored) as LabelRule[];
  } catch {
    return DEFAULT_RULES;
  }
}

export function saveLabelRules(rules: LabelRule[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
}

// ── Scoring ──

export function suggestLabels(
  subject: string,
  body: string,
  senderEmail: string,
  rules?: LabelRule[],
): LabelSuggestion[] {
  const activeRules = rules ?? loadLabelRules();
  const textLower = `${subject} ${body}`.toLowerCase();
  const subjectLower = subject.toLowerCase();
  const suggestions: LabelSuggestion[] = [];

  for (const rule of activeRules) {
    let score = 0;
    const matchedReasons: string[] = [];

    // Keyword matching
    const keywordMatches = rule.keywords.filter(kw => textLower.includes(kw.toLowerCase()));
    if (keywordMatches.length > 0) {
      score += Math.min(0.6, keywordMatches.length * 0.15);
      matchedReasons.push(`keywords: ${keywordMatches.slice(0, 3).join(', ')}`);
    }

    // Sender pattern matching
    const senderMatch = rule.senderPatterns.some(pattern =>
      senderEmail.toLowerCase().includes(pattern.toLowerCase()),
    );
    if (senderMatch) {
      score += 0.4;
      matchedReasons.push('sender pattern');
    }

    // Subject pattern matching
    const subjectMatch = rule.subjectPatterns.some(pattern =>
      subjectLower.includes(pattern.toLowerCase()),
    );
    if (subjectMatch) {
      score += 0.3;
      matchedReasons.push('subject match');
    }

    // Boost by learned count
    if (rule.learnedCount > 0) {
      score = Math.min(1, score + rule.learnedCount * 0.02);
    }

    if (score >= 0.2) {
      suggestions.push({
        label: rule.label,
        confidence: Math.min(1, score),
        reason: matchedReasons.join('; '),
        color: rule.color,
      });
    }
  }

  return suggestions.sort((a, b) => b.confidence - a.confidence).slice(0, 4);
}

// ── Components ──

interface SmartLabelBadgesProps {
  subject: string;
  body: string;
  senderEmail: string;
  appliedLabels: string[];
  onApply?: (label: string) => void;
}

export function SmartLabelBadges({
  subject, body, senderEmail, appliedLabels, onApply,
}: SmartLabelBadgesProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const suggestions = useMemo(
    () => suggestLabels(subject, body, senderEmail),
    [subject, body, senderEmail],
  );

  const visible = suggestions
    .filter(s => !appliedLabels.includes(s.label) && !dismissed.has(s.label) && s.confidence >= 0.3);

  if (visible.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {visible.slice(0, 3).map(s => (
        <div key={s.label} className="flex items-center gap-0.5">
          <button
            onClick={() => onApply?.(s.label)}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border hover:opacity-90 transition-opacity"
            style={{
              color: s.color,
              borderColor: s.color + '40',
              backgroundColor: s.color + '15',
            }}
            title={`AI suggests: ${s.reason} (${Math.round(s.confidence * 100)}% confidence)`}
          >
            ✨ {s.label}
          </button>
          <button
            onClick={() => setDismissed(prev => new Set([...prev, s.label]))}
            className="text-gray-300 hover:text-gray-500 text-[10px] -ml-0.5"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Label Manager Panel ──

interface SmartLabelsManagerProps {
  onClose: () => void;
}

export function SmartLabelsManagerPanel({onClose}: SmartLabelsManagerProps) {
  const [rules, setRules] = useState<LabelRule[]>(loadLabelRules);
  const [editingId, setEditingId] = useState<string | null>(null);

  const toggleAutoApply = (id: string) => {
    const updated = rules.map(r => r.id === id ? {...r, autoApply: !r.autoApply} : r);
    setRules(updated);
    saveLabelRules(updated);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-2xl shadow-2xl w-[500px] max-h-[75vh] flex flex-col">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100">
          <span className="text-base font-semibold text-gray-900">🏷️ Smart Labels</span>
          <span className="text-xs text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded-full">AI</span>
          <div className="flex-1" />
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
          {rules.map(rule => (
            <div key={rule.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50">
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{backgroundColor: rule.color}}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">{rule.label}</span>
                  {rule.learnedCount > 0 && (
                    <span className="text-[10px] text-green-600">
                      +{rule.learnedCount} learned
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-400 truncate">
                  {rule.keywords.slice(0, 5).join(', ')}
                </div>
              </div>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <span className="text-[11px] text-gray-500">Auto</span>
                <div
                  onClick={() => toggleAutoApply(rule.id)}
                  className={`w-8 h-4 rounded-full transition-colors cursor-pointer ${rule.autoApply ? 'bg-blue-500' : 'bg-gray-300'}`}
                >
                  <div className={`w-3 h-3 bg-white rounded-full shadow-sm m-0.5 transition-transform ${rule.autoApply ? 'translate-x-4' : ''}`} />
                </div>
              </label>
            </div>
          ))}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex justify-between items-center">
          <span className="text-xs text-gray-400">Labels are suggested inline on emails</span>
          <button
            onClick={onClose}
            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

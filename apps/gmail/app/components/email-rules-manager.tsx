'use client';

/**
 * Email Rules Manager Component
 *
 * Visual interface for managing smart email rules:
 * - View existing rules (AI-generated + user-created)
 * - Create new rules with condition/action builder
 * - Toggle, edit, delete rules
 * - View rule statistics
 * - Review AI-suggested rules
 */

import {useState, useCallback, useMemo} from 'react';
import {
  type EmailRule,
  type RuleCondition,
  type RuleAction,
  type RuleConditionField,
  type RuleConditionOperator,
  type RuleActionType,
  loadRules,
  saveRules,
  toggleRule,
  deleteRule,
  createRule,
  generateRulesFromPatterns,
} from '../lib/email-rules-engine';
import type {MailMessage} from '../lib/ai-mail';

// ── Props ──

interface EmailRulesManagerProps {
  messages: MailMessage[];
  onClose: () => void;
  onRuleApplied?: (rule: EmailRule) => void;
}

// ── Condition Field Labels ──

const FIELD_LABELS: Record<RuleConditionField, string> = {
  'from': 'From',
  'subject': 'Subject',
  'body': 'Body',
  'category': 'Category',
  'priority': 'Priority',
  'has-attachment': 'Has Attachment',
};

const OPERATOR_LABELS: Record<RuleConditionOperator, string> = {
  'contains': 'contains',
  'not-contains': "doesn't contain",
  'equals': 'equals',
  'not-equals': "doesn't equal",
  'starts-with': 'starts with',
  'ends-with': 'ends with',
  'matches': 'matches regex',
};

const ACTION_LABELS: Record<RuleActionType, {label: string; icon: string; needsValue: boolean}> = {
  'label': {label: 'Add label', icon: '🏷️', needsValue: true},
  'archive': {label: 'Archive', icon: '📦', needsValue: false},
  'star': {label: 'Star', icon: '⭐', needsValue: false},
  'mark-read': {label: 'Mark as read', icon: '✓', needsValue: false},
  'categorize': {label: 'Categorize as', icon: '📁', needsValue: true},
  'pin': {label: 'Pin to top', icon: '📌', needsValue: false},
  'mute': {label: 'Mute thread', icon: '🔇', needsValue: false},
};

// ── Component ──

export function EmailRulesManager({messages, onClose, onRuleApplied}: EmailRulesManagerProps) {
  const [rules, setRules] = useState<EmailRule[]>(() => loadRules());
  const [showNewRuleForm, setShowNewRuleForm] = useState(false);
  const [activeTab, setActiveTab] = useState<'active' | 'suggested' | 'create'>('active');

  // Generate AI suggestions
  const aiSuggestions = useMemo(
    () => generateRulesFromPatterns(
      messages.map(m => ({from: m.from.email, subject: m.subject, body: m.body, category: m.labels?.[0]})),
      rules
    ),
    [messages, rules]
  );

  const handleToggle = useCallback((ruleId: string) => {
    const updated = toggleRule(rules, ruleId);
    setRules(updated);
    saveRules(updated);
  }, [rules]);

  const handleDelete = useCallback((ruleId: string) => {
    const updated = deleteRule(rules, ruleId);
    setRules(updated);
    saveRules(updated);
  }, [rules]);

  const handleActivateSuggestion = useCallback((suggestion: EmailRule) => {
    const newRule = {...suggestion, enabled: true};
    const updated = [...rules, newRule];
    setRules(updated);
    saveRules(updated);
  }, [rules]);

  const handleCreateRule = useCallback((rule: EmailRule) => {
    const updated = [...rules, rule];
    setRules(updated);
    saveRules(updated);
    setShowNewRuleForm(false);
    setActiveTab('active');
  }, [rules]);

  const activeRules = rules.filter(r => r.enabled);
  const disabledRules = rules.filter(r => !r.enabled);

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-[640px] max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <span className="text-lg">⚙️</span>
            <h3 className="font-semibold text-gray-900">Smart Rules</h3>
            <span className="text-xs text-gray-400">{activeRules.length} active</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('create')}
              className="px-3 py-1 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              + New Rule
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          <TabButton active={activeTab === 'active'} onClick={() => setActiveTab('active')}>
            Active ({activeRules.length})
          </TabButton>
          <TabButton active={activeTab === 'suggested'} onClick={() => setActiveTab('suggested')}>
            AI Suggestions ({aiSuggestions.length})
          </TabButton>
          <TabButton active={activeTab === 'create'} onClick={() => setActiveTab('create')}>
            Create Rule
          </TabButton>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {activeTab === 'active' && (
            <div className="divide-y divide-gray-100">
              {rules.length === 0 ? (
                <div className="py-12 text-center">
                  <span className="text-3xl">📭</span>
                  <p className="text-sm text-gray-400 mt-2">No rules yet. Create one or accept AI suggestions.</p>
                </div>
              ) : (
                [...activeRules, ...disabledRules].map(rule => (
                  <RuleCard
                    key={rule.id}
                    rule={rule}
                    onToggle={() => handleToggle(rule.id)}
                    onDelete={() => handleDelete(rule.id)}
                    onApply={() => onRuleApplied?.(rule)}
                  />
                ))
              )}
            </div>
          )}

          {activeTab === 'suggested' && (
            <div className="divide-y divide-gray-100">
              {aiSuggestions.length === 0 ? (
                <div className="py-12 text-center">
                  <span className="text-3xl">✨</span>
                  <p className="text-sm text-gray-400 mt-2">No new suggestions. AI will analyze your email patterns over time.</p>
                </div>
              ) : (
                aiSuggestions.map(suggestion => (
                  <div key={suggestion.id} className="px-5 py-3 hover:bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900">{suggestion.name}</span>
                          <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-[10px] rounded-full">
                            AI · {Math.round((suggestion.confidence || 0) * 100)}% confidence
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">{suggestion.description}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {suggestion.actions.map((action, i) => (
                            <span key={i} className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">
                              {ACTION_LABELS[action.type]?.icon} {ACTION_LABELS[action.type]?.label}
                              {action.value ? `: ${action.value}` : ''}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleActivateSuggestion(suggestion)}
                          className="px-3 py-1 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                        >
                          Activate
                        </button>
                        <button
                          onClick={() => handleDelete(suggestion.id)}
                          className="px-2 py-1 text-xs text-gray-400 hover:text-red-500"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'create' && (
            <CreateRuleForm onSubmit={handleCreateRule} onCancel={() => setActiveTab('active')} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──

function TabButton({active, onClick, children}: {active: boolean; onClick: () => void; children: React.ReactNode}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 px-3 py-2.5 text-sm font-medium transition-colors ${
        active ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'
      }`}
    >
      {children}
    </button>
  );
}

function RuleCard({rule, onToggle, onDelete, onApply}: {
  rule: EmailRule;
  onToggle: () => void;
  onDelete: () => void;
  onApply: () => void;
}) {
  return (
    <div className={`px-5 py-3 ${!rule.enabled ? 'opacity-60' : ''}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Toggle */}
          <button
            onClick={onToggle}
            className={`w-8 h-4 rounded-full transition-colors relative ${rule.enabled ? 'bg-blue-600' : 'bg-gray-300'}`}
          >
            <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform ${rule.enabled ? 'left-4' : 'left-0.5'}`} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-900">{rule.name}</span>
              <span className={`px-1.5 py-0.5 text-[10px] rounded-full ${
                rule.source === 'ai' ? 'bg-purple-100 text-purple-700' :
                rule.source === 'imported' ? 'bg-gray-100 text-gray-600' :
                'bg-blue-100 text-blue-700'
              }`}>
                {rule.source === 'ai' ? 'AI' : rule.source === 'imported' ? 'Imported' : 'Custom'}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">{rule.description}</p>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-[10px] text-gray-400">
                {rule.matchCount > 0 ? `${rule.matchCount} matches` : 'No matches yet'}
              </span>
              {rule.lastTriggered && (
                <span className="text-[10px] text-gray-400">
                  Last: {new Date(rule.lastTriggered).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onApply} className="p-1 text-gray-400 hover:text-blue-500 rounded" title="Apply now">
            ▶
          </button>
          <button onClick={onDelete} className="p-1 text-gray-400 hover:text-red-500 rounded" title="Delete rule">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateRuleForm({onSubmit, onCancel}: {
  onSubmit: (rule: EmailRule) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [conditions, setConditions] = useState<RuleCondition[]>([
    {field: 'from', operator: 'contains', value: ''},
  ]);
  const [actions, setActions] = useState<RuleAction[]>([
    {type: 'label', value: ''},
  ]);
  const [logic, setLogic] = useState<'all' | 'any'>('all');

  const addCondition = () => {
    setConditions([...conditions, {field: 'from', operator: 'contains', value: ''}]);
  };

  const removeCondition = (index: number) => {
    setConditions(conditions.filter((_, i) => i !== index));
  };

  const updateCondition = (index: number, update: Partial<RuleCondition>) => {
    setConditions(conditions.map((c, i) => i === index ? {...c, ...update} : c));
  };

  const addAction = () => {
    setActions([...actions, {type: 'label', value: ''}]);
  };

  const removeAction = (index: number) => {
    setActions(actions.filter((_, i) => i !== index));
  };

  const updateAction = (index: number, update: Partial<RuleAction>) => {
    setActions(actions.map((a, i) => i === index ? {...a, ...update} : a));
  };

  const handleSubmit = () => {
    if (!name.trim() || conditions.length === 0 || actions.length === 0) return;

    const rule = createRule({
      name: name.trim(),
      description: `Custom rule: ${name.trim()}`,
      enabled: true,
      conditions,
      conditionLogic: logic,
      actions,
      priority: 50,
      source: 'user',
    });

    onSubmit(rule);
  };

  return (
    <div className="p-5">
      <div className="space-y-4">
        {/* Rule Name */}
        <div>
          <label className="text-xs font-medium text-gray-700">Rule Name</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g., Auto-archive GitHub notifications"
          />
        </div>

        {/* Conditions */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-gray-700">When</label>
            <div className="flex items-center gap-2">
              <select
                value={logic}
                onChange={e => setLogic(e.target.value as 'all' | 'any')}
                className="text-xs border border-gray-200 rounded px-1 py-0.5"
              >
                <option value="all">ALL match</option>
                <option value="any">ANY match</option>
              </select>
              <button onClick={addCondition} className="text-xs text-blue-600 hover:text-blue-700">+ Add</button>
            </div>
          </div>
          <div className="space-y-2">
            {conditions.map((condition, i) => (
              <div key={i} className="flex items-center gap-2">
                <select
                  value={condition.field}
                  onChange={e => updateCondition(i, {field: e.target.value as RuleConditionField})}
                  className="text-xs border border-gray-200 rounded px-2 py-1.5"
                >
                  {Object.entries(FIELD_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
                <select
                  value={condition.operator}
                  onChange={e => updateCondition(i, {operator: e.target.value as RuleConditionOperator})}
                  className="text-xs border border-gray-200 rounded px-2 py-1.5"
                >
                  {Object.entries(OPERATOR_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
                <input
                  value={condition.value}
                  onChange={e => updateCondition(i, {value: e.target.value})}
                  className="flex-1 text-xs border border-gray-200 rounded px-2 py-1.5"
                  placeholder="value..."
                />
                {conditions.length > 1 && (
                  <button onClick={() => removeCondition(i)} className="text-gray-400 hover:text-red-500 text-xs">✕</button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-gray-700">Then</label>
            <button onClick={addAction} className="text-xs text-blue-600 hover:text-blue-700">+ Add</button>
          </div>
          <div className="space-y-2">
            {actions.map((action, i) => (
              <div key={i} className="flex items-center gap-2">
                <select
                  value={action.type}
                  onChange={e => updateAction(i, {type: e.target.value as RuleActionType})}
                  className="text-xs border border-gray-200 rounded px-2 py-1.5"
                >
                  {Object.entries(ACTION_LABELS).map(([key, {label}]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
                {ACTION_LABELS[action.type]?.needsValue && (
                  <input
                    value={action.value || ''}
                    onChange={e => updateAction(i, {value: e.target.value})}
                    className="flex-1 text-xs border border-gray-200 rounded px-2 py-1.5"
                    placeholder="value..."
                  />
                )}
                {actions.length > 1 && (
                  <button onClick={() => removeAction(i)} className="text-gray-400 hover:text-red-500 text-xs">✕</button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Submit */}
        <div className="flex items-center justify-end gap-2 pt-2">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || conditions.every(c => !c.value) || actions.every(a => ACTION_LABELS[a.type]?.needsValue && !a.value)}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            Create Rule
          </button>
        </div>
      </div>
    </div>
  );
}

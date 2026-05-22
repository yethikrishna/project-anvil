'use client';

/**
 * AI Feature Configuration Panel
 *
 * Central settings for AI features in both Docs and Mail.
 * Users can toggle features on/off, adjust settings, and view stats.
 */

import {useState, useCallback, useEffect} from 'react';

// ── Types ──

export interface AIFeatureConfig {
  // Docs features
  docsRewrite: boolean;
  docsSlashCommands: boolean;
  docsResearch: boolean;
  docsInlineSuggestions: boolean;
  docsAutoTitleSummary: boolean;
  docsTranslation: boolean;
  docsSmartTemplates: boolean;
  docsGrammarCheck: boolean;
  docsWritingCoach: boolean;
  docsContextMenu: boolean;

  // Mail features
  mailCategories: boolean;
  mailThreadSummary: boolean;
  mailAICompose: boolean;
  mailDigest: boolean;
  mailSmartReply: boolean;
  mailSemanticSearch: boolean;
  mailSmartFilters: boolean;
  mailPriorityInbox: boolean;
  mailFollowUpDetection: boolean;
  mailSmartRules: boolean;

  // Global settings
  aiProvider: 'local' | 'openai' | 'ollama';
  autoApplyRules: boolean;
  suggestionDelay: number; // ms
  maxSuggestionsPerDay: number;
}

export const DEFAULT_CONFIG: AIFeatureConfig = {
  docsRewrite: true,
  docsSlashCommands: true,
  docsResearch: true,
  docsInlineSuggestions: true,
  docsAutoTitleSummary: true,
  docsTranslation: true,
  docsSmartTemplates: true,
  docsGrammarCheck: true,
  docsWritingCoach: true,
  docsContextMenu: true,

  mailCategories: true,
  mailThreadSummary: true,
  mailAICompose: true,
  mailDigest: true,
  mailSmartReply: true,
  mailSemanticSearch: true,
  mailSmartFilters: true,
  mailPriorityInbox: true,
  mailFollowUpDetection: true,
  mailSmartRules: true,

  aiProvider: 'local',
  autoApplyRules: false,
  suggestionDelay: 2000,
  maxSuggestionsPerDay: 50,
};

// ── Storage ──

const CONFIG_KEY = 'anvil-ai-config';

export function loadAIConfig(): AIFeatureConfig {
  try {
    const stored = localStorage.getItem(CONFIG_KEY);
    if (stored) {
      return {...DEFAULT_CONFIG, ...JSON.parse(stored)};
    }
  } catch {}
  return {...DEFAULT_CONFIG};
}

export function saveAIConfig(config: AIFeatureConfig): void {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch {}
}

// ── Hook ──

export function useAIConfig() {
  const [config, setConfig] = useState<AIFeatureConfig>(loadAIConfig);

  const updateConfig = useCallback((updates: Partial<AIFeatureConfig>) => {
    setConfig(prev => {
      const next = {...prev, ...updates};
      saveAIConfig(next);
      return next;
    });
  }, []);

  const resetConfig = useCallback(() => {
    setConfig({...DEFAULT_CONFIG});
    saveAIConfig(DEFAULT_CONFIG);
  }, []);

  const isFeatureEnabled = useCallback((feature: keyof AIFeatureConfig): boolean => {
    return config[feature] as boolean;
  }, [config]);

  return {config, updateConfig, resetConfig, isFeatureEnabled};
}

// ── Component ──

interface AIFeaturePanelProps {
  onClose: () => void;
}

export function AIFeaturePanel({onClose}: AIFeaturePanelProps) {
  const {config, updateConfig, resetConfig} = useAIConfig();

  type FeatureToggle = {
    key: keyof AIFeatureConfig;
    label: string;
    description: string;
    icon: string;
  };

  const docsFeatures: FeatureToggle[] = [
    {key: 'docsRewrite', label: 'AI Rewrite', description: 'Select text → rewrite with AI', icon: '✨'},
    {key: 'docsSlashCommands', label: '/ai Commands', description: 'Slash commands for draft, research', icon: '🤖'},
    {key: 'docsResearch', label: 'Research', description: 'Query workspace with citations', icon: '🔍'},
    {key: 'docsInlineSuggestions', label: 'Inline Suggestions', description: 'Grayed text suggestions as you type', icon: '💬'},
    {key: 'docsAutoTitleSummary', label: 'Auto Title/Summary', description: 'Auto-generate on save', icon: '📋'},
    {key: 'docsTranslation', label: 'Translation', description: '30+ languages with streaming', icon: '🌐'},
    {key: 'docsSmartTemplates', label: 'Smart Templates', description: 'AI-generated document templates', icon: '📄'},
    {key: 'docsGrammarCheck', label: 'Grammar Check', description: 'Real-time grammar and style', icon: '✅'},
    {key: 'docsWritingCoach', label: 'Writing Coach', description: 'Wordiness, passive voice, jargon', icon: '🏋️'},
    {key: 'docsContextMenu', label: 'Context Menu', description: 'Right-click AI actions', icon: '👆'},
  ];

  const mailFeatures: FeatureToggle[] = [
    {key: 'mailCategories', label: 'Inbox Categories', description: 'Primary, Updates, Action Needed, FYI', icon: '📂'},
    {key: 'mailThreadSummary', label: 'Thread Summary', description: 'AI summary at top of each thread', icon: '📝'},
    {key: 'mailAICompose', label: 'AI Compose', description: 'Stream compose with style matching', icon: '✍️'},
    {key: 'mailDigest', label: 'Daily Digest', description: 'Summarize all unread mail', icon: '📰'},
    {key: 'mailSmartReply', label: 'Smart Replies', description: '1-click contextual replies', icon: '💬'},
    {key: 'mailSemanticSearch', label: 'Semantic Search', description: 'AI-powered search over email body', icon: '🔎'},
    {key: 'mailSmartFilters', label: 'Smart Filters', description: 'AI-generated filter rules', icon: '⚙️'},
    {key: 'mailPriorityInbox', label: 'Priority Inbox', description: 'Multi-signal priority scoring', icon: '🔥'},
    {key: 'mailFollowUpDetection', label: 'Follow-up Detection', description: 'Detect commitments and deadlines', icon: '📌'},
    {key: 'mailSmartRules', label: 'Smart Rules', description: 'Auto-generate rules from behavior', icon: '📊'},
  ];

  const ToggleRow = ({feature}: {feature: FeatureToggle}) => (
    <div className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-gray-50 transition-colors">
      <span className="text-lg w-6 text-center">{feature.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-800">{feature.label}</div>
        <div className="text-[11px] text-gray-500">{feature.description}</div>
      </div>
      <button
        onClick={() => updateConfig({[feature.key]: !config[feature.key]})}
        className={`relative w-10 h-5 rounded-full transition-colors ${
          config[feature.key] ? 'bg-indigo-500' : 'bg-gray-300'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
            config[feature.key] ? 'translate-x-5' : ''
          }`}
        />
      </button>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">AI Features</h2>
            <p className="text-sm text-gray-500">Toggle and configure AI features</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={resetConfig}
              className="px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              Reset to Defaults
            </button>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Global Settings */}
          <div>
            <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wider mb-2">Settings</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between py-2 px-3">
                <span className="text-sm text-gray-700">Auto-apply smart rules</span>
                <button
                  onClick={() => updateConfig({autoApplyRules: !config.autoApplyRules})}
                  className={`relative w-10 h-5 rounded-full transition-colors ${config.autoApplyRules ? 'bg-indigo-500' : 'bg-gray-300'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${config.autoApplyRules ? 'translate-x-5' : ''}`} />
                </button>
              </div>
              <div className="flex items-center justify-between py-2 px-3">
                <span className="text-sm text-gray-700">Suggestion delay</span>
                <select
                  value={config.suggestionDelay}
                  onChange={e => updateConfig({suggestionDelay: Number(e.target.value)})}
                  className="text-sm border border-gray-200 rounded-lg px-2 py-1"
                >
                  <option value={1000}>1 second</option>
                  <option value={2000}>2 seconds</option>
                  <option value={3000}>3 seconds</option>
                  <option value={5000}>5 seconds</option>
                </select>
              </div>
            </div>
          </div>

          {/* Docs Features */}
          <div>
            <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wider mb-2">📄 Docs AI</h3>
            <div className="space-y-0.5">
              {docsFeatures.map(f => <ToggleRow key={f.key} feature={f} />)}
            </div>
          </div>

          {/* Mail Features */}
          <div>
            <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wider mb-2">📧 Mail AI</h3>
            <div className="space-y-0.5">
              {mailFeatures.map(f => <ToggleRow key={f.key} feature={f} />)}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <p className="text-xs text-gray-400 text-center">
            All AI features run locally. No data is sent to external servers unless you configure an OpenAI provider.
          </p>
        </div>
      </div>
    </div>
  );
}

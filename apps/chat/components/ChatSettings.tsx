/**
 * ChatSettings — preferences panel for AI behavior.
 *
 * Lets users configure:
 * - AI model selection
 * - Voice preferences (TTS voice, speed)
 * - Communication style
 * - Approval requirements
 * - Context retention
 */

'use client';

import { useState, useEffect } from 'react';
import { cn } from '@anvil/ui';

interface ChatSettings {
  defaultModel: string;
  voiceOutput: boolean;
  voiceOutputVoice: string;
  voiceOutputSpeed: number;
  voiceInputLanguage: string;
  communicationStyle: 'concise' | 'detailed' | 'technical' | 'casual';
  emailTone: 'professional' | 'friendly' | 'casual' | 'formal';
  autoApproveLowRisk: boolean;
  requireApprovalForEmail: boolean;
  requireApprovalForCalendar: boolean;
  contextRetentionDays: number;
}

const DEFAULT_SETTINGS: ChatSettings = {
  defaultModel: 'gpt-4o',
  voiceOutput: false,
  voiceOutputVoice: 'nova',
  voiceOutputSpeed: 1.0,
  voiceInputLanguage: 'en',
  communicationStyle: 'concise',
  emailTone: 'professional',
  autoApproveLowRisk: true,
  requireApprovalForEmail: true,
  requireApprovalForCalendar: true,
  contextRetentionDays: 90,
};

const VOICES = [
  { id: 'alloy', label: 'Alloy', desc: 'Balanced, neutral' },
  { id: 'echo', label: 'Echo', desc: 'Warm, conversational' },
  { id: 'fable', label: 'Fable', desc: 'Expressive, storytelling' },
  { id: 'onyx', label: 'Onyx', desc: 'Deep, authoritative' },
  { id: 'nova', label: 'Nova', desc: 'Friendly, clear' },
  { id: 'shimmer', label: 'Shimmer', desc: 'Soft, melodic' },
];

const SETTINGS_KEY = 'anvil-chat:settings';

interface Props {
  onClose: () => void;
  onSave: (settings: ChatSettings) => void;
}

export default function ChatSettingsPanel({ onClose, onSave }: Props) {
  const [settings, setSettings] = useState<ChatSettings>(DEFAULT_SETTINGS);
  const [activeTab, setActiveTab] = useState<'general' | 'voice' | 'behavior' | 'privacy'>('general');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SETTINGS_KEY);
      if (stored) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(stored) });
    } catch {}
  }, []);

  const update = (key: keyof ChatSettings, value: unknown) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
    onSave(updated);
  };

  const tabs = [
    { id: 'general' as const, label: 'General', icon: '⚙️' },
    { id: 'voice' as const, label: 'Voice', icon: '🔊' },
    { id: 'behavior' as const, label: 'Behavior', icon: '🧠' },
    { id: 'privacy' as const, label: 'Privacy', icon: '🔒' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="font-semibold text-sm">Chat Settings</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex-1 px-3 py-2 text-xs font-medium transition-colors',
                activeTab === tab.id
                  ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                  : 'text-gray-500 hover:text-gray-700',
              )}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-4 max-h-96 overflow-y-auto space-y-4">
          {activeTab === 'general' && (
            <>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">
                  Communication Style
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(['concise', 'detailed', 'technical', 'casual'] as const).map(style => (
                    <button
                      key={style}
                      onClick={() => update('communicationStyle', style)}
                      className={cn(
                        'px-3 py-2 rounded-lg text-xs font-medium transition-colors border',
                        settings.communicationStyle === style
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                          : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800',
                      )}
                    >
                      {style.charAt(0).toUpperCase() + style.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">
                  Email Tone
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(['professional', 'friendly', 'casual', 'formal'] as const).map(tone => (
                    <button
                      key={tone}
                      onClick={() => update('emailTone', tone)}
                      className={cn(
                        'px-3 py-2 rounded-lg text-xs font-medium transition-colors border',
                        settings.emailTone === tone
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                          : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800',
                      )}
                    >
                      {tone.charAt(0).toUpperCase() + tone.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {activeTab === 'voice' && (
            <>
              <div>
                <label className="flex items-center gap-2 text-xs font-medium text-gray-600 dark:text-gray-400">
                  <input
                    type="checkbox"
                    checked={settings.voiceOutput}
                    onChange={(e) => update('voiceOutput', e.target.checked)}
                    className="rounded"
                  />
                  Auto-read AI responses aloud
                </label>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-2">
                  TTS Voice
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {VOICES.map(voice => (
                    <button
                      key={voice.id}
                      onClick={() => update('voiceOutputVoice', voice.id)}
                      className={cn(
                        'px-3 py-2 rounded-lg text-left transition-colors border',
                        settings.voiceOutputVoice === voice.id
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                          : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800',
                      )}
                    >
                      <div className="text-xs font-medium">{voice.label}</div>
                      <div className="text-[10px] text-gray-400">{voice.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">
                  Voice Speed: {settings.voiceOutputSpeed}x
                </label>
                <input
                  type="range"
                  min="0.75"
                  max="2.0"
                  step="0.25"
                  value={settings.voiceOutputSpeed}
                  onChange={(e) => update('voiceOutputSpeed', Number(e.target.value))}
                  className="w-full"
                />
              </div>
            </>
          )}

          {activeTab === 'behavior' && (
            <>
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={settings.autoApproveLowRisk}
                    onChange={(e) => update('autoApproveLowRisk', e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-gray-700 dark:text-gray-300">
                    Auto-approve low-risk actions (file search, calendar check)
                  </span>
                </label>

                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={settings.requireApprovalForEmail}
                    onChange={(e) => update('requireApprovalForEmail', e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-gray-700 dark:text-gray-300">
                    Require approval before sending emails
                  </span>
                </label>

                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={settings.requireApprovalForCalendar}
                    onChange={(e) => update('requireApprovalForCalendar', e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-gray-700 dark:text-gray-300">
                    Require approval before creating calendar events
                  </span>
                </label>
              </div>
            </>
          )}

          {activeTab === 'privacy' && (
            <>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">
                  Context Retention
                </label>
                <select
                  value={settings.contextRetentionDays}
                  onChange={(e) => update('contextRetentionDays', Number(e.target.value))}
                  className="w-full text-xs px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
                >
                  <option value={7}>7 days</option>
                  <option value={30}>30 days</option>
                  <option value={90}>90 days</option>
                  <option value={365}>1 year</option>
                </select>
              </div>

              <p className="text-[10px] text-gray-400">
                Conversation data is stored locally in your browser.
                No data is sent to external servers except for AI processing.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export { type ChatSettings, SETTINGS_KEY, DEFAULT_SETTINGS };

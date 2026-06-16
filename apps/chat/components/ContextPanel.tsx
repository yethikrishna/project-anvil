/**
 * ContextPanel — visualizes what the AI knows about the user.
 *
 * Shows the accumulated context for the current conversation:
 * - Referenced files (with quick-open actions)
 * - People mentioned (with email quick-action)
 * - Topics detected
 * - User preferences learned
 * - Recent actions taken
 * - User patterns across sessions
 *
 * This makes the AI's "memory" visible and auditable, which
 * builds trust and lets the user correct misunderstandings.
 */

'use client';

import { useState } from 'react';
import { cn } from '@anvil/ui';
import type { ConversationContext } from '@/lib/types';
import type { UserPattern } from '@/lib/context-manager';

interface Props {
  context: ConversationContext;
  patterns: UserPattern | null;
  onAction: (text: string) => void;
  onClose: () => void;
}

const TOOL_ICONS: Record<string, string> = {
  email_search: '📧',
  email_send: '📤',
  email_read_thread: '📨',
  email_save_draft: '✏️',
  file_search: '🔍',
  file_read: '📄',
  file_share: '🔗',
  document_write: '📝',
  calendar_create_event: '📅',
  calendar_check_availability: '🗓',
  web_search: '🌐',
};

function Section({ title, icon, children, count }: {
  title: string;
  icon: string;
  children: React.ReactNode;
  count?: number;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="mb-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left mb-2"
      >
        <span className="text-sm">{icon}</span>
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
          {title}
        </span>
        {count !== undefined && count > 0 && (
          <span className="ml-auto text-[10px] text-gray-400 bg-gray-100 dark:bg-gray-800 rounded-full px-1.5 py-0.5">
            {count}
          </span>
        )}
        <span className={cn(
          'text-gray-400 text-xs ml-auto transition-transform',
          !expanded && '-rotate-90',
        )}>
          ▾
        </span>
      </button>
      {expanded && children}
    </div>
  );
}

export default function ContextPanel({ context, patterns, onAction, onClose }: Props) {
  const recentActions = context.actions.slice(-8).reverse();

  return (
    <div className="w-72 border-l border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="h-11 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm">🧠</span>
          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">AI Memory</span>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xs transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">

        {/* Files */}
        {context.files.length > 0 && (
          <Section title="Files" icon="📁" count={context.files.length}>
            <div className="space-y-1">
              {context.files.slice(-6).reverse().map((file, i) => (
                <button
                  key={i}
                  onClick={() => onAction(`Read the file "${file.name}"`)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-left group transition-colors"
                >
                  <span className="text-sm shrink-0">
                    {file.type === 'document' ? '📄' :
                     file.type === 'spreadsheet' ? '📊' :
                     file.type === 'presentation' ? '📊' :
                     file.type === 'image' ? '🖼' : '📁'}
                  </span>
                  <span className="text-xs text-gray-700 dark:text-gray-300 truncate">{file.name}</span>
                  <span className="ml-auto text-[10px] text-blue-500 opacity-0 group-hover:opacity-100 shrink-0">
                    Open →
                  </span>
                </button>
              ))}
            </div>
          </Section>
        )}

        {/* People */}
        {context.people.length > 0 && (
          <Section title="People" icon="👥" count={context.people.length}>
            <div className="flex flex-wrap gap-1">
              {context.people.slice(-8).map((person, i) => (
                <button
                  key={i}
                  onClick={() => onAction(`Email ${person}`)}
                  className="text-xs px-2 py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                  title={`Email ${person}`}
                >
                  {person}
                </button>
              ))}
            </div>
          </Section>
        )}

        {/* Topics */}
        {context.topics.length > 0 && (
          <Section title="Topics" icon="🏷" count={context.topics.length}>
            <div className="flex flex-wrap gap-1">
              {context.topics.slice(-10).map((topic, i) => (
                <span
                  key={i}
                  className="text-xs px-2 py-1 rounded-full bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800"
                >
                  {topic}
                </span>
              ))}
            </div>
          </Section>
        )}

        {/* Preferences */}
        {context.preferences.length > 0 && (
          <Section title="Preferences Learned" icon="⚙️" count={context.preferences.length}>
            <div className="space-y-1">
              {context.preferences.slice(-6).map((pref, i) => (
                <div
                  key={i}
                  className="text-xs text-gray-600 dark:text-gray-400 flex items-start gap-1.5 px-1"
                >
                  <span className="text-green-500 shrink-0 mt-0.5">✓</span>
                  <span>{pref}</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Recent Actions */}
        {recentActions.length > 0 && (
          <Section title="Recent Actions" icon="⚡">
            <div className="space-y-1">
              {recentActions.map((action, i) => {
                const icon = TOOL_ICONS[action.tool] ?? '🔧';
                const timeAgo = getTimeAgo(action.timestamp);
                return (
                  <div
                    key={i}
                    className="flex items-center gap-2 px-2 py-1 rounded"
                  >
                    <span className="text-sm shrink-0">{icon}</span>
                    <div className="min-w-0">
                      <span className="text-xs text-gray-600 dark:text-gray-400 truncate block">
                        {action.action.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <span className={cn(
                      'ml-auto text-[10px] shrink-0',
                      action.success ? 'text-green-500' : 'text-red-500',
                    )}>
                      {timeAgo}
                    </span>
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {/* Learned Patterns */}
        {patterns && (
          <Section title="Learned Patterns" icon="📈">
            <div className="space-y-2 text-xs text-gray-600 dark:text-gray-400">
              {patterns.frequentContacts.length > 0 && (
                <div>
                  <span className="font-medium text-gray-700 dark:text-gray-300">Top contacts: </span>
                  {patterns.frequentContacts.slice(0, 3).map(c => c.name).join(', ')}
                </div>
              )}
              {patterns.interests.length > 0 && (
                <div>
                  <span className="font-medium text-gray-700 dark:text-gray-300">Interests: </span>
                  {patterns.interests.slice(0, 4).join(', ')}
                </div>
              )}
              {patterns.activeHours.length > 0 && (
                <div>
                  <span className="font-medium text-gray-700 dark:text-gray-300">Active hours: </span>
                  {patterns.activeHours.slice(0, 3).map(h => `${h}:00`).join(', ')}
                </div>
              )}
              <div>
                <span className="font-medium text-gray-700 dark:text-gray-300">Style: </span>
                {patterns.communicationStyle} · {patterns.emailTone}
              </div>
            </div>
          </Section>
        )}

        {/* Empty state */}
        {context.files.length === 0 &&
         context.people.length === 0 &&
         context.topics.length === 0 &&
         context.preferences.length === 0 &&
         recentActions.length === 0 && (
          <div className="text-center py-8 text-gray-400 dark:text-gray-600">
            <div className="text-3xl mb-2">🧠</div>
            <div className="text-xs">
              As you chat, I'll remember files, people, topics, and your preferences here.
            </div>
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="border-t border-gray-200 dark:border-gray-800 p-3 shrink-0">
        <button
          onClick={() => onAction('What do you know about me from our conversations?')}
          className="w-full text-xs text-center text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors py-1"
        >
          Ask what I remember →
        </button>
      </div>
    </div>
  );
}

function getTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return 'now';
  if (diff < 3600_000) return `${Math.round(diff / 60_000)}m`;
  if (diff < 86400_000) return `${Math.round(diff / 3600_000)}h`;
  return `${Math.round(diff / 86400_000)}d`;
}

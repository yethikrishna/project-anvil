/**
 * WelcomeScreen — premium empty state for new conversations.
 *
 * Features:
 * - Animated gradient background
 * - Time-based greeting
 * - Suggested prompts with smart context (day of week, time)
 * - Recent conversations quick access
 * - Keyboard shortcut hints
 */

'use client';

import { useMemo } from 'react';
import { cn } from '@anvil/ui';
import type { Conversation } from '@/lib/types';
import CommandCenterDashboard from './CommandCenterDashboard';
import QuickActionsBar from './QuickActionsBar';

interface Props {
  onSend: (text: string) => void;
  onShowWeeklySummary: () => void;
  onShowScheduler?: () => void;
  onOpenTriage?: () => void;
  onOpenTasks?: () => void;
  recentConversations: Conversation[];
}

function getGreeting(): { text: string; emoji: string } {
  const hour = new Date().getHours();
  const day = new Date().getDay(); // 0=Sun, 6=Sat
  const isWeekend = day === 0 || day === 6;

  if (hour < 6) return { text: 'Burning the midnight oil?', emoji: '🌙' };
  if (hour < 9) return { text: isWeekend ? 'Lazy morning?' : 'Ready for the day?', emoji: '🌅' };
  if (hour < 12) return { text: 'Good morning', emoji: '☀️' };
  if (hour < 14) return { text: 'Lunch break?', emoji: '🍽️' };
  if (hour < 17) return { text: 'Good afternoon', emoji: '🌤️' };
  if (hour < 19) return { text: 'Wrapping up?', emoji: '🌇' };
  if (hour < 21) return { text: 'Good evening', emoji: '🌆' };
  return { text: 'Working late?', emoji: '🌙' };
}

interface SuggestedPrompt {
  icon: string;
  title: string;
  description: string;
  prompt: string;
  special?: 'weekly_summary' | 'schedule';
  accent: string;
}

function getSuggestedPrompts(): SuggestedPrompt[] {
  const day = new Date().getDay();
  const isMonday = day === 1;
  const isFriday = day === 5;

  const prompts: SuggestedPrompt[] = [
    {
      icon: '⚡',
      title: 'Attention scan',
      description: 'Priority email & calendar digest',
      prompt: 'What needs my attention right now?',
      accent: 'from-amber-500 to-orange-500',
    },
    {
      icon: '✉️',
      title: 'Draft reply',
      description: 'AI-powered email response',
      prompt: 'Read my most recent unread email thread and draft a professional reply',
      accent: 'from-blue-500 to-cyan-500',
    },
    {
      icon: '📄',
      title: 'Find a file',
      description: 'Search Drive instantly',
      prompt: 'Help me find a file on Drive',
      accent: 'from-green-500 to-emerald-500',
    },
    {
      icon: '📅',
      title: 'Schedule meeting',
      description: 'Smart calendar scheduling',
      prompt: '',
      special: 'schedule',
      accent: 'from-purple-500 to-violet-500',
    },
    {
      icon: '📊',
      title: isMonday ? 'Weekly plan' : isFriday ? 'Week in review' : 'Weekly summary',
      description: 'Activity across all apps',
      prompt: 'Give me a comprehensive weekly summary across Mail, Calendar, and Drive',
      special: 'weekly_summary',
      accent: 'from-indigo-500 to-blue-500',
    },
    {
      icon: '🔍',
      title: 'Search web',
      description: 'Look up anything online',
      prompt: 'Search the web for ',
      accent: 'from-pink-500 to-rose-500',
    },
  ];

  return prompts;
}

export default function WelcomeScreen({ onSend, onShowWeeklySummary, onShowScheduler, onOpenTriage, onOpenTasks, recentConversations }: Props) {
  const greeting = useMemo(getGreeting, []);
  const prompts = useMemo(getSuggestedPrompts, []);

  return (
    <div className="flex flex-col items-center justify-center h-full px-4 py-8 overflow-y-auto">
      {/* Hero */}
      <div className="relative mb-8">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center text-white text-2xl font-bold shadow-xl shadow-indigo-500/20">
          A
        </div>
        <div className="absolute -inset-2 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 rounded-3xl blur-xl -z-10" />
      </div>

      <h2 className="text-xl font-semibold mb-1 text-gray-900 dark:text-gray-100">
        {greeting.emoji} {greeting.text}
      </h2>
      <p className="text-gray-500 dark:text-gray-400 text-sm text-center max-w-sm mb-6 leading-relaxed">
        I can search your emails, find files, schedule meetings,
        draft replies, and chain actions across all your apps.
      </p>

      {/* Live quick-actions bar — inbox, next meeting, recent files, pending replies */}
      <div className="w-full max-w-lg mb-5">
        <QuickActionsBar onAction={onSend} />
      </div>

      {/* Live command center dashboard */}
      <div className="w-full max-w-sm mb-6">
        <CommandCenterDashboard
          onAction={(prompt) => {
            if (prompt === '__weekly_summary__') { onShowWeeklySummary(); return; }
            if (prompt === '__schedule__') { onShowScheduler?.(); return; }
            onSend(prompt);
          }}
          onOpenTriage={() => onOpenTriage?.()}
          onOpenTasks={() => onOpenTasks?.()}
        />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-w-lg w-full mb-8">
        {prompts.map(item => (
          <button
            key={item.title}
            onClick={() => {
              if (item.special === 'weekly_summary') {
                onShowWeeklySummary();
              } else if (item.special === 'schedule') {
                onShowScheduler?.();
              } else {
                onSend(item.prompt);
              }
            }}
            className="group text-left p-3 rounded-xl border border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-sm transition-all"
          >
            <div className={cn(
              'w-7 h-7 rounded-lg bg-gradient-to-br flex items-center justify-center text-sm mb-2',
              item.accent,
              'group-hover:scale-110 transition-transform',
            )}>
              <span className="drop-shadow-sm">{item.icon}</span>
            </div>
            <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">{item.title}</p>
            <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">{item.description}</p>
          </button>
        ))}
      </div>

      {/* Recent conversations */}
      {recentConversations.length > 0 && (
        <div className="w-full max-w-lg">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Recent conversations
          </p>
          <div className="space-y-1">
            {recentConversations.slice(0, 3).map(conv => (
              <button
                key={conv.id}
                onClick={() => onSend(`Continue: ${conv.title}`)}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group"
              >
                <p className="text-xs text-gray-700 dark:text-gray-300 truncate group-hover:text-gray-900 dark:group-hover:text-gray-100">
                  {conv.title}
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {conv.messages.length} messages · {new Date(conv.updatedAt).toLocaleDateString()}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Keyboard hints */}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-[10px] text-gray-400">
        <span>
          <kbd className="px-1.5 py-0.5 border border-gray-200 dark:border-gray-700 rounded text-[9px] font-mono">⌘K</kbd> Command palette
        </span>
        <span>
          <kbd className="px-1.5 py-0.5 border border-gray-200 dark:border-gray-700 rounded text-[9px] font-mono">⌘E</kbd> Attention scan
        </span>
        <span>
          <kbd className="px-1.5 py-0.5 border border-gray-200 dark:border-gray-700 rounded text-[9px] font-mono">/</kbd> Slash commands
        </span>
        <span>
          <kbd className="px-1.5 py-0.5 border border-gray-200 dark:border-gray-700 rounded text-[9px] font-mono">?</kbd> Keyboard shortcuts
        </span>
      </div>
    </div>
  );
}

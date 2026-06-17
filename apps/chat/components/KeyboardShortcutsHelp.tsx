/**
 * KeyboardShortcutsHelp — comprehensive keyboard shortcuts overlay.
 *
 * Triggered by pressing '?' when not typing in an input.
 * Shows all available shortcuts grouped by category.
 */

'use client';

import { useEffect } from 'react';
import { cn } from '@anvil/ui';

interface Shortcut {
  keys: string[];
  description: string;
}

interface ShortcutGroup {
  title: string;
  icon: string;
  shortcuts: Shortcut[];
}

const GROUPS: ShortcutGroup[] = [
  {
    title: 'Navigation',
    icon: '🧭',
    shortcuts: [
      { keys: ['⌘', 'K'], description: 'Open command palette' },
      { keys: ['⌘', 'N'], description: 'New conversation' },
      { keys: ['⌘', 'F'], description: 'Search conversations' },
      { keys: ['⌘', '⇧', 'M'], description: 'Memory search' },
      { keys: ['Esc'], description: 'Close any panel' },
    ],
  },
  {
    title: 'Chat',
    icon: '💬',
    shortcuts: [
      { keys: ['Enter'], description: 'Send message' },
      { keys: ['⇧', 'Enter'], description: 'New line' },
      { keys: ['↑'], description: 'Edit last message (when input empty)' },
      { keys: ['⌘', 'E'], description: 'Toggle attention panel' },
      { keys: ['⌘', 'P'], description: 'Toggle pinned messages' },
    ],
  },
  {
    title: 'AI Actions',
    icon: '⚡',
    shortcuts: [
      { keys: ['/'], description: 'Open slash commands' },
      { keys: ['/chain'], description: 'Multi-step autonomous chain' },
      { keys: ['/summary'], description: 'Weekly summary' },
      { keys: ['/schedule'], description: 'Schedule a meeting' },
      { keys: ['/draft'], description: 'Draft email reply' },
      { keys: ['/triage'], description: 'Smart inbox triage' },
    ],
  },
  {
    title: 'Personas',
    icon: '🎭',
    shortcuts: [
      { keys: ['Alt', '1'], description: 'Executive Assistant' },
      { keys: ['Alt', '2'], description: 'Research Analyst' },
      { keys: ['Alt', '3'], description: 'Writing Coach' },
      { keys: ['Alt', '4'], description: 'Technical Expert' },
      { keys: ['Alt', '5'], description: 'Brainstorm Partner' },
    ],
  },
  {
    title: 'Messages',
    icon: '📌',
    shortcuts: [
      { keys: ['⌘', '⇧', 'E'], description: 'Export conversation' },
      { keys: ['⌘', '⇧', 'N'], description: 'New conversation (alt)' },
    ],
  },
];

interface Props {
  onClose: () => void;
}

function KeyBadge({ label }: { label: string }) {
  return (
    <kbd className={cn(
      'inline-flex items-center justify-center',
      'min-w-[1.5rem] h-6 px-1.5 rounded-md',
      'bg-gray-100 dark:bg-gray-700',
      'border border-gray-300 dark:border-gray-600',
      'text-[10px] font-mono font-semibold',
      'text-gray-700 dark:text-gray-300',
      'shadow-sm',
    )}>
      {label}
    </kbd>
  );
}

export default function KeyboardShortcutsHelp({ onClose }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === '?') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={cn(
          'w-full max-w-2xl max-h-[80vh] overflow-y-auto',
          'bg-white dark:bg-gray-900 rounded-2xl shadow-2xl',
          'm-4',
        )}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Keyboard Shortcuts
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Press <KeyBadge label="?" /> anywhere to toggle this
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1"
          >
            ✕
          </button>
        </div>

        {/* Groups */}
        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
          {GROUPS.map(group => (
            <div key={group.title}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3 flex items-center gap-1.5">
                <span>{group.icon}</span>
                {group.title}
              </h3>
              <div className="space-y-2">
                {group.shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.description}
                    className="flex items-center justify-between gap-4"
                  >
                    <span className="text-xs text-gray-600 dark:text-gray-400 min-w-0 truncate">
                      {shortcut.description}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      {shortcut.keys.map((key, idx) => (
                        <span key={idx} className="flex items-center gap-1">
                          <KeyBadge label={key} />
                          {idx < shortcut.keys.length - 1 && (
                            <span className="text-[9px] text-gray-400">+</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 rounded-b-2xl">
          <p className="text-[11px] text-gray-400 text-center">
            ⌘ = Cmd on Mac, Ctrl on Windows/Linux · ⇧ = Shift · Alt = Option on Mac
          </p>
        </div>
      </div>
    </div>
  );
}

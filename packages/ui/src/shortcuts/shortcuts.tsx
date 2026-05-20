'use client';

/**
 * Keyboard Shortcuts System for Project Anvil.
 *
 * Features:
 * - Gmail-style shortcuts for Mail
 * - Vim-like navigation for Docs
 * - Global shortcuts: Cmd+1-6 for app switching
 * - Shortcut registration per app
 * - Shortcut help overlay (?)
 */

import {useEffect, useCallback, useRef} from 'react';

// ── Types ──

export interface ShortcutDef {
  /** Unique ID */
  id: string;
  /** Key combination (e.g., 'mod+k', 'j', 'g+i') */
  keys: string;
  /** Human-readable description */
  description: string;
  /** Category for grouping */
  category?: string;
  /** Handler */
  handler: () => void;
  /** Only active when this app is focused */
  app?: string;
}

export interface ShortcutState {
  shortcuts: ShortcutDef[];
  showHelp: boolean;
}

// ── Key Parser ──

interface ParsedKey {
  key: string;
  meta: boolean;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
}

function parseKeyCombo(combo: string): ParsedKey {
  const parts = combo.toLowerCase().split('+');
  return {
    key: parts[parts.length - 1],
    meta: parts.includes('mod') || parts.includes('meta') || parts.includes('cmd'),
    ctrl: parts.includes('ctrl'),
    shift: parts.includes('shift'),
    alt: parts.includes('alt'),
  };
}

function matchesKey(event: KeyboardEvent, parsed: ParsedKey): boolean {
  const keyMatch = event.key.toLowerCase() === parsed.key ||
    event.code.toLowerCase() === `key_${parsed.key}` ||
    event.code.toLowerCase() === `digit${parsed.key}`;

  return keyMatch
    && (parsed.meta ? (event.metaKey || event.ctrlKey) : !event.metaKey && !event.ctrlKey)
    && (parsed.ctrl ? event.ctrlKey : true)
    && (parsed.shift ? event.shiftKey : !event.shiftKey)
    && (parsed.alt ? event.altKey : !event.altKey);
}

// ── Hook ──

export function useKeyboardShortcuts(
  shortcuts: ShortcutDef[],
  options?: {activeApp?: string; enabled?: boolean}
) {
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  const enabled = options?.enabled ?? true;

  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      // Skip if typing in input fields
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return;
      }

      for (const shortcut of shortcutsRef.current) {
        // Check app filter
        if (shortcut.app && shortcut.app !== options?.activeApp) continue;

        const parsed = parseKeyCombo(shortcut.keys);

        // Handle multi-key combos (e.g., 'g+i' — press g then i)
        if (shortcut.keys.includes(' ')) {
          // Multi-key: handled via sequence
          continue;
        }

        if (matchesKey(e, parsed)) {
          e.preventDefault();
          shortcut.handler();
          return;
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled, options?.activeApp]);
}

// ── Global Shortcuts (App Switching) ──

export const GLOBAL_SHORTCUTS: {key: string; app: string; label: string}[] = [
  {key: '1', app: 'search', label: 'Search'},
  {key: '2', app: 'gmail', label: 'Mail'},
  {key: '3', app: 'drive', label: 'Drive'},
  {key: '4', app: 'docs', label: 'Docs'},
  {key: '5', app: 'youtube', label: 'Video'},
  {key: '6', app: 'maps', label: 'Maps'},
];

// ── Gmail Shortcuts ──

export const GMAIL_SHORTCUTS: {keys: string; description: string; category: string}[] = [
  {keys: 'j', description: 'Move to newer conversation', category: 'Navigation'},
  {keys: 'k', description: 'Move to older conversation', category: 'Navigation'},
  {keys: 'e', description: 'Archive', category: 'Actions'},
  {keys: 'r', description: 'Reply', category: 'Compose'},
  {keys: 'a', description: 'Reply all', category: 'Compose'},
  {keys: 'f', description: 'Forward', category: 'Compose'},
  {keys: 'c', description: 'Compose new email', category: 'Compose'},
  {keys: 's', description: 'Star message', category: 'Actions'},
  {keys: '#', description: 'Delete', category: 'Actions'},
  {keys: '!', description: 'Report spam', category: 'Actions'},
  {keys: 'u', description: 'Back to inbox', category: 'Navigation'},
  {keys: '/', description: 'Focus search', category: 'Navigation'},
  {keys: 'x', description: 'Select conversation', category: 'Selection'},
];

// ── Docs Shortcuts (Vim-like) ──

export const DOCS_SHORTCUTS: {keys: string; description: string; category: string}[] = [
  {keys: 'h', description: 'Move left', category: 'Navigation'},
  {keys: 'j', description: 'Move down', category: 'Navigation'},
  {keys: 'k', description: 'Move up', category: 'Navigation'},
  {keys: 'l', description: 'Move right', category: 'Navigation'},
  {keys: 'w', description: 'Next word', category: 'Navigation'},
  {keys: 'b', description: 'Previous word', category: 'Navigation'},
  {keys: '0', description: 'Start of line', category: 'Navigation'},
  {keys: '$', description: 'End of line', category: 'Navigation'},
  {keys: 'gg', description: 'Top of document', category: 'Navigation'},
  {keys: 'G', description: 'Bottom of document', category: 'Navigation'},
  {keys: 'dd', description: 'Delete line', category: 'Editing'},
  {keys: 'yy', description: 'Copy line', category: 'Editing'},
  {keys: 'p', description: 'Paste after cursor', category: 'Editing'},
  {keys: 'u', description: 'Undo', category: 'Editing'},
  {keys: 'ctrl+r', description: 'Redo', category: 'Editing'},
  {keys: '/', description: 'Find', category: 'Search'},
  {keys: 'n', description: 'Find next', category: 'Search'},
  {keys: 'N', description: 'Find previous', category: 'Search'},
];

// ── Shortcut Help Overlay ──

export function ShortcutHelpOverlay({
  open,
  onClose,
  shortcuts,
}: {
  open: boolean;
  onClose: () => void;
  shortcuts: {keys: string; description: string; category: string}[];
}) {
  if (!open) return null;

  const grouped = new Map<string, typeof shortcuts>();
  for (const s of shortcuts) {
    const cat = s.category ?? 'General';
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(s);
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-lg max-h-[80vh] overflow-auto p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Keyboard Shortcuts</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div className="space-y-6">
          {Array.from(grouped.entries()).map(([category, items]) => (
            <div key={category}>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{category}</h3>
              <div className="space-y-1">
                {items.map((s, i) => (
                  <div key={i} className="flex items-center justify-between py-1">
                    <span className="text-sm text-gray-700 dark:text-gray-300">{s.description}</span>
                    <div className="flex gap-1">
                      {s.keys.split('+').map((key, ki) => (
                        <kbd key={ki} className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded font-mono">
                          {key}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-gray-400 text-center mt-6">Press <kbd className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">?</kbd> to toggle this panel</p>
      </div>
    </div>
  );
}

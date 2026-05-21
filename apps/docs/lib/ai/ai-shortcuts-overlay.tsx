'use client';

/**
 * AI Keyboard Shortcuts Overlay
 *
 * Shows available AI keyboard shortcuts in a discoverable overlay.
 * Triggered by pressing '?' or via the AI toolbar button.
 */

import {useState, useEffect, useCallback} from 'react';

// ── Shortcut Definitions ──

export interface AIShortcut {
  keys: string[];
  description: string;
  category: 'editing' | 'commands' | 'navigation';
  action: string;
}

export const AI_SHORTCUTS: AIShortcut[] = [
  // Editing
  {keys: ['Mod', 'Shift', 'R'], description: 'Rewrite selection (better)', category: 'editing', action: 'rewrite-better'},
  {keys: ['Mod', 'Shift', 'S'], description: 'Make selection shorter', category: 'editing', action: 'rewrite-shorter'},
  {keys: ['Mod', 'Shift', 'F'], description: 'Make selection formal', category: 'editing', action: 'rewrite-formal'},
  {keys: ['Mod', 'Shift', 'G'], description: 'Fix grammar in selection', category: 'editing', action: 'fix-grammar'},
  {keys: ['Mod', 'Shift', 'T'], description: 'Translate selection', category: 'editing', action: 'translate'},
  {keys: ['Mod', 'Shift', 'A'], description: 'Accept AI suggestion', category: 'editing', action: 'accept-suggestion'},
  {keys: ['Escape'], description: 'Reject AI suggestion', category: 'editing', action: 'reject-suggestion'},

  // Commands
  {keys: ['/'], description: 'Open AI command menu', category: 'commands', action: 'slash-menu'},
  {keys: ['/ai', 'Space'], description: 'Trigger AI command', category: 'commands', action: 'ai-command'},
  {keys: ['/ai', 'draft'], description: 'AI draft — describe and generate', category: 'commands', action: 'ai-draft'},
  {keys: ['/ai', 'research'], description: 'AI research — query and cite', category: 'commands', action: 'ai-research'},
  {keys: ['/ai', 'translate'], description: 'AI translate document', category: 'commands', action: 'ai-translate'},
  {keys: ['/ai', 'summary'], description: 'Generate document summary', category: 'commands', action: 'ai-summary'},
  {keys: ['/ai', 'improve'], description: 'Improve entire document', category: 'commands', action: 'ai-improve'},

  // Navigation
  {keys: ['Mod', 'Shift', 'O'], description: 'Toggle document outline', category: 'navigation', action: 'toggle-outline'},
  {keys: ['Mod', 'Shift', 'P'], description: 'Toggle AI assistant panel', category: 'navigation', action: 'toggle-assistant'},
  {keys: ['Mod', 'Shift', 'H'], description: 'Toggle grammar checker', category: 'navigation', action: 'toggle-grammar'},
  {keys: ['?'], description: 'Show this shortcuts overlay', category: 'navigation', action: 'show-shortcuts'},
];

// ── Key Label Helper ──

function keyLabel(key: string): string {
  const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  const labels: Record<string, string> = {
    'Mod': isMac ? '⌘' : 'Ctrl',
    'Shift': isMac ? '⇧' : 'Shift',
    'Escape': 'Esc',
    'Space': '␣',
  };
  return labels[key] || key;
}

// ── Component ──

interface AIShortcutsOverlayProps {
  onClose: () => void;
  onAction?: (action: string) => void;
}

export function AIShortcutsOverlay({onClose, onAction}: AIShortcutsOverlayProps) {
  const [filter, setFilter] = useState('');
  const [activeCategory, setActiveCategory] = useState<'all' | 'editing' | 'commands' | 'navigation'>('all');

  const filtered = AI_SHORTCUTS.filter(s => {
    if (activeCategory !== 'all' && s.category !== activeCategory) return false;
    if (filter && !s.description.toLowerCase().includes(filter.toLowerCase()) &&
        !s.keys.some(k => k.toLowerCase().includes(filter.toLowerCase()))) return false;
    return true;
  });

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-[520px] max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-3 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">⌨️</span>
              <h3 className="font-semibold text-gray-900">AI Shortcuts</h3>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
          </div>
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="w-full mt-2 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Search shortcuts..."
            autoFocus
          />
          {/* Category tabs */}
          <div className="flex gap-1 mt-2">
            {(['all', 'editing', 'commands', 'navigation'] as const).map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
                  activeCategory === cat ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {cat === 'all' ? 'All' : cat === 'editing' ? '✏️ Editing' : cat === 'commands' ? '⚡ Commands' : '🧭 Navigation'}
              </button>
            ))}
          </div>
        </div>

        {/* Shortcuts List */}
        <div className="flex-1 overflow-auto py-2">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-400">No shortcuts match your search</div>
          ) : (
            filtered.map((shortcut, i) => (
              <div
                key={i}
                onClick={() => onAction?.(shortcut.action)}
                className="flex items-center justify-between px-5 py-2 hover:bg-gray-50 cursor-pointer group"
              >
                <span className="text-sm text-gray-700 group-hover:text-gray-900">{shortcut.description}</span>
                <div className="flex items-center gap-1">
                  {shortcut.keys.map((key, ki) => (
                    <span key={ki} className="flex items-center gap-1">
                      {ki > 0 && <span className="text-[10px] text-gray-300">+</span>}
                      <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-200 rounded text-[11px] font-mono text-gray-600">
                        {keyLabel(key)}
                      </kbd>
                    </span>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-2 border-t border-gray-200 text-center">
          <span className="text-[10px] text-gray-400">
            Press <kbd className="px-1 py-0.5 bg-gray-100 rounded text-[10px]">?</kbd> anytime to see shortcuts
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * MemoryManagerPanel — visual, editable view of AI's persistent memory.
 *
 * Shows all stored preferences/facts the AI has saved via context_memo.
 * Users can view, edit, add, and delete memories.
 * Syncs with the SQLite preferences store via /api/memory.
 *
 * This is what makes the AI feel like it genuinely knows you.
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { cn } from '@anvil/ui';

interface MemoryEntry {
  key: string;
  value: string;
  category: string;
  updatedAt?: number;
}

// Categorize keys into friendly groups
function categorizeKey(key: string): string {
  const k = key.toLowerCase();
  if (k.includes('email') || k.includes('inbox') || k.includes('draft')) return 'Email';
  if (k.includes('meet') || k.includes('calendar') || k.includes('schedule') || k.includes('event')) return 'Calendar';
  if (k.includes('tone') || k.includes('style') || k.includes('comm') || k.includes('format')) return 'Communication';
  if (k.includes('name') || k.includes('role') || k.includes('team') || k.includes('company')) return 'About You';
  if (k.includes('file') || k.includes('doc') || k.includes('drive') || k.includes('folder')) return 'Files';
  if (k.includes('pref') || k.includes('prefer')) return 'Preferences';
  return 'General';
}

const CATEGORY_ICONS: Record<string, string> = {
  Email: '📧',
  Calendar: '📅',
  Communication: '💬',
  'About You': '👤',
  Files: '📁',
  Preferences: '⚙️',
  General: '🧠',
};

function CATEGORY_COLOR(cat: string): string {
  const map: Record<string, string> = {
    Email: 'bg-blue-50 dark:bg-blue-950/30 border-blue-100 dark:border-blue-900',
    Calendar: 'bg-rose-50 dark:bg-rose-950/30 border-rose-100 dark:border-rose-900',
    Communication: 'bg-indigo-50 dark:bg-indigo-950/30 border-indigo-100 dark:border-indigo-900',
    'About You': 'bg-purple-50 dark:bg-purple-950/30 border-purple-100 dark:border-purple-900',
    Files: 'bg-yellow-50 dark:bg-yellow-950/30 border-yellow-100 dark:border-yellow-900',
    Preferences: 'bg-gray-50 dark:bg-gray-800/50 border-gray-100 dark:border-gray-800',
    General: 'bg-teal-50 dark:bg-teal-950/30 border-teal-100 dark:border-teal-900',
  };
  return map[cat] ?? map.General;
}

interface MemoryCardProps {
  entry: MemoryEntry;
  onEdit: (key: string, value: string) => void;
  onDelete: (key: string) => void;
}

function MemoryCard({ entry, onEdit, onDelete }: MemoryCardProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.value);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSave = () => {
    if (draft.trim()) {
      onEdit(entry.key, draft.trim());
    }
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') {
      setDraft(entry.value);
      setEditing(false);
    }
  };

  useEffect(() => {
    if (editing) textareaRef.current?.focus();
  }, [editing]);

  const category = entry.category;
  const icon = CATEGORY_ICONS[category] ?? '🧠';
  const colorClass = CATEGORY_COLOR(category);

  return (
    <div className={cn('rounded-xl border p-3 transition-all', colorClass)}>
      <div className="flex items-start gap-2">
        <span className="text-sm mt-0.5">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide truncate">
              {entry.key.replace(/_/g, ' ')}
            </span>
            <span className="text-[9px] text-gray-400 shrink-0">{category}</span>
          </div>

          {editing ? (
            <div className="space-y-1.5">
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={2}
                className={cn(
                  'w-full text-xs rounded-lg p-2 resize-none',
                  'bg-white dark:bg-gray-800',
                  'border border-gray-300 dark:border-gray-600',
                  'focus:outline-none focus:ring-1 focus:ring-indigo-400',
                )}
              />
              <div className="flex gap-1.5">
                <button
                  onClick={handleSave}
                  className="text-[10px] px-2 py-0.5 rounded-md bg-indigo-500 text-white hover:bg-indigo-600 transition-colors"
                >
                  Save
                </button>
                <button
                  onClick={() => { setDraft(entry.value); setEditing(false); }}
                  className="text-[10px] px-2 py-0.5 rounded-md bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed break-words">
              {entry.value}
            </p>
          )}
        </div>

        {!editing && (
          <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => setEditing(true)}
              className="text-[10px] p-1 rounded hover:bg-white/60 dark:hover:bg-gray-700/60 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              title="Edit"
            >
              ✏️
            </button>
            <button
              onClick={() => onDelete(entry.key)}
              className="text-[10px] p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/40 text-gray-400 hover:text-red-500 transition-colors"
              title="Forget this"
            >
              🗑️
            </button>
          </div>
        )}
      </div>

      {/* Hover actions row (visible on hover) */}
      {!editing && (
        <div className="flex gap-1 mt-1.5 pt-1.5 border-t border-white/30 dark:border-gray-700/30">
          <button
            onClick={() => setEditing(true)}
            className="text-[9px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            Edit
          </button>
          <span className="text-[9px] text-gray-300">·</span>
          <button
            onClick={() => onDelete(entry.key)}
            className="text-[9px] text-gray-400 hover:text-red-500 transition-colors"
          >
            Forget
          </button>
        </div>
      )}
    </div>
  );
}

interface Props {
  onClose: () => void;
  onInjectContext?: (text: string) => void;
}

export default function MemoryManagerPanel({ onClose, onInjectContext }: Props) {
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [addKey, setAddKey] = useState('');
  const [addValue, setAddValue] = useState('');
  const [addingNew, setAddingNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());

  const loadMemories = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'preferences', userId: 'default' }),
      });
      if (!res.ok) return;
      const data = await res.json() as { preferences?: Record<string, string> };
      const prefs = data.preferences ?? {};
      const loaded: MemoryEntry[] = Object.entries(prefs).map(([key, value]) => ({
        key,
        value: String(value),
        category: categorizeKey(key),
      }));
      setEntries(loaded.sort((a, b) => a.category.localeCompare(b.category)));
    } catch {
      // silent fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMemories();
  }, [loadMemories]);

  const handleEdit = useCallback(async (key: string, value: string) => {
    setSaving(true);
    try {
      await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_preference', userId: 'default', key, value }),
      });
      setEntries(prev => prev.map(e => e.key === key ? { ...e, value } : e));
    } finally {
      setSaving(false);
    }
  }, []);

  const handleDelete = useCallback(async (key: string) => {
    setSaving(true);
    try {
      await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_preference', userId: 'default', key }),
      });
      setEntries(prev => prev.filter(e => e.key !== key));
    } finally {
      setSaving(false);
    }
  }, []);

  const handleAdd = useCallback(async () => {
    if (!addKey.trim() || !addValue.trim()) return;
    setSaving(true);
    try {
      const key = addKey.trim().toLowerCase().replace(/\s+/g, '_');
      const value = addValue.trim();
      await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_preference', userId: 'default', key, value }),
      });
      setEntries(prev => [...prev, { key, value, category: categorizeKey(key) }]
        .sort((a, b) => a.category.localeCompare(b.category)));
      setAddKey('');
      setAddValue('');
      setAddingNew(false);
    } finally {
      setSaving(false);
    }
  }, [addKey, addValue]);

  const handleClearAll = useCallback(async () => {
    if (!confirm('Clear all AI memory? This cannot be undone.')) return;
    setSaving(true);
    try {
      for (const entry of entries) {
        await fetch('/api/memory', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'delete_preference', userId: 'default', key: entry.key }),
        });
      }
      setEntries([]);
    } finally {
      setSaving(false);
    }
  }, [entries]);

  // Filter
  const filtered = entries.filter(e => {
    const matchesSearch = !search || e.key.includes(search.toLowerCase()) || e.value.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = selectedCategories.size === 0 || selectedCategories.has(e.category);
    return matchesSearch && matchesCategory;
  });

  const categories = [...new Set(entries.map(e => e.category))].sort();

  const injectAll = () => {
    const summary = filtered.map(e => `${e.key.replace(/_/g, ' ')}: ${e.value}`).join('\n');
    onInjectContext?.(`[AI Memory Context]\n${summary}\n\n`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-xl max-h-[85vh] flex flex-col bg-white dark:bg-gray-900 rounded-2xl shadow-2xl m-4"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              🧠 AI Memory
              {saving && <span className="text-[10px] text-indigo-400 animate-pulse">Saving…</span>}
            </h2>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {entries.length} thing{entries.length !== 1 ? 's' : ''} remembered · Edit or delete anytime
            </p>
          </div>
          <div className="flex items-center gap-2">
            {filtered.length > 0 && onInjectContext && (
              <button
                onClick={injectAll}
                className="text-[10px] px-2.5 py-1 rounded-lg bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-800 transition-colors font-medium"
                title="Inject all memory into next message"
              >
                💉 Inject context
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1">✕</button>
          </div>
        </div>

        {/* Search + filter */}
        <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 space-y-2">
          <input
            type="text"
            placeholder="Search memory…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className={cn(
              'w-full text-xs rounded-xl px-3 py-2',
              'bg-gray-50 dark:bg-gray-800',
              'border border-gray-200 dark:border-gray-700',
              'focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400',
              'placeholder:text-gray-400',
            )}
          />
          {categories.length > 1 && (
            <div className="flex flex-wrap gap-1">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategories(prev => {
                    const next = new Set(prev);
                    if (next.has(cat)) next.delete(cat);
                    else next.add(cat);
                    return next;
                  })}
                  className={cn(
                    'text-[10px] px-2 py-0.5 rounded-full border transition-colors',
                    selectedCategories.has(cat)
                      ? 'bg-indigo-100 dark:bg-indigo-900 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300'
                      : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-300',
                  )}
                >
                  {CATEGORY_ICONS[cat]} {cat}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Memory entries */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-400 text-sm">
              Loading memory…
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="text-3xl">🧠</div>
              <p className="text-sm text-gray-500 text-center max-w-xs">
                {entries.length === 0
                  ? 'No memories yet. Chat with the AI and it will remember your preferences.'
                  : 'No memories match your search.'}
              </p>
            </div>
          ) : (
            filtered.map(entry => (
              <div key={entry.key} className="group">
                <MemoryCard
                  entry={entry}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              </div>
            ))
          )}
        </div>

        {/* Add new + footer */}
        <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-800 space-y-2">
          {addingNew ? (
            <div className="space-y-2 animate-in slide-in-from-bottom-2">
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="memory key (e.g. email_tone)"
                  value={addKey}
                  onChange={e => setAddKey(e.target.value)}
                  className={cn(
                    'text-xs rounded-lg px-2.5 py-1.5',
                    'bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700',
                    'focus:outline-none focus:ring-1 focus:ring-indigo-400',
                  )}
                />
                <input
                  type="text"
                  placeholder="value (e.g. concise)"
                  value={addValue}
                  onChange={e => setAddValue(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                  className={cn(
                    'text-xs rounded-lg px-2.5 py-1.5',
                    'bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700',
                    'focus:outline-none focus:ring-1 focus:ring-indigo-400',
                  )}
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleAdd}
                  disabled={!addKey.trim() || !addValue.trim() || saving}
                  className="text-[11px] px-3 py-1 rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-50 transition-colors"
                >
                  Add memory
                </button>
                <button
                  onClick={() => { setAddingNew(false); setAddKey(''); setAddValue(''); }}
                  className="text-[11px] px-3 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <button
                onClick={() => setAddingNew(true)}
                className="text-[11px] text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors flex items-center gap-1"
              >
                + Add memory
              </button>
              {entries.length > 0 && (
                <button
                  onClick={handleClearAll}
                  className="text-[11px] text-red-400 hover:text-red-600 transition-colors"
                >
                  Clear all
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

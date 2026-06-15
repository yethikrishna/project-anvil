'use client';

/**
 * AI Version Timeline — Document history with AI-explained changes.
 *
 * Features:
 * - Auto-snapshots every N saves (+ manual snapshots)
 * - AI-generated plain-English diff summary for each version
 * - Visual timeline with word-count delta
 * - One-click restore
 * - Side-by-side diff modal
 *
 * Uses localStorage for storage (IndexedDB upgrade path noted).
 * Powered by @anvil/ai via /api/ai.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type { Editor } from '@tiptap/react';

// ── Types ──

interface VersionSnapshot {
  id: string;
  label: string;           // auto-generated or user-set
  html: string;
  text: string;
  wordCount: number;
  charCount: number;
  timestamp: number;
  author: string;
  aiSummary?: string;      // AI-generated change description
  diffStats?: {
    wordsAdded: number;
    wordsRemoved: number;
    sectionsChanged: string[];
  };
  isManual?: boolean;      // user-triggered snapshot
}

interface AIVersionTimelineProps {
  editor: Editor;
  docId: string;
  authorName?: string;
  onClose: () => void;
}

const STORAGE_KEY_PREFIX = 'anvil:versions:';
const MAX_VERSIONS = 30;
const AUTO_SNAPSHOT_INTERVAL_SAVES = 5; // snapshot every 5 saves

// ── Helpers ──

function getKey(docId: string) {
  return `${STORAGE_KEY_PREFIX}${docId}`;
}

function loadVersions(docId: string): VersionSnapshot[] {
  try {
    const raw = localStorage.getItem(getKey(docId));
    return raw ? (JSON.parse(raw) as VersionSnapshot[]) : [];
  } catch {
    return [];
  }
}

function saveVersions(docId: string, versions: VersionSnapshot[]) {
  try {
    localStorage.setItem(getKey(docId), JSON.stringify(versions.slice(0, MAX_VERSIONS)));
  } catch {/* storage full */}
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function diffWords(oldText: string, newText: string): {added: number; removed: number} {
  const oldWords = new Set(oldText.toLowerCase().split(/\s+/));
  const newWords = new Set(newText.toLowerCase().split(/\s+/));
  let added = 0, removed = 0;
  newWords.forEach(w => { if (!oldWords.has(w)) added++; });
  oldWords.forEach(w => { if (!newWords.has(w)) removed++; });
  return { added, removed };
}

function formatTimestamp(ts: number): string {
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function renderSimpleDiff(oldHtml: string, newHtml: string): string {
  // Very simple line-based diff for display (not character-level)
  const stripTags = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const oldLines = stripTags(oldHtml).split('. ');
  const newLines = stripTags(newHtml).split('. ');

  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);

  const added = newLines.filter(l => l.length > 20 && !oldSet.has(l)).slice(0, 3);
  const removed = oldLines.filter(l => l.length > 20 && !newSet.has(l)).slice(0, 3);

  return JSON.stringify({ added, removed });
}

// ── Main Component ──

export function AIVersionTimeline({ editor, docId, authorName = 'You', onClose }: AIVersionTimelineProps) {
  const [versions, setVersions] = useState<VersionSnapshot[]>(() => loadVersions(docId));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [diffViewId, setDiffViewId] = useState<string | null>(null);
  const [savingSnapshotId, setSavingSnapshotId] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [snapshotLabel, setSnapshotLabel] = useState('');
  const [showLabelInput, setShowLabelInput] = useState(false);
  const saveCountRef = useRef(0);

  // Auto-snapshot on editor saves
  useEffect(() => {
    const handler = () => {
      saveCountRef.current++;
      if (saveCountRef.current % AUTO_SNAPSHOT_INTERVAL_SAVES === 0) {
        createSnapshot(false);
      }
    };
    window.addEventListener('anvil:doc-saved', handler);
    return () => window.removeEventListener('anvil:doc-saved', handler);
  });

  const createSnapshot = useCallback(async (isManual: boolean, label?: string) => {
    const html = editor.getHTML();
    const text = editor.getText();
    const wc = wordCount(text);

    const existing = loadVersions(docId);
    const prev = existing[0];

    const diff = prev ? diffWords(prev.text, text) : { added: wc, removed: 0 };

    const snapshot: VersionSnapshot = {
      id: `v-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      label: label || (isManual ? `Manual snapshot` : `Auto-save`),
      html,
      text,
      wordCount: wc,
      charCount: text.length,
      timestamp: Date.now(),
      author: authorName,
      diffStats: {
        wordsAdded: diff.added,
        wordsRemoved: diff.removed,
        sectionsChanged: [],
      },
      isManual,
    };

    const updated = [snapshot, ...existing].slice(0, MAX_VERSIONS);
    saveVersions(docId, updated);
    setVersions(updated);

    // Kick off AI summary in background
    fetchAISummary(snapshot, prev, updated);
  }, [editor, docId, authorName]);

  const fetchAISummary = useCallback(async (
    snapshot: VersionSnapshot,
    prev: VersionSnapshot | undefined,
    allVersions: VersionSnapshot[],
  ) => {
    if (!prev) return;
    setSavingSnapshotId(snapshot.id);

    try {
      const resp = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'version-diff-summary',
          payload: {
            prevText: prev.text.slice(0, 2000),
            newText: snapshot.text.slice(0, 2000),
            prevWordCount: prev.wordCount,
            newWordCount: snapshot.wordCount,
          },
        }),
      });

      if (resp.ok) {
        const { summary, sectionsChanged } = await resp.json();
        const withSummary = allVersions.map(v =>
          v.id === snapshot.id
            ? { ...v, aiSummary: summary, diffStats: { ...v.diffStats!, sectionsChanged: sectionsChanged || [] } }
            : v,
        );
        saveVersions(docId, withSummary);
        setVersions(withSummary);
      }
    } catch {/* non-fatal */} finally {
      setSavingSnapshotId(null);
    }
  }, [docId]);

  const restoreVersion = useCallback((v: VersionSnapshot) => {
    setIsRestoring(true);
    // Create a snapshot of current state before restoring
    createSnapshot(true, `Before restore to ${formatTimestamp(v.timestamp)}`);
    setTimeout(() => {
      editor.commands.setContent(v.html);
      setIsRestoring(false);
      setSelectedId(null);
    }, 300);
  }, [editor, createSnapshot]);

  const selected = versions.find(v => v.id === selectedId);
  const diffBase = versions.find(v => v.id === diffViewId);

  return (
    <div className="fixed inset-y-0 right-0 w-80 bg-white border-l border-gray-200 shadow-2xl z-40 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Version History</h2>
          <p className="text-xs text-gray-500">{versions.length} snapshot{versions.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowLabelInput(true)}
            className="text-xs px-2 py-1 bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition-colors"
            title="Save manual snapshot"
          >
            📸 Snapshot
          </button>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
        </div>
      </div>

      {/* Manual snapshot label input */}
      {showLabelInput && (
        <div className="px-4 py-2 border-b border-gray-100 bg-purple-50">
          <input
            type="text"
            value={snapshotLabel}
            onChange={e => setSnapshotLabel(e.target.value)}
            placeholder="Label this snapshot (optional)"
            className="w-full text-xs border border-gray-200 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-purple-300 mb-1"
            autoFocus
            onKeyDown={e => {
              if (e.key === 'Enter') {
                createSnapshot(true, snapshotLabel || 'Manual snapshot');
                setSnapshotLabel('');
                setShowLabelInput(false);
              } else if (e.key === 'Escape') {
                setShowLabelInput(false);
              }
            }}
          />
          <div className="flex gap-1">
            <button
              onClick={() => {
                createSnapshot(true, snapshotLabel || 'Manual snapshot');
                setSnapshotLabel('');
                setShowLabelInput(false);
              }}
              className="text-xs px-2 py-0.5 bg-purple-600 text-white rounded hover:bg-purple-700"
            >
              Save
            </button>
            <button
              onClick={() => setShowLabelInput(false)}
              className="text-xs px-2 py-0.5 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Version List */}
      <div className="flex-1 overflow-y-auto">
        {versions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 px-6 text-center">
            <span className="text-3xl mb-3">🕰️</span>
            <p className="text-sm font-medium">No snapshots yet</p>
            <p className="text-xs mt-1">Save the document to start tracking versions</p>
          </div>
        ) : (
          <div className="py-2">
            {versions.map((v, i) => {
              const isSelected = selectedId === v.id;
              const deltaWords = v.diffStats
                ? v.diffStats.wordsAdded - v.diffStats.wordsRemoved
                : 0;

              return (
                <div key={v.id} className="relative pl-8 pr-3 py-2 group">
                  {/* Timeline line */}
                  {i < versions.length - 1 && (
                    <div className="absolute left-4 top-6 w-px h-full bg-gray-200" />
                  )}
                  {/* Dot */}
                  <div className={`absolute left-2.5 top-3 w-3 h-3 rounded-full border-2 transition-colors ${
                    v.isManual
                      ? 'bg-purple-500 border-purple-500'
                      : 'bg-white border-gray-300 group-hover:border-blue-400'
                  }`} />

                  <button
                    onClick={() => setSelectedId(isSelected ? null : v.id)}
                    className={`w-full text-left rounded-lg px-2 py-1.5 transition-colors ${
                      isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    {/* Version label + timestamp */}
                    <div className="flex items-center justify-between gap-1">
                      <span className={`text-xs font-medium truncate ${v.isManual ? 'text-purple-700' : 'text-gray-700'}`}>
                        {v.isManual ? '📸 ' : ''}{v.label}
                      </span>
                      <span className="text-[10px] text-gray-400 shrink-0">{formatTimestamp(v.timestamp)}</span>
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-gray-500">{v.wordCount} words</span>
                      {deltaWords !== 0 && (
                        <span className={`text-[10px] font-medium ${deltaWords > 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {deltaWords > 0 ? '+' : ''}{deltaWords}
                        </span>
                      )}
                      {savingSnapshotId === v.id && (
                        <span className="text-[10px] text-purple-500 flex items-center gap-0.5">
                          <span className="inline-block w-2 h-2 border border-purple-500 border-t-transparent rounded-full animate-spin" />
                          AI...
                        </span>
                      )}
                    </div>

                    {/* AI Summary */}
                    {v.aiSummary && (
                      <p className="text-[10px] text-gray-500 mt-1 leading-relaxed line-clamp-2">
                        ✨ {v.aiSummary}
                      </p>
                    )}
                  </button>

                  {/* Expanded actions */}
                  {isSelected && (
                    <div className="mx-2 mt-1 pt-2 border-t border-gray-100">
                      {v.diffStats?.sectionsChanged && v.diffStats.sectionsChanged.length > 0 && (
                        <div className="mb-2">
                          <p className="text-[10px] font-semibold text-gray-500 uppercase mb-1">Sections changed</p>
                          <div className="flex flex-wrap gap-1">
                            {v.diffStats.sectionsChanged.map((s, j) => (
                              <span key={j} className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded">
                                {s}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="flex gap-1">
                        <button
                          onClick={() => setDiffViewId(v.id)}
                          className="flex-1 text-[10px] px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                        >
                          View Diff
                        </button>
                        <button
                          onClick={() => restoreVersion(v)}
                          disabled={isRestoring}
                          className="flex-1 text-[10px] px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
                        >
                          {isRestoring ? 'Restoring...' : 'Restore'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Diff View Modal */}
      {diffViewId && diffBase && (
        <DiffModal
          current={{ html: editor.getHTML(), wordCount: wordCount(editor.getText()) }}
          version={diffBase}
          onClose={() => setDiffViewId(null)}
          onRestore={() => { restoreVersion(diffBase); setDiffViewId(null); }}
        />
      )}
    </div>
  );
}

// ── Diff Modal ──

function DiffModal({
  current,
  version,
  onClose,
  onRestore,
}: {
  current: { html: string; wordCount: number };
  version: VersionSnapshot;
  onClose: () => void;
  onRestore: () => void;
}) {
  const stripTags = (html: string) =>
    html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  const currentText = stripTags(current.html);
  const versionText = stripTags(version.html);

  // Compute simple sentence-level diff
  const currentSentences = currentText.split(/[.!?]+/).filter(s => s.trim().length > 15);
  const versionSentences = versionText.split(/[.!?]+/).filter(s => s.trim().length > 15);

  const versionSet = new Set(versionSentences.map(s => s.trim().toLowerCase()));
  const currentSet = new Set(currentSentences.map(s => s.trim().toLowerCase()));

  const added = currentSentences.filter(s => !versionSet.has(s.trim().toLowerCase())).slice(0, 10);
  const removed = versionSentences.filter(s => !currentSet.has(s.trim().toLowerCase())).slice(0, 10);

  const wordDelta = current.wordCount - version.wordCount;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              Compare: Current vs {version.label}
            </h3>
            <p className="text-xs text-gray-500">
              {formatTimestamp(version.timestamp)} · {version.wordCount} words
              {wordDelta !== 0 && (
                <span className={`ml-2 font-medium ${wordDelta > 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {wordDelta > 0 ? '+' : ''}{wordDelta} words
                </span>
              )}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
        </div>

        {/* AI Summary */}
        {version.aiSummary && (
          <div className="px-5 py-2 bg-purple-50 border-b border-purple-100">
            <p className="text-xs text-purple-700">✨ <strong>AI Summary:</strong> {version.aiSummary}</p>
          </div>
        )}

        {/* Diff */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {removed.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-red-600 uppercase mb-2 flex items-center gap-1">
                <span className="w-3 h-3 bg-red-500 rounded-sm inline-block" /> Removed ({removed.length} passages)
              </p>
              <div className="space-y-1">
                {removed.map((s, i) => (
                  <div key={i} className="text-xs text-red-700 bg-red-50 rounded px-3 py-1.5 line-through opacity-75">
                    {s.trim()}.
                  </div>
                ))}
              </div>
            </div>
          )}

          {added.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-green-600 uppercase mb-2 flex items-center gap-1">
                <span className="w-3 h-3 bg-green-500 rounded-sm inline-block" /> Added ({added.length} passages)
              </p>
              <div className="space-y-1">
                {added.map((s, i) => (
                  <div key={i} className="text-xs text-green-700 bg-green-50 rounded px-3 py-1.5">
                    {s.trim()}.
                  </div>
                ))}
              </div>
            </div>
          )}

          {added.length === 0 && removed.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-8">No significant content differences detected.</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center px-5 py-3 border-t border-gray-200 bg-gray-50">
          <button onClick={onClose} className="text-xs text-gray-600 hover:text-gray-800">
            Keep Current
          </button>
          <button
            onClick={onRestore}
            className="px-4 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 transition-colors"
          >
            Restore This Version
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Hook for connecting to the editor page ──

export function useVersionTimeline(docId: string) {
  const [saveCount, setSaveCount] = useState(0);

  const bumpSave = useCallback(() => {
    setSaveCount(c => c + 1);
  }, []);

  return { saveCount, bumpSave };
}

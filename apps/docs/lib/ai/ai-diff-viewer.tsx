'use client';

/**
 * AI Document Diff Viewer
 *
 * Side-by-side and inline diff views for document versions:
 * - Visual diff highlighting (added/removed/modified text)
 * - AI-generated change summaries
 * - Section-level change grouping
 * - Version timeline
 * - Accept/reject individual changes
 */

import {useState, useMemo, useCallback} from 'react';

// ── Types ──

export interface DocumentVersion {
  id: string;
  timestamp: number;
  content: string;    // HTML
  title: string;
  wordCount: number;
  author?: string;
}

export interface TextDiff {
  type: 'added' | 'removed' | 'unchanged';
  text: string;
  from?: number;
  to?: number;
}

export interface SectionDiff {
  sectionTitle: string;
  changes: TextDiff[];
  addedWords: number;
  removedWords: number;
  summary: string;
}

export interface DocumentDiffResult {
  versions: {from: DocumentVersion; to: DocumentVersion};
  diffs: TextDiff[];
  sectionDiffs: SectionDiff[];
  summary: string;
  totalAdded: number;
  totalRemoved: number;
  totalUnchanged: number;
}

// ── Diff Algorithm (Myers-like word-level) ──

function computeWordDiff(oldText: string, newText: string): TextDiff[] {
  const oldWords = tokenize(oldText);
  const newWords = tokenize(newText);

  // Simple LCS-based diff
  const lcs = longestCommonSubsequence(oldWords, newWords);
  const diffs: TextDiff[] = [];

  let oi = 0, ni = 0, li = 0;

  while (oi < oldWords.length || ni < newWords.length) {
    if (li < lcs.length && oi < oldWords.length && ni < newWords.length &&
        oldWords[oi] === lcs[li] && newWords[ni] === lcs[li]) {
      // Unchanged
      if (diffs.length > 0 && diffs[diffs.length - 1].type === 'unchanged') {
        diffs[diffs.length - 1].text += oldWords[oi];
      } else {
        diffs.push({type: 'unchanged', text: oldWords[oi]});
      }
      oi++; ni++; li++;
    } else if (li < lcs.length && oi < oldWords.length && oldWords[oi] !== lcs[li]) {
      // Removed
      if (diffs.length > 0 && diffs[diffs.length - 1].type === 'removed') {
        diffs[diffs.length - 1].text += oldWords[oi];
      } else {
        diffs.push({type: 'removed', text: oldWords[oi]});
      }
      oi++;
    } else if (li < lcs.length && ni < newWords.length && newWords[ni] !== lcs[li]) {
      // Added
      if (diffs.length > 0 && diffs[diffs.length - 1].type === 'added') {
        diffs[diffs.length - 1].text += newWords[ni];
      } else {
        diffs.push({type: 'added', text: newWords[ni]});
      }
      ni++;
    } else if (oi < oldWords.length) {
      if (diffs.length > 0 && diffs[diffs.length - 1].type === 'removed') {
        diffs[diffs.length - 1].text += oldWords[oi];
      } else {
        diffs.push({type: 'removed', text: oldWords[oi]});
      }
      oi++;
    } else if (ni < newWords.length) {
      if (diffs.length > 0 && diffs[diffs.length - 1].type === 'added') {
        diffs[diffs.length - 1].text += newWords[ni];
      } else {
        diffs.push({type: 'added', text: newWords[ni]});
      }
      ni++;
    } else {
      break;
    }
  }

  return diffs;
}

function tokenize(text: string): string[] {
  // Split into words but preserve whitespace
  return text.replace(/<[^>]+>/g, ' ').split(/(\s+)/).filter(w => w.length > 0);
}

function longestCommonSubsequence(a: string[], b: string[]): string[] {
  const m = a.length;
  const n = b.length;

  // For performance, limit comparison
  if (m * n > 1000000) {
    // Fall back to simpler comparison for very large texts
    return a.filter(w => b.includes(w));
  }

  const dp: number[][] = Array.from({length: m + 1}, () => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack
  const result: string[] = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      result.unshift(a[i - 1]);
      i--; j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return result;
}

// ── Diff Viewer Component ──

interface DiffViewerProps {
  oldVersion: DocumentVersion;
  newVersion: DocumentVersion;
  aiSummary?: string;
  onClose: () => void;
}

export function AIDiffViewer({oldVersion, newVersion, aiSummary, onClose}: DiffViewerProps) {
  const [viewMode, setViewMode] = useState<'inline' | 'side-by-side'>('inline');

  const diffs = useMemo(
    () => computeWordDiff(
      oldVersion.content.replace(/<[^>]+>/g, ''),
      newVersion.content.replace(/<[^>]+>/g, '')
    ),
    [oldVersion, newVersion]
  );

  const stats = useMemo(() => {
    const added = diffs.filter(d => d.type === 'added').reduce((s, d) => s + d.text.split(/\s+/).filter(w => w).length, 0);
    const removed = diffs.filter(d => d.type === 'removed').reduce((s, d) => s + d.text.split(/\s+/).filter(w => w).length, 0);
    const unchanged = diffs.filter(d => d.type === 'unchanged').reduce((s, d) => s + d.text.split(/\s+/).filter(w => w).length, 0);
    return {added, removed, unchanged};
  }, [diffs]);

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-[900px] max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-3 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">🔍</span>
              <h3 className="font-semibold text-gray-900">Document Diff</h3>
            </div>
            <div className="flex items-center gap-2">
              {/* View mode toggle */}
              <button
                onClick={() => setViewMode('inline')}
                className={`px-2 py-1 text-xs rounded ${viewMode === 'inline' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}
              >
                Inline
              </button>
              <button
                onClick={() => setViewMode('side-by-side')}
                className={`px-2 py-1 text-xs rounded ${viewMode === 'side-by-side' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}
              >
                Side by Side
              </button>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 ml-2">✕</button>
            </div>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-4 mt-2">
            <span className="text-xs text-gray-500">
              {new Date(oldVersion.timestamp).toLocaleDateString()} → {new Date(newVersion.timestamp).toLocaleDateString()}
            </span>
            <span className="text-xs text-green-600">+{stats.added} added</span>
            <span className="text-xs text-red-500">-{stats.removed} removed</span>
            <span className="text-xs text-gray-400">{stats.unchanged} unchanged</span>
          </div>

          {/* AI Summary */}
          {aiSummary && (
            <div className="mt-2 px-3 py-2 bg-purple-50 rounded-lg">
              <span className="text-xs font-medium text-purple-700">✨ AI Summary:</span>
              <p className="text-xs text-purple-600 mt-0.5">{aiSummary}</p>
            </div>
          )}
        </div>

        {/* Diff Content */}
        <div className="flex-1 overflow-auto p-5">
          {viewMode === 'inline' ? (
            <InlineDiffView diffs={diffs} />
          ) : (
            <SideBySideDiffView
              oldContent={oldVersion.content.replace(/<[^>]+>/g, '')}
              newContent={newVersion.content.replace(/<[^>]+>/g, '')}
              diffs={diffs}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Inline Diff ──

function InlineDiffView({diffs}: {diffs: TextDiff[]}) {
  return (
    <div className="font-mono text-sm leading-relaxed whitespace-pre-wrap">
      {diffs.map((diff, i) => {
        if (diff.type === 'unchanged') {
          return <span key={i} className="text-gray-700">{diff.text}</span>;
        }
        if (diff.type === 'added') {
          return <span key={i} className="bg-green-100 text-green-800 px-0.5 rounded">{diff.text}</span>;
        }
        if (diff.type === 'removed') {
          return <span key={i} className="bg-red-100 text-red-800 line-through px-0.5 rounded">{diff.text}</span>;
        }
        return null;
      })}
    </div>
  );
}

// ── Side-by-Side Diff ──

function SideBySideDiffView({
  oldContent,
  newContent,
  diffs,
}: {
  oldContent: string;
  newContent: string;
  diffs: TextDiff[];
}) {
  const removedText = diffs.filter(d => d.type === 'removed' || d.type === 'unchanged')
    .map(d => d.text).join('');
  const addedText = diffs.filter(d => d.type === 'added' || d.type === 'unchanged')
    .map(d => d.text).join('');

  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <div className="text-xs font-medium text-gray-500 mb-2">Previous Version</div>
        <div className="p-3 bg-gray-50 rounded-lg font-mono text-xs whitespace-pre-wrap max-h-[50vh] overflow-auto">
          {oldContent.slice(0, 5000)}
        </div>
      </div>
      <div>
        <div className="text-xs font-medium text-gray-500 mb-2">Current Version</div>
        <div className="p-3 bg-gray-50 rounded-lg font-mono text-xs whitespace-pre-wrap max-h-[50vh] overflow-auto">
          {newContent.slice(0, 5000)}
        </div>
      </div>
    </div>
  );
}

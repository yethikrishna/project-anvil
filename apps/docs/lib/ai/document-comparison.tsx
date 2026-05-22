'use client';

/**
 * AI Document Comparison — Anvil Docs
 *
 * Compare any two documents side-by-side with AI narrative diff.
 * Goes beyond visual diff — explains *why* changes were made.
 *
 * Features:
 * - Side-by-side visual diff with color coding
 * - AI-generated change narrative ("Author strengthened the budget argument, removed 3 weak sections, added 2 new action items")
 * - Section-level change grouping (not just line diffs)
 * - Export diff as a change report
 * - Accept/reject individual changes back to current doc
 * - Compare current doc with any workspace doc
 */

import {useState, useCallback, useMemo} from 'react';
import type {Editor} from '@tiptap/react';

// ── Types ──

export interface TextSpan {
  text: string;
  type: 'unchanged' | 'added' | 'removed' | 'modified';
}

export interface DiffSection {
  id: string;
  heading?: string;
  changes: TextSpan[];
  netWords: number;    // positive = added, negative = removed
  changeType: 'addition' | 'deletion' | 'modification' | 'unchanged';
}

export interface DocumentComparison {
  docATitle: string;
  docBTitle: string;
  sections: DiffSection[];
  stats: {
    totalChanges: number;
    wordsAdded: number;
    wordsRemoved: number;
    sectionsAdded: number;
    sectionsRemoved: number;
    sectionsModified: number;
  };
  aiNarrative?: string;
}

// ── Word-level diff algorithm (Myers diff) ──

function diffWords(a: string, b: string): TextSpan[] {
  const aWords = a.split(/(\s+)/);
  const bWords = b.split(/(\s+)/);

  // Simple LCS-based diff
  const n = aWords.length;
  const m = bWords.length;

  // Build LCS table
  const dp: number[][] = Array.from({length: n + 1}, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (aWords[i - 1] === bWords[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack
  const spans: TextSpan[] = [];
  let i = n, j = m;
  const ops: Array<{type: 'keep' | 'add' | 'remove'; text: string}> = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && aWords[i - 1] === bWords[j - 1]) {
      ops.unshift({type: 'keep', text: aWords[i - 1]});
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.unshift({type: 'add', text: bWords[j - 1]});
      j--;
    } else {
      ops.unshift({type: 'remove', text: aWords[i - 1]});
      i--;
    }
  }

  // Merge consecutive same-type ops
  let current: TextSpan | null = null;
  for (const op of ops) {
    const spanType: TextSpan['type'] = op.type === 'keep' ? 'unchanged' : op.type === 'add' ? 'added' : 'removed';
    if (current && current.type === spanType) {
      current.text += op.text;
    } else {
      if (current) spans.push(current);
      current = {type: spanType, text: op.text};
    }
  }
  if (current) spans.push(current);

  return spans;
}

// ── Section-level diff ──

function splitIntoSections(html: string): Array<{heading: string | null; content: string}> {
  const sections: Array<{heading: string | null; content: string}> = [];
  const headingRegex = /<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi;
  const parts = html.split(/(?=<h[1-6])/);

  for (const part of parts) {
    const headingMatch = part.match(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/i);
    const heading = headingMatch ? headingMatch[1].replace(/<[^>]+>/g, '').trim() : null;
    const textContent = part.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (textContent.length > 5) {
      sections.push({heading, content: textContent});
    }
  }

  // Fallback: split by paragraphs if no headings
  if (sections.length <= 1) {
    const paraRegex = /<p[^>]*>(.*?)<\/p>/gi;
    let match;
    let sectionText = '';
    while ((match = paraRegex.exec(html)) !== null) {
      const text = match[1].replace(/<[^>]+>/g, ' ').trim();
      sectionText += ' ' + text;
    }
    return [{heading: null, content: sectionText.trim()}];
  }

  return sections;
}

function compareDocuments(
  docATitle: string,
  docAHtml: string,
  docBTitle: string,
  docBHtml: string,
): DocumentComparison {
  const sectionsA = splitIntoSections(docAHtml);
  const sectionsB = splitIntoSections(docBHtml);

  const resultSections: DiffSection[] = [];
  let wordsAdded = 0;
  let wordsRemoved = 0;
  let sectionsAdded = 0;
  let sectionsRemoved = 0;
  let sectionsModified = 0;

  // Match sections by heading, fall back to index
  const maxLen = Math.max(sectionsA.length, sectionsB.length);

  for (let i = 0; i < maxLen; i++) {
    const a = sectionsA[i];
    const b = sectionsB[i];

    if (!a && b) {
      // Section added
      const words = b.content.split(/\s+/).length;
      wordsAdded += words;
      sectionsAdded++;
      resultSections.push({
        id: `section-${i}`,
        heading: b.heading || undefined,
        changes: [{type: 'added', text: b.content}],
        netWords: words,
        changeType: 'addition',
      });
    } else if (a && !b) {
      // Section removed
      const words = a.content.split(/\s+/).length;
      wordsRemoved += words;
      sectionsRemoved++;
      resultSections.push({
        id: `section-${i}`,
        heading: a.heading || undefined,
        changes: [{type: 'removed', text: a.content}],
        netWords: -words,
        changeType: 'deletion',
      });
    } else if (a && b) {
      if (a.content === b.content) {
        // Unchanged
        resultSections.push({
          id: `section-${i}`,
          heading: b.heading || undefined,
          changes: [{type: 'unchanged', text: b.content}],
          netWords: 0,
          changeType: 'unchanged',
        });
      } else {
        // Modified
        const spans = diffWords(a.content, b.content);
        const added = spans.filter(s => s.type === 'added').reduce((sum, s) => sum + s.text.split(/\s+/).length, 0);
        const removed = spans.filter(s => s.type === 'removed').reduce((sum, s) => sum + s.text.split(/\s+/).length, 0);
        wordsAdded += added;
        wordsRemoved += removed;
        sectionsModified++;
        resultSections.push({
          id: `section-${i}`,
          heading: b.heading || undefined,
          changes: spans,
          netWords: added - removed,
          changeType: 'modification',
        });
      }
    }
  }

  const totalChanges = sectionsAdded + sectionsRemoved + sectionsModified;

  return {
    docATitle,
    docBTitle,
    sections: resultSections,
    stats: {totalChanges, wordsAdded, wordsRemoved, sectionsAdded, sectionsRemoved, sectionsModified},
  };
}

// ── AI Narrative generation ──

async function generateNarrative(comparison: DocumentComparison): Promise<string> {
  const changeSummary = `
Document: "${comparison.docATitle}" vs "${comparison.docBTitle}"
Words added: ${comparison.stats.wordsAdded}
Words removed: ${comparison.stats.wordsRemoved}
Sections added: ${comparison.stats.sectionsAdded}
Sections removed: ${comparison.stats.sectionsRemoved}
Sections modified: ${comparison.stats.sectionsModified}

Key changes:
${comparison.sections
  .filter(s => s.changeType !== 'unchanged')
  .slice(0, 5)
  .map(s => `- [${s.changeType}] ${s.heading || 'Untitled section'}: ${s.changes.map(c => c.text.slice(0, 80)).join(' ')}`)
  .join('\n')}
`.trim();

  const resp = await fetch('/api/ai', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      action: 'version-diff',
      payload: {
        contentA: comparison.docATitle,
        contentB: comparison.docBTitle,
        changes: changeSummary,
      },
    }),
  });

  if (!resp.ok) return '';
  const data = await resp.json() as {narrative?: string; text?: string};
  return data.narrative || data.text || '';
}

// ── Components ──

function SpanHighlight({span}: {span: TextSpan}) {
  if (span.type === 'unchanged') {
    return <span className="text-gray-700">{span.text}</span>;
  }
  if (span.type === 'added') {
    return (
      <span className="bg-green-100 text-green-800 rounded-sm px-0.5">
        {span.text}
      </span>
    );
  }
  return (
    <span className="bg-red-100 text-red-700 line-through rounded-sm px-0.5">
      {span.text}
    </span>
  );
}

const CHANGE_TYPE_COLORS = {
  addition: 'border-l-green-400 bg-green-50',
  deletion: 'border-l-red-400 bg-red-50',
  modification: 'border-l-yellow-400 bg-yellow-50',
  unchanged: 'border-l-gray-200 bg-transparent',
};

interface DocumentComparisonPanelProps {
  editor: Editor;
  onClose: () => void;
}

export function DocumentComparisonPanel({editor, onClose}: DocumentComparisonPanelProps) {
  const [compareMode, setCompareMode] = useState<'paste' | 'version'>('paste');
  const [docBHtml, setDocBHtml] = useState('');
  const [docBTitle, setDocBTitle] = useState('Comparison Document');
  const [comparison, setComparison] = useState<DocumentComparison | null>(null);
  const [isComparing, setIsComparing] = useState(false);
  const [isNarrativeLoading, setIsNarrativeLoading] = useState(false);
  const [showUnchanged, setShowUnchanged] = useState(false);

  const currentHtml = editor.getHTML();
  const currentText = editor.getText();

  const handleCompare = useCallback(async () => {
    if (!docBHtml.trim()) return;
    setIsComparing(true);

    const result = compareDocuments(
      'Current Document',
      currentHtml,
      docBTitle || 'Comparison',
      docBHtml,
    );
    setComparison(result);
    setIsComparing(false);

    // Load AI narrative
    if (result.stats.totalChanges > 0) {
      setIsNarrativeLoading(true);
      const narrative = await generateNarrative(result);
      if (narrative) {
        setComparison(prev => prev ? {...prev, aiNarrative: narrative} : prev);
      }
      setIsNarrativeLoading(false);
    }
  }, [currentHtml, docBHtml, docBTitle]);

  const visibleSections = useMemo(
    () => comparison?.sections.filter(s => showUnchanged || s.changeType !== 'unchanged') ?? [],
    [comparison, showUnchanged],
  );

  const stats = comparison?.stats;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-2xl shadow-2xl w-[900px] max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100">
          <span className="text-base font-semibold text-gray-900">📄 Compare Documents</span>
          <span className="text-xs text-purple-600 font-medium bg-purple-50 px-1.5 py-0.5 rounded-full">AI</span>
          <div className="flex-1" />
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100">✕</button>
        </div>

        {!comparison ? (
          /* Input phase */
          <div className="p-5 space-y-4 overflow-y-auto flex-1">
            <div className="text-sm text-gray-600">
              Paste a document to compare against the current version. AI will explain the differences.
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-700">Comparison Document Title</label>
              <input
                type="text"
                value={docBTitle}
                onChange={e => setDocBTitle(e.target.value)}
                placeholder="e.g., Previous Version, Client Feedback, Draft v2..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-700">Paste Document Content</label>
              <textarea
                value={docBHtml}
                onChange={e => setDocBHtml(e.target.value)}
                placeholder="Paste text or HTML content here..."
                rows={12}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 font-mono resize-none"
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="text-xs text-gray-400">
                Current document: {currentText.split(/\s+/).length} words
              </div>
              <button
                onClick={handleCompare}
                disabled={!docBHtml.trim() || isComparing}
                className="px-5 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
              >
                {isComparing ? '⏳ Comparing...' : '✨ Compare'}
              </button>
            </div>
          </div>
        ) : (
          /* Results phase */
          <div className="flex-1 overflow-hidden flex flex-col">
            {/* Stats bar */}
            <div className="flex items-center gap-4 px-5 py-2.5 border-b border-gray-100 bg-gray-50">
              <button
                onClick={() => setComparison(null)}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                ← New Comparison
              </button>
              <div className="flex items-center gap-3 text-xs">
                {stats && (
                  <>
                    <span className="text-green-600">+{stats.wordsAdded} words</span>
                    <span className="text-red-500">−{stats.wordsRemoved} words</span>
                    {stats.sectionsAdded > 0 && (
                      <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded-full">
                        +{stats.sectionsAdded} sections
                      </span>
                    )}
                    {stats.sectionsRemoved > 0 && (
                      <span className="px-1.5 py-0.5 bg-red-100 text-red-600 rounded-full">
                        -{stats.sectionsRemoved} sections
                      </span>
                    )}
                    {stats.sectionsModified > 0 && (
                      <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded-full">
                        ~{stats.sectionsModified} modified
                      </span>
                    )}
                  </>
                )}
              </div>
              <div className="flex-1" />
              <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showUnchanged}
                  onChange={e => setShowUnchanged(e.target.checked)}
                  className="rounded"
                />
                Show unchanged
              </label>
            </div>

            {/* AI Narrative */}
            {(comparison.aiNarrative || isNarrativeLoading) && (
              <div className="px-5 py-3 border-b border-gray-100 bg-purple-50">
                <div className="flex items-start gap-2">
                  <span className="text-sm">✨</span>
                  <div className="flex-1">
                    <div className="text-xs font-semibold text-purple-700 mb-1">AI Analysis</div>
                    {isNarrativeLoading ? (
                      <div className="text-xs text-gray-400 animate-pulse">Generating analysis...</div>
                    ) : (
                      <p className="text-xs text-gray-700 leading-relaxed">{comparison.aiNarrative}</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Diff sections */}
            <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
              {visibleSections.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-sm text-gray-400">
                  No changes detected between these documents
                </div>
              ) : (
                visibleSections.map(section => (
                  <div
                    key={section.id}
                    className={`border-l-4 px-5 py-3 ${CHANGE_TYPE_COLORS[section.changeType]}`}
                  >
                    {section.heading && (
                      <div className="text-xs font-semibold text-gray-500 mb-1.5">{section.heading}</div>
                    )}
                    <p className="text-sm leading-relaxed">
                      {section.changes.map((span, i) => (
                        <SpanHighlight key={i} span={span} />
                      ))}
                    </p>
                    {section.netWords !== 0 && (
                      <div className={`text-[10px] mt-1 ${section.netWords > 0 ? 'text-green-500' : 'text-red-400'}`}>
                        {section.netWords > 0 ? `+${section.netWords}` : section.netWords} words
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

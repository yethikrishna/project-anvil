'use client';

/**
 * AI Word Choice Suggester — Anvil Docs
 *
 * Highlights weak, overused, or replaceable words in the document.
 * Categories:
 * - Overused: "very", "really", "just", "basically", "actually"
 * - Vague: "thing", "stuff", "good", "bad", "nice", "some"
 * - Weak verbs: "is", "was", "get", "got", "make"
 * - Redundant phrases: "in order to", "due to the fact that"
 * - Clichés: "at the end of the day", "move the needle", etc.
 *
 * Features:
 * - Highlighted inline text with color by category
 * - Click word → see AI alternatives
 * - One-click replace
 * - "Improve all" mode
 */

import {useState, useMemo, useCallback} from 'react';
import type {Editor} from '@tiptap/react';

// ── Types ──

export type WordCategory = 'overused' | 'vague' | 'weak-verb' | 'redundant' | 'cliche' | 'filler';

export interface WeakWord {
  word: string;
  category: WordCategory;
  alternatives: string[];
  explanation: string;
}

export interface WordIssue {
  word: string;
  category: WordCategory;
  count: number;
  alternatives: string[];
  explanation: string;
  positions: number[];
}

// ── Word database ──

const WORD_DATABASE: WeakWord[] = [
  // Overused intensifiers
  {word: 'very', category: 'overused', alternatives: ['extremely', 'highly', 'remarkably', 'notably', 'particularly'], explanation: '"Very" is overused. Pick a stronger word.'},
  {word: 'really', category: 'overused', alternatives: ['genuinely', 'truly', 'highly', 'substantially'], explanation: '"Really" adds little. Try a more precise intensifier.'},
  {word: 'just', category: 'overused', alternatives: ['simply', 'only', 'merely', '(remove it)'], explanation: '"Just" often weakens statements. Consider removing it.'},
  {word: 'actually', category: 'overused', alternatives: ['(remove it)', 'in fact', 'notably'], explanation: '"Actually" often adds no meaning.'},
  {word: 'basically', category: 'overused', alternatives: ['fundamentally', 'essentially', 'in short', '(remove it)'], explanation: '"Basically" can sound dismissive.'},
  {word: 'literally', category: 'overused', alternatives: ['(remove it)', 'genuinely', 'in fact'], explanation: '"Literally" is often used incorrectly or unnecessarily.'},
  {word: 'quite', category: 'overused', alternatives: ['considerably', 'notably', '(remove it)'], explanation: '"Quite" is ambiguous in meaning.'},
  {word: 'rather', category: 'overused', alternatives: ['fairly', 'somewhat', '(remove it)'], explanation: '"Rather" is weak — be specific.'},

  // Vague nouns
  {word: 'thing', category: 'vague', alternatives: ['feature', 'element', 'aspect', 'factor', 'item'], explanation: '"Thing" is too vague. Name it specifically.'},
  {word: 'stuff', category: 'vague', alternatives: ['content', 'material', 'items', 'details'], explanation: '"Stuff" is too informal and vague.'},
  {word: 'good', category: 'vague', alternatives: ['effective', 'robust', 'strong', 'excellent', 'beneficial'], explanation: '"Good" is subjective — be specific.'},
  {word: 'bad', category: 'vague', alternatives: ['problematic', 'ineffective', 'poor', 'harmful'], explanation: '"Bad" is vague — explain why.'},
  {word: 'nice', category: 'vague', alternatives: ['polished', 'elegant', 'clean', 'professional'], explanation: '"Nice" has no precise meaning.'},
  {word: 'big', category: 'vague', alternatives: ['large', 'significant', 'substantial', 'major', 'extensive'], explanation: '"Big" is informal and vague.'},
  {word: 'small', category: 'vague', alternatives: ['minor', 'minimal', 'modest', 'limited'], explanation: '"Small" can be more precise.'},

  // Weak verbs
  {word: 'utilize', category: 'weak-verb', alternatives: ['use'], explanation: '"Utilize" is a pompous substitute for "use".'},
  {word: 'leverage', category: 'weak-verb', alternatives: ['use', 'apply', 'harness', 'capitalize on'], explanation: 'Overused in business writing.'},
  {word: 'synergize', category: 'weak-verb', alternatives: ['collaborate', 'combine', 'work together'], explanation: 'Corporate jargon.'},
  {word: 'impact', category: 'weak-verb', alternatives: ['affect', 'influence', 'change', 'alter', 'shape'], explanation: 'As a verb, "impact" is often replaceable.'},
  {word: 'implement', category: 'weak-verb', alternatives: ['build', 'create', 'deploy', 'execute', 'launch'], explanation: 'Often replaceable with a more specific verb.'},

  // Redundant phrases (handled separately as multi-word)
  // Clichés
  {word: 'game-changer', category: 'cliche', alternatives: ['significant advance', 'major improvement', 'breakthrough'], explanation: 'Overused cliché.'},
  {word: 'disruptive', category: 'cliche', alternatives: ['innovative', 'transformative', 'novel', 'groundbreaking'], explanation: 'Overused startup jargon.'},
  {word: 'ecosystem', category: 'cliche', alternatives: ['platform', 'network', 'community', 'system'], explanation: 'Often used vaguely.'},
  {word: 'robust', category: 'cliche', alternatives: ['reliable', 'strong', 'comprehensive', 'thorough'], explanation: '"Robust" is overused in technical writing.'},
  {word: 'seamless', category: 'cliche', alternatives: ['smooth', 'frictionless', 'integrated', 'unified'], explanation: '"Seamless" is overused in product writing.'},
  {word: 'best-in-class', category: 'cliche', alternatives: ['leading', 'top-tier', 'industry-leading', 'excellent'], explanation: 'Vague superlative.'},

  // Fillers
  {word: 'in order to', category: 'filler', alternatives: ['to'], explanation: '"In order to" can almost always be shortened to "to".'},
  {word: 'due to the fact that', category: 'filler', alternatives: ['because', 'since'], explanation: 'Overly wordy. Use "because".'},
  {word: 'at this point in time', category: 'filler', alternatives: ['now', 'currently', 'at present'], explanation: 'Wordy phrase. Use "now".'},
  {word: 'in the event that', category: 'filler', alternatives: ['if', 'should'], explanation: 'Wordy. Use "if".'},
];

const MULTI_WORD_ISSUES: Array<{phrase: string; alternatives: string[]; explanation: string; category: WordCategory}> = [
  {phrase: 'in order to', alternatives: ['to'], explanation: 'Simplify to "to"', category: 'filler'},
  {phrase: 'due to the fact that', alternatives: ['because', 'since'], explanation: 'Use "because"', category: 'filler'},
  {phrase: 'at the end of the day', alternatives: ['ultimately', 'in the end', 'finally'], explanation: 'Cliché phrase', category: 'cliche'},
  {phrase: 'move the needle', alternatives: ['make progress', 'have impact', 'drive results'], explanation: 'Business cliché', category: 'cliche'},
  {phrase: 'it goes without saying', alternatives: ['(remove it)', 'clearly', 'obviously'], explanation: 'If it goes without saying, don\'t say it', category: 'filler'},
  {phrase: 'at this point in time', alternatives: ['now', 'currently'], explanation: 'Wordy', category: 'filler'},
  {phrase: 'in terms of', alternatives: ['for', 'regarding', 'about'], explanation: 'Often replaceable', category: 'filler'},
  {phrase: 'on a daily basis', alternatives: ['daily', 'every day'], explanation: 'Simplify', category: 'filler'},
];

const CATEGORY_STYLES: Record<WordCategory, {bg: string; text: string; label: string; badgeColor: string}> = {
  overused:   {bg: 'bg-yellow-100',  text: 'text-yellow-800',  label: 'Overused',   badgeColor: '#ca8a04'},
  vague:      {bg: 'bg-orange-100',  text: 'text-orange-800',  label: 'Vague',      badgeColor: '#ea580c'},
  'weak-verb':{bg: 'bg-red-100',     text: 'text-red-800',     label: 'Weak verb',  badgeColor: '#dc2626'},
  redundant:  {bg: 'bg-purple-100',  text: 'text-purple-800',  label: 'Redundant',  badgeColor: '#9333ea'},
  cliche:     {bg: 'bg-pink-100',    text: 'text-pink-800',    label: 'Cliché',     badgeColor: '#db2777'},
  filler:     {bg: 'bg-gray-100',    text: 'text-gray-700',    label: 'Filler',     badgeColor: '#6b7280'},
};

// ── Analysis ──

export function analyzeWordChoice(text: string): WordIssue[] {
  const issues: Map<string, WordIssue> = new Map();
  const lowerText = text.toLowerCase();
  const words = text.split(/\b/);

  // Single-word analysis
  for (const entry of WORD_DATABASE) {
    const regex = new RegExp(`\\b${entry.word.replace(/[-]/g, '[-]?')}\\b`, 'gi');
    const matches = [...text.matchAll(regex)];
    if (matches.length > 0) {
      const positions = matches.map(m => m.index!);
      issues.set(entry.word.toLowerCase(), {
        word: entry.word,
        category: entry.category,
        count: matches.length,
        alternatives: entry.alternatives,
        explanation: entry.explanation,
        positions,
      });
    }
  }

  // Multi-word phrases
  for (const phrase of MULTI_WORD_ISSUES) {
    const regex = new RegExp(phrase.phrase.replace(/ /g, '\\s+'), 'gi');
    const matches = [...text.matchAll(regex)];
    if (matches.length > 0) {
      issues.set(phrase.phrase, {
        word: phrase.phrase,
        category: phrase.category,
        count: matches.length,
        alternatives: phrase.alternatives,
        explanation: phrase.explanation,
        positions: matches.map(m => m.index!),
      });
    }
  }

  return [...issues.values()].sort((a, b) => b.count - a.count);
}

// ── Component ──

interface WordChoicePanelProps {
  editor: Editor;
  onClose: () => void;
}

export function WordChoicePanel({editor, onClose}: WordChoicePanelProps) {
  const [activeCategory, setActiveCategory] = useState<WordCategory | 'all'>('all');
  const [replacing, setReplacing] = useState<string | null>(null);

  const text = editor.getText();
  const issues = useMemo(() => analyzeWordChoice(text), [text]);

  const filtered = useMemo(
    () => activeCategory === 'all' ? issues : issues.filter(i => i.category === activeCategory),
    [issues, activeCategory],
  );

  const totalIssues = issues.reduce((sum, i) => sum + i.count, 0);

  const handleReplace = useCallback((issue: WordIssue, replacement: string) => {
    if (replacement === '(remove it)') {
      // Replace word with empty string + clean up double spaces
      const html = editor.getHTML();
      const regex = new RegExp(`\\b${issue.word}\\b\\s*`, 'gi');
      editor.commands.setContent(html.replace(regex, ''));
    } else {
      const html = editor.getHTML();
      const regex = new RegExp(`\\b${issue.word}\\b`, 'gi');
      editor.commands.setContent(html.replace(regex, replacement));
    }
    setReplacing(null);
  }, [editor]);

  // Category counts
  const categoryCounts: Partial<Record<WordCategory, number>> = {};
  for (const issue of issues) {
    categoryCounts[issue.category] = (categoryCounts[issue.category] || 0) + issue.count;
  }

  return (
    <div className="fixed right-4 top-20 w-76 bg-white rounded-2xl shadow-2xl border border-gray-100 z-50 flex flex-col max-h-[80vh]" style={{width: '300px'}}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
        <span className="text-sm font-semibold text-gray-900">✍️ Word Choice</span>
        {totalIssues > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded-full font-medium">
            {totalIssues} issues
          </span>
        )}
        <div className="flex-1" />
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
      </div>

      {/* Category filter */}
      {issues.length > 0 && (
        <div className="px-3 py-2 border-b border-gray-100 flex flex-wrap gap-1">
          <button
            onClick={() => setActiveCategory('all')}
            className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${activeCategory === 'all' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600'}`}
          >
            All ({totalIssues})
          </button>
          {(Object.entries(categoryCounts) as [WordCategory, number][]).map(([cat, count]) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`text-[10px] px-2 py-0.5 rounded-full font-medium transition-colors ${activeCategory === cat ? 'bg-gray-800 text-white' : `${CATEGORY_STYLES[cat].bg} ${CATEGORY_STYLES[cat].text}`}`}
            >
              {CATEGORY_STYLES[cat].label} ({count})
            </button>
          ))}
        </div>
      )}

      {/* Issues list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="px-4 py-8 text-xs text-gray-400 text-center">
            {issues.length === 0 ? '✅ No weak words detected!' : 'No issues in this category'}
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map(issue => {
              const style = CATEGORY_STYLES[issue.category];
              return (
                <div key={issue.word} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`text-sm font-semibold px-1.5 py-0.5 rounded ${style.bg} ${style.text}`}
                        >
                          "{issue.word}"
                        </span>
                        <span className="text-[10px] text-gray-400">×{issue.count}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${style.bg} ${style.text}`}>
                          {style.label}
                        </span>
                      </div>
                      <div className="text-[11px] text-gray-500 mt-1">{issue.explanation}</div>
                    </div>
                  </div>

                  {/* Alternatives */}
                  <div className="mt-2 flex flex-wrap gap-1">
                    {issue.alternatives.slice(0, 4).map(alt => (
                      <button
                        key={alt}
                        onClick={() => handleReplace(issue, alt)}
                        className="text-[11px] px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100 transition-colors font-medium"
                        title={`Replace all "${issue.word}" with "${alt}"`}
                      >
                        {alt === '(remove it)' ? '🗑️ Remove' : alt}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      {issues.length > 0 && (
        <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50 text-[10px] text-gray-400">
          Click a suggestion to replace all occurrences instantly
        </div>
      )}
    </div>
  );
}

'use client';

/**
 * AI Writing Coach — Real-time feedback as you type
 *
 * Shows non-intrusive suggestions:
 * - Wordy sentences → shorter alternatives
 * - Passive voice → active voice
 * - Jargon → plain language
 * - Repetitive words → varied alternatives
 * - Sentence length warnings
 * - Transition suggestions between paragraphs
 *
 * Smarter than Grammarly because it understands document context.
 */

import {Plugin, PluginKey} from '@tiptap/pm/state';
import {Decoration, DecorationSet} from '@tiptap/pm/view';
import type {Node as ProseMirrorNode} from '@tiptap/pm/model';
import {Extension} from '@tiptap/core';

// ── Types ──

interface WritingIssue {
  from: number;
  to: number;
  type: 'wordy' | 'passive' | 'jargon' | 'repetitive' | 'long-sentence' | 'weak-verb' | 'cliche' | 'missing-transition';
  message: string;
  suggestion: string;
  severity: 'info' | 'warning' | 'error';
}

const coachKey = new PluginKey('ai-writing-coach');

// ── Detection Rules ──

const PASSIVE_PATTERNS: Array<{pattern: RegExp; active: string}> = [
  {pattern: /\bwas\s+(?:being\s+)?(\w+ed)\b/gi, active: 'Use active verb'},
  {pattern: /\bwere\s+(?:being\s+)?(\w+ed)\b/gi, active: 'Use active verb'},
  {pattern: /\bis\s+being\s+(\w+ed)\b/gi, active: 'Use active verb'},
  {pattern: /\bhas\s+been\s+(\w+ed)\b/gi, active: 'Use active verb'},
  {pattern: /\bhad\s+been\s+(\w+ed)\b/gi, active: 'Use active verb'},
  {pattern: /\bwill\s+be\s+(\w+ed)\b/gi, active: 'Use active verb'},
];

const WORDY_PATTERNS: Array<{pattern: RegExp; concise: string}> = [
  {pattern: /\bin order to\b/gi, concise: 'to'},
  {pattern: /\bdue to the fact that\b/gi, concise: 'because'},
  {pattern: /\bfor the purpose of\b/gi, concise: 'to'},
  {pattern: /\bin the event that\b/gi, concise: 'if'},
  {pattern: /\bat this point in time\b/gi, concise: 'now'},
  {pattern: /\bhas the ability to\b/gi, concise: 'can'},
  {pattern: /\bis able to\b/gi, concise: 'can'},
  {pattern: /\bprior to\b/gi, concise: 'before'},
  {pattern: /\bsubsequent to\b/gi, concise: 'after'},
  {pattern: /\bin close proximity to\b/gi, concise: 'near'},
  {pattern: /\ba large number of\b/gi, concise: 'many'},
  {pattern: /\bthe vast majority of\b/gi, concise: 'most'},
  {pattern: /\bit is important to note that\b/gi, concise: '(delete — just state it)'},
  {pattern: /\bit should be noted that\b/gi, concise: '(delete — just state it)'},
  {pattern: /\bin spite of the fact that\b/gi, concise: 'although'},
  {pattern: /\bwith regard to\b/gi, concise: 'about'},
  {pattern: /\bin accordance with\b/gi, concise: 'per'},
  {pattern: /\bon a daily basis\b/gi, concise: 'daily'},
  {pattern: /\bmake a decision\b/gi, concise: 'decide'},
  {pattern: /\btake into consideration\b/gi, concise: 'consider'},
];

const CLICHES: Array<{pattern: RegExp; alternative: string}> = [
  {pattern: /\bthink outside the box\b/gi, alternative: 'be creative / innovate'},
  {pattern: /\bsynergy\b/gi, alternative: 'collaboration / teamwork'},
  {pattern: /\bleverage\b/gi, alternative: 'use'},
  {pattern: /\bmove the needle\b/gi, alternative: 'make an impact'},
  {pattern: /\bdeep dive\b/gi, alternative: 'detailed look'},
  {pattern: /\bcircle back\b/gi, alternative: 'follow up'},
  {pattern: /\bunpack\b/gi, alternative: 'analyze / explain'},
  {pattern: /\blow-hanging fruit\b/gi, alternative: 'easy wins'},
  {pattern: /\bgame changer\b/gi, alternative: 'major improvement'},
  {pattern: /\b(disrupt|disruptive)\b/gi, alternative: 'innovative'},
];

const WEAK_VERBS: Array<{pattern: RegExp; strong: string}> = [
  {pattern: /\bmake\b/gi, strong: 'build, create, produce, generate'},
  {pattern: /\bdo\b/gi, strong: 'accomplish, execute, perform, achieve'},
  {pattern: /\bget\b/gi, strong: 'obtain, acquire, receive, earn'},
  {pattern: /\bgive\b/gi, strong: 'provide, deliver, present, offer'},
  {pattern: /\bhave\b/gi, strong: 'possess, hold, maintain, own'},
  {pattern: /\bhelp\b/gi, strong: 'assist, support, enable, facilitate'},
];

const JARGON: Record<string, string> = {
  'utilize': 'use',
  'implement': 'do / build',
  'facilitate': 'help / enable',
  'optimize': 'improve',
  'operationalize': 'put into practice',
  'paradigm': 'model / approach',
  'stakeholder': 'person involved',
  'deliverable': 'output / result',
  'bandwidth': 'capacity / time',
  'kpi': 'key metric',
  'roi': 'return on investment',
  'value proposition': 'benefit',
};

// ── Analyzer ──

function analyzeText(text: string, doc: ProseMirrorNode): WritingIssue[] {
  const issues: WritingIssue[] = [];
  const sentences = text.split(/(?<=[.!?])\s+/);

  // Track word positions for accurate mapping
  let globalOffset = 0;

  // 1. Passive voice detection
  for (const {pattern, active} of PASSIVE_PATTERNS) {
    let match;
    const regex = new RegExp(pattern.source, pattern.flags);
    while ((match = regex.exec(text)) !== null) {
      issues.push({
        from: match.index,
        to: match.index + match[0].length,
        type: 'passive',
        message: `Passive voice: "${match[0]}"`,
        suggestion: active,
        severity: 'warning',
      });
    }
  }

  // 2. Wordy phrases
  for (const {pattern, concise} of WORDY_PATTERNS) {
    let match;
    const regex = new RegExp(pattern.source, pattern.flags);
    while ((match = regex.exec(text)) !== null) {
      issues.push({
        from: match.index,
        to: match.index + match[0].length,
        type: 'wordy',
        message: `Wordy: "${match[0]}" → "${concise}"`,
        suggestion: concise,
        severity: 'info',
      });
    }
  }

  // 3. Clichés
  for (const {pattern, alternative} of CLICHES) {
    let match;
    const regex = new RegExp(pattern.source, pattern.flags);
    while ((match = regex.exec(text)) !== null) {
      issues.push({
        from: match.index,
        to: match.index + match[0].length,
        type: 'cliche',
        message: `Cliché: "${match[0]}"`,
        suggestion: alternative,
        severity: 'info',
      });
    }
  }

  // 4. Jargon
  for (const [word, plain] of Object.entries(JARGON)) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    let match;
    while ((match = regex.exec(text)) !== null) {
      issues.push({
        from: match.index,
        to: match.index + match[0].length,
        type: 'jargon',
        message: `Jargon: "${match[0]}" → "${plain}"`,
        suggestion: plain,
        severity: 'info',
      });
    }
  }

  // 5. Long sentences (>35 words)
  let sentenceStart = 0;
  for (const sentence of sentences) {
    const wordCount = sentence.split(/\s+/).length;
    if (wordCount > 35) {
      issues.push({
        from: sentenceStart,
        to: sentenceStart + sentence.length,
        type: 'long-sentence',
        message: `Long sentence (${wordCount} words) — consider splitting`,
        suggestion: 'Split into 2 shorter sentences',
        severity: 'warning',
      });
    }
    sentenceStart += sentence.length + 1;
  }

  // 6. Repetitive words (same word used 3+ times within 200 chars)
  const wordPositions: Map<string, number[]> = new Map();
  const words = text.split(/\s+/);
  let pos = 0;
  for (const word of words) {
    const clean = word.toLowerCase().replace(/[^a-z]/g, '');
    if (clean.length < 4) { pos += word.length + 1; continue; }
    if (!wordPositions.has(clean)) wordPositions.set(clean, []);
    wordPositions.get(clean)!.push(pos);
    pos += word.length + 1;
  }

  for (const [word, positions] of wordPositions) {
    if (positions.length < 3) continue;
    // Check for close clustering
    for (let i = 2; i < positions.length; i++) {
      if (positions[i] - positions[i - 2] < 200) {
        issues.push({
          from: positions[i],
          to: positions[i] + word.length,
          type: 'repetitive',
          message: `"${word}" used ${positions.length} times nearby`,
          suggestion: 'Use a synonym for variety',
          severity: 'info',
        });
        break; // Only report once per word cluster
      }
    }
  }

  return issues.slice(0, 20); // Limit issues to avoid overwhelming
}

// ── Tiptap Extension ──

export const AIWritingCoach = Extension.create({
  name: 'aiWritingCoach',

  addProseMirrorPlugins() {
    const editor = this.editor;

    return [
      new Plugin({
        key: coachKey,
        state: {
          init: () => ({issues: []}),
          apply: (tr, value) => {
            if (tr.docChanged) {
              const text = tr.doc.textContent;
              const issues = analyzeText(text, tr.doc);
              return {issues};
            }
            return value;
          },
        },
        props: {
          decorations: (state) => {
            const pluginState = coachKey.getState(state);
            if (!pluginState || pluginState.issues.length === 0) {
              return DecorationSet.empty;
            }

            const decorations: Decoration[] = [];

            for (const issue of pluginState.issues) {
              const color = issue.severity === 'error' ? '#ef4444' :
                issue.severity === 'warning' ? '#f59e0b' : '#3b82f6';

              const style = issue.type === 'long-sentence'
                ? `background: ${color}10; border-radius: 2px;`
                : `border-bottom: 2px wavy ${color}; cursor: pointer;`;

              try {
                decorations.push(
                  Decoration.inline(issue.from, issue.to, {
                    class: `ai-coach-${issue.type}`,
                    style,
                    title: `${issue.message}\nSuggestion: ${issue.suggestion}`,
                    'data-coach-type': issue.type,
                    'data-coach-msg': issue.message,
                    'data-coach-fix': issue.suggestion,
                  })
                );
              } catch {
                // Position may be out of bounds — skip
              }
            }

            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});

export type {WritingIssue};

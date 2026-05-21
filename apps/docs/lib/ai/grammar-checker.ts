'use client';

/**
 * AI Grammar Checker — Tiptap Extension
 *
 * Real-time inline grammar checking with:
 * - ProseMirror decorations for grammar issues
 * - Spelling, grammar, punctuation, style issues
 * - Hover tooltips with corrections
 * - One-click accept corrections
 * - Severity indicators (error, warning, suggestion)
 */

import {Extension} from '@tiptap/core';
import {Plugin, PluginKey} from '@tiptap/pm/state';
import {Decoration, DecorationSet} from '@tiptap/pm/view';

// ── Types ──

export interface GrammarIssue {
  id: string;
  from: number;
  to: number;
  type: 'spelling' | 'grammar' | 'punctuation' | 'style' | 'clarity';
  severity: 'error' | 'warning' | 'info';
  message: string;
  replacement: string | null;
  originalText: string;
}

interface GrammarState {
  issues: GrammarIssue[];
  lastChecked: number;
  isChecking: boolean;
}

const grammarKey = new PluginKey<GrammarState>('grammar-checker');

// ── Local Grammar Rules (no AI needed for basic checks) ──

function checkLocalGrammar(text: string, docOffset: number): GrammarIssue[] {
  const issues: GrammarIssue[] = [];
  let id = 0;

  // Split into sentences
  const sentences = text.split(/(?<=[.!?])\s+/);
  let offset = 0;

  for (const sentence of sentences) {
    const words = sentence.split(/\s+/);

    // 1. Double spaces
    const doubleSpace = text.indexOf('  ', offset);
    if (doubleSpace !== -1 && doubleSpace < offset + sentence.length) {
      issues.push({
        id: `grammar-${id++}`,
        from: doubleSpace,
        to: doubleSpace + 2,
        type: 'punctuation',
        severity: 'info',
        message: 'Extra space detected',
        replacement: ' ',
        originalText: '  ',
      });
    }

    // 2. Missing capitalization after period
    for (let i = 1; i < words.length; i++) {
      const prevWord = words[i - 1];
      const currWord = words[i];

      if (prevWord.endsWith('.') && currWord.length > 0 && currWord[0] !== currWord[0].toUpperCase()) {
        const wordStart = text.indexOf(currWord, offset);
        if (wordStart !== -1) {
          issues.push({
            id: `grammar-${id++}`,
            from: wordStart,
            to: wordStart + currWord.length,
            type: 'grammar',
            severity: 'warning',
            message: 'Capitalize the first word after a period',
            replacement: currWord[0].toUpperCase() + currWord.slice(1),
            originalText: currWord,
          });
        }
      }
    }

    // 3. Common homophones
    const homophones: Record<string, string> = {
      'teh': 'the',
      'recieve': 'receive',
      'occured': 'occurred',
      'seperate': 'separate',
      'definately': 'definitely',
      'occassion': 'occasion',
      'accomodate': 'accommodate',
      'apparant': 'apparent',
      'calender': 'calendar',
      'collegue': 'colleague',
      'committment': 'commitment',
      'concensus': 'consensus',
      'dissapoint': 'disappoint',
      'enviroment': 'environment',
      'goverment': 'government',
      'immediatly': 'immediately',
      'independant': 'independent',
      'neccessary': 'necessary',
      'noticable': 'noticeable',
      'occurence': 'occurrence',
      'persistant': 'persistent',
      'professionnal': 'professional',
      'recomend': 'recommend',
      'refered': 'referred',
      'succesful': 'successful',
      'suprise': 'surprise',
      'tommorow': 'tomorrow',
      'untill': 'until',
      'wierd': 'weird',
    };

    for (const [misspelling, correction] of Object.entries(homophones)) {
      const regex = new RegExp(`\\b${misspelling}\\b`, 'gi');
      let match;
      while ((match = regex.exec(text.slice(offset, offset + sentence.length))) !== null) {
        issues.push({
          id: `grammar-${id++}`,
          from: offset + match.index,
          to: offset + match.index + misspelling.length,
          type: 'spelling',
          severity: 'error',
          message: `Did you mean "${correction}"?`,
          replacement: correction,
          originalText: match[0],
        });
      }
    }

    // 4. Common grammar patterns
    const grammarPatterns: Array<{pattern: RegExp; message: string; replacement?: string}> = [
      {
        pattern: /\bi\b(?!['.])(?!$)/g,
        message: 'Capitalize "I"',
        replacement: 'I',
      },
      {
        pattern: /\b(should|would|could|might) of\b/gi,
        message: 'Use "have" instead of "of"',
        replacement: (m: string) => m.replace(/ of/i, ' have'),
      },
      {
        pattern: /\btheir\s+is\b/gi,
        message: 'Use "there is" for existence, "their" is possessive',
      },
      {
        pattern: /\byour\s+(welcome|a\s+great|the\s+best)\b/gi,
        message: 'Use "you\'re" (you are) instead of "your" (possessive)',
      },
      {
        pattern: /\bits\s+a\s+(great|good|nice|beautiful)\b/gi,
        message: 'If you mean "it is", use "it\'s" with apostrophe',
      },
      {
        pattern: /\balot\b/gi,
        message: '"A lot" is two words',
        replacement: 'a lot',
      },
      {
        pattern: /\beffect\s+on\b/gi,
        message: 'Consider using "affect" when used as a verb',
      },
      {
        pattern: /\bless\s+\w+s\b/gi,
        message: 'Consider using "fewer" for countable nouns',
      },
      {
        pattern: /\b,(?=\s*,)/g,
        message: 'Double comma detected',
      },
      {
        pattern: /\s+\.\s*/g,
        message: 'Space before period',
      },
      {
        pattern: /\.{4,}/g,
        message: 'Use exactly three dots for ellipsis',
        replacement: '...',
      },
    ];

    for (const {pattern, message, replacement} of grammarPatterns) {
      let match;
      while ((match = pattern.exec(sentence)) !== null) {
        // Skip if already found at this position
        const from = offset + match.index;
        const to = from + match[0].length;
        const alreadyExists = issues.some(i => i.from === from && i.to === to);
        if (alreadyExists) continue;

        issues.push({
          id: `grammar-${id++}`,
          from,
          to,
          type: 'grammar',
          severity: 'warning',
          message,
          replacement: typeof replacement === 'function' ? replacement(match[0]) : replacement || null,
          originalText: match[0],
        });
      }
    }

    // 5. Passive voice (simplified check)
    const passiveMatch = sentence.match(/\b(was|were|is|are|been|being)\s+\w+ed\b/i);
    if (passiveMatch && passiveMatch.index !== undefined) {
      issues.push({
        id: `grammar-${id++}`,
        from: offset + passiveMatch.index,
        to: offset + passiveMatch.index + passiveMatch[0].length,
        type: 'style',
        severity: 'info',
        message: 'Consider using active voice',
        replacement: null,
        originalText: passiveMatch[0],
      });
    }

    // 6. Very long sentences (>40 words)
    if (words.length > 40) {
      issues.push({
        id: `grammar-${id++}`,
        from: offset,
        to: offset + sentence.length,
        type: 'clarity',
        severity: 'info',
        message: `Long sentence (${words.length} words). Consider breaking it up.`,
        replacement: null,
        originalText: sentence.slice(0, 50) + '...',
      });
    }

    offset += sentence.length + 1;
  }

  return issues;
}

// ── Tiptap Extension ──

export const AIGrammarChecker = Extension.create({
  name: 'aiGrammarChecker',

  addProseMirrorPlugins() {
    const editor = this.editor;

    return [
      new Plugin({
        key: grammarKey,
        state: {
          init: (): GrammarState => ({
            issues: [],
            lastChecked: 0,
            isChecking: false,
          }),
          apply: (tr, value): GrammarState => {
            const meta = tr.getMeta(grammarKey);
            if (meta) {
              if (meta.action === 'setIssues') {
                return {
                  ...value,
                  issues: meta.issues,
                  lastChecked: Date.now(),
                  isChecking: false,
                };
              }
              if (meta.action === 'setChecking') {
                return {...value, isChecking: meta.isChecking};
              }
              if (meta.action === 'clearIssues') {
                return {...value, issues: []};
              }
            }

            // Re-check on document change
            if (tr.docChanged) {
              return {...value, issues: []};
            }

            return value;
          },
        },
        props: {
          decorations: (state) => {
            const pluginState = grammarKey.getState(state);
            if (!pluginState || pluginState.issues.length === 0) {
              return DecorationSet.empty;
            }

            const decorations: Decoration[] = [];

            for (const issue of pluginState.issues) {
              // Underline decoration
              const className = issue.severity === 'error'
                ? 'grammar-error'
                : issue.severity === 'warning'
                  ? 'grammar-warning'
                  : 'grammar-info';

              decorations.push(
                Decoration.inline(issue.from, issue.to, {
                  class: className,
                  'data-grammar-id': issue.id,
                  title: issue.message,
                })
              );

              // Tooltip widget
              const tooltip = document.createElement('span');
              tooltip.className = 'grammar-tooltip';
              tooltip.innerHTML = `
                <span class="grammar-tooltip-message">${issue.message}</span>
                ${issue.replacement
                  ? `<button class="grammar-fix-btn" data-id="${issue.id}">Fix → "${issue.replacement}"</button>`
                  : ''}
                <button class="grammar-dismiss-btn" data-id="${issue.id}">Dismiss</button>
              `;

              // Event listeners
              const fixBtn = tooltip.querySelector('.grammar-fix-btn');
              if (fixBtn) {
                fixBtn.addEventListener('mousedown', (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  // Apply fix
                  const tr = editor.state.tr.replaceWith(
                    issue.from,
                    issue.to,
                    editor.state.schema.text(issue.replacement!)
                  );
                  tr.setMeta(grammarKey, {
                    action: 'clearIssues',
                  });
                  editor.view.dispatch(tr);
                });
              }

              const dismissBtn = tooltip.querySelector('.grammar-dismiss-btn');
              if (dismissBtn) {
                dismissBtn.addEventListener('mousedown', (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const tr = editor.state.tr.setMeta(grammarKey, {
                    action: 'setIssues',
                    issues: pluginState.issues.filter(i => i.id !== issue.id),
                  });
                  editor.view.dispatch(tr);
                });
              }

              decorations.push(
                Decoration.widget(issue.to, tooltip, {side: 1})
              );
            }

            return DecorationSet.create(state.doc, decorations);
          },
        },
        view: () => ({
          update: (view) => {
            const state = grammarKey.getState(view.state);
            if (!state || state.isChecking) return;

            // Debounce: only check after user stops typing for 2s
            const now = Date.now();
            if (now - state.lastChecked < 2000) return;

            const text = view.state.doc.textContent;
            const issues = checkLocalGrammar(text, 0);

            const tr = view.state.tr.setMeta(grammarKey, {
              action: 'setIssues',
              issues,
            });
            view.dispatch(tr);
          },
        }),
      }),
    ];
  },
});

// ── Grammar check command (for AI-powered deep check) ──

export async function runAIGrammarCheck(editor: any): Promise<GrammarIssue[]> {
  const text = editor.state.doc.textContent;
  if (text.length < 20) return [];

  try {
    const resp = await fetch('/api/ai', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        action: 'grammar-check',
        payload: {text: text.slice(0, 5000)},
      }),
    });

    if (!resp.ok) return [];
    const data = await resp.json();
    return data.issues || [];
  } catch {
    return [];
  }
}

/**
 * Tiptap AI Extensions for Anvil Docs
 *
 * - AIRewriteExtension: Highlight text → AI rewrite
 * - AISuggestExtension: Inline grayed-text suggestions (accept/reject)
 * - AICommandsExtension: /ai draft, /ai research commands
 */

import {Extension, Editor, Range} from '@tiptap/core';
import {Plugin, PluginKey, Transaction} from '@tiptap/pm/state';
import {Decoration, DecorationSet} from '@tiptap/pm/view';
import {Node as PMNode} from '@tiptap/pm/model';

// ── AI Suggestion State ──

export interface AISuggestion {
  id: string;
  from: number;
  to: number;
  text: string;
  originalText: string;
  type: 'rewrite' | 'inline' | 'draft' | 'research';
  status: 'pending' | 'accepted' | 'rejected';
}

interface AIExtensionState {
  suggestions: AISuggestion[];
  activeSuggestion: string | null;
  isLoading: boolean;
}

const aiPluginKey = new PluginKey<AIExtensionState>('ai-extension');

// ── AI API Client ──

async function callAI(action: string, payload: Record<string, unknown>): Promise<any> {
  const resp = await fetch('/api/ai', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({action, payload}),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({error: 'AI request failed'}));
    throw new Error(err.error || 'AI request failed');
  }
  return resp.json();
}

// ── Utility: get selected text from editor ──

function getSelectedText(editor: Editor): {text: string; from: number; to: number} | null {
  const {from, to, empty} = editor.state.selection;
  if (empty) return null;
  return {text: editor.state.doc.textBetween(from, to, '\n'), from, to};
}

// ── Extension: AI Rewrite ──

export interface AIRewriteOptions {
  /** Debounce ms for inline suggestions */
  suggestionDebounce?: number;
}

export const AIRewrite = Extension.create<AIRewriteOptions>({
  name: 'aiRewrite',

  addOptions() {
    return {suggestionDebounce: 1500};
  },

  addCommands() {
    return {
      aiRewrite: (mode: 'shorter' | 'formal' | 'casual' | 'fix-grammar' | 'longer' | 'bullet-points') =>
        async ({editor, tr}) => {
          const selection = getSelectedText(editor);
          if (!selection) return false;

          // Store original for potential undo
          const {text, from, to} = selection;

          try {
            // Get document context for better rewrites
            const fullText = editor.state.doc.textContent.slice(0, 3000);
            const result = await callAI('rewrite', {text, mode, context: fullText});

            // Replace selection with rewritten text
            editor.chain().focus()
              .deleteRange({from, to})
              .insertContentAt(from, result.text)
              .run();

            return true;
          } catch (err) {
            console.error('AI rewrite failed:', err);
            return false;
          }
        },

      aiDraft: (description: string, documentType?: string, tone?: string) =>
        async ({editor}) => {
          try {
            const result = await callAI('draft', {
              description,
              documentType: documentType || 'general',
              tone: tone || 'professional',
              context: editor.state.doc.textContent.slice(0, 1000),
            });

            // Insert at cursor or end of document
            const pos = editor.state.selection.empty
              ? editor.state.doc.content.size
              : editor.state.selection.from;

            editor.chain().focus()
              .insertContentAt(pos, result.html)
              .run();

            return true;
          } catch (err) {
            console.error('AI draft failed:', err);
            return false;
          }
        },

      aiResearch: (query: string, workspaceDocs?: Array<{id: string; title: string; content: string}>) =>
        async ({editor}) => {
          try {
            const result = await callAI('research', {query, workspaceDocs});

            // Build formatted research block
            let html = '<blockquote><p><strong>Research: ' + query + '</strong></p>';
            for (const r of result.results) {
              html += `<p>${r.text}</p>`;
              html += `<p><em>Source: ${r.source}</em></p>`;
            }
            html += '</blockquote>';

            const pos = editor.state.selection.empty
              ? editor.state.doc.content.size
              : editor.state.selection.from;

            editor.chain().focus()
              .insertContentAt(pos, html)
              .run();

            return true;
          } catch (err) {
            console.error('AI research failed:', err);
            return false;
          }
        },

      aiTranslate: (targetLanguage: string) =>
        async ({editor}) => {
          const selection = getSelectedText(editor);
          if (!selection) return false;

          const {text, from, to} = selection;
          const hasHtml = text.includes('<');

          try {
            const result = await callAI('translate', {
              text,
              targetLanguage,
              preserveFormatting: hasHtml,
            });

            editor.chain().focus()
              .deleteRange({from, to})
              .insertContentAt(from, result.translatedText)
              .run();

            return true;
          } catch (err) {
            console.error('AI translate failed:', err);
            return false;
          }
        },

      aiSuggest: () =>
        async ({editor}) => {
          const {from} = editor.state.selection;
          const textBefore = editor.state.doc.textBetween(
            Math.max(0, from - 500), from, '\n'
          );
          const textAfter = editor.state.doc.textBetween(
            from, Math.min(editor.state.doc.content.size, from + 500), '\n'
          );

          try {
            const result = await callAI('suggest', {
              textBefore,
              textAfter,
              documentContext: editor.state.doc.textContent.slice(0, 3000),
            });

            if (result.suggestion) {
              // Store suggestion in plugin state for inline display
              const pluginState = aiPluginKey.getState(editor.state);
              if (pluginState) {
                const newSuggestion: AISuggestion = {
                  id: `sug-${Date.now()}`,
                  from,
                  to: from,
                  text: result.suggestion,
                  originalText: '',
                  type: 'inline',
                  status: 'pending',
                };
                // Dispatch transaction to update state
                const tr = editor.state.tr.setMeta(aiPluginKey, {
                  action: 'addSuggestion',
                  suggestion: newSuggestion,
                });
                editor.view.dispatch(tr);
              }
            }
            return true;
          } catch (err) {
            console.error('AI suggest failed:', err);
            return false;
          }
        },

      aiAcceptSuggestion: (suggestionId?: string) =>
        ({editor}) => {
          const pluginState = aiPluginKey.getState(editor.state);
          if (!pluginState) return false;

          const suggestion = suggestionId
            ? pluginState.suggestions.find(s => s.id === suggestionId)
            : pluginState.suggestions.find(s => s.status === 'pending');

          if (!suggestion) return false;

          // Insert suggestion text
          editor.chain().focus()
            .insertContentAt(suggestion.to, suggestion.text)
            .run();

          // Remove from state
          const tr = editor.state.tr.setMeta(aiPluginKey, {
            action: 'removeSuggestion',
            id: suggestion.id,
          });
          editor.view.dispatch(tr);
          return true;
        },

      aiRejectSuggestion: (suggestionId?: string) =>
        ({editor}) => {
          const pluginState = aiPluginKey.getState(editor.state);
          if (!pluginState) return false;

          const id = suggestionId || pluginState.suggestions.find(s => s.status === 'pending')?.id;
          if (!id) return false;

          const tr = editor.state.tr.setMeta(aiPluginKey, {
            action: 'removeSuggestion',
            id,
          });
          editor.view.dispatch(tr);
          return true;
        },

      aiGenerateTitle: () =>
        async ({editor}) => {
          try {
            const content = editor.getHTML();
            const result = await callAI('title', {content});
            return result;
          } catch (err) {
            console.error('AI title generation failed:', err);
            return null;
          }
        },

      aiGenerateSummary: () =>
        async ({editor}) => {
          try {
            const content = editor.getHTML();
            const result = await callAI('summary', {content});
            return result;
          } catch (err) {
            console.error('AI summary generation failed:', err);
            return null;
          }
        },

      aiGenerateTemplate: (type: string, description?: string) =>
        async ({editor}) => {
          try {
            const result = await callAI('template', {
              type,
              description,
              context: editor.state.doc.textContent.slice(0, 500),
            });

            editor.chain().focus()
              .setContent(result.html)
              .run();

            return result.suggestedTitle;
          } catch (err) {
            console.error('AI template generation failed:', err);
            return null;
          }
        },
    };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;

    return [
      new Plugin({
        key: aiPluginKey,
        state: {
          init: (): AIExtensionState => ({
            suggestions: [],
            activeSuggestion: null,
            isLoading: false,
          }),
          apply: (tr, value): AIExtensionState => {
            const meta = tr.getMeta(aiPluginKey);
            if (!meta) return value;

            switch (meta.action) {
              case 'addSuggestion':
                return {
                  ...value,
                  suggestions: [...value.suggestions, meta.suggestion],
                  activeSuggestion: meta.suggestion.id,
                };
              case 'removeSuggestion':
                return {
                  ...value,
                  suggestions: value.suggestions.filter(s => s.id !== meta.id),
                  activeSuggestion: value.activeSuggestion === meta.id ? null : value.activeSuggestion,
                };
              case 'setLoading':
                return {...value, isLoading: meta.isLoading};
              case 'clearAll':
                return {...value, suggestions: [], activeSuggestion: null};
              default:
                return value;
            }
          },
        },
        props: {
          decorations: (state) => {
            const pluginState = aiPluginKey.getState(state);
            if (!pluginState || pluginState.suggestions.length === 0) {
              return DecorationSet.empty;
            }

            const decorations: Decoration[] = [];
            for (const suggestion of pluginState.suggestions) {
              if (suggestion.status !== 'pending' || suggestion.type !== 'inline') continue;
              if (!suggestion.text) continue;

              // Create inline suggestion decoration (ghost text)
              const widget = document.createElement('span');
              widget.className = 'ai-suggestion-inline';
              widget.style.cssText = 'color: #9ca3af; font-style: italic; cursor: pointer;';
              widget.textContent = suggestion.text;
              widget.dataset.suggestionId = suggestion.id;

              widget.addEventListener('click', () => {
                editor.commands.aiAcceptSuggestion(suggestion.id);
              });

              decorations.push(
                Decoration.widget(suggestion.to, widget, {side: 1})
              );
            }

            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});

// ── Keyboard Shortcuts Extension ──

export const AIShortcuts = Extension.create({
  name: 'aiShortcuts',

  addKeyboardShortcuts() {
    return {
      'Mod-Shift-a': () => {
        // Accept inline suggestion
        const pluginState = aiPluginKey.getState(this.editor.state);
        if (pluginState?.suggestions.some(s => s.status === 'pending')) {
          return this.editor.commands.aiAcceptSuggestion();
        }
        return false;
      },
      'Escape': () => {
        // Reject inline suggestion
        const pluginState = aiPluginKey.getState(this.editor.state);
        if (pluginState?.activeSuggestion) {
          return this.editor.commands.aiRejectSuggestion();
        }
        return false;
      },
    };
  },
});

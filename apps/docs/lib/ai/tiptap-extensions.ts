/**
 * Tiptap AI Extensions for Anvil Docs — Enhanced with Streaming
 *
 * - AIRewriteExtension: Highlight text → AI rewrite (with streaming)
 * - AISuggestExtension: Inline grayed-text suggestions (accept/reject, animated)
 * - AICommandsExtension: /ai draft, /ai research commands
 * - Streaming support: text appears character by character as AI generates
 */

import {Extension, Editor} from '@tiptap/core';
import {Plugin, PluginKey} from '@tiptap/pm/state';
import {Decoration, DecorationSet} from '@tiptap/pm/view';

// ── AI Suggestion State ──

export interface AISuggestion {
  id: string;
  from: number;
  to: number;
  text: string;
  originalText: string;
  type: 'rewrite' | 'inline' | 'draft' | 'research' | 'streaming';
  status: 'pending' | 'accepted' | 'rejected' | 'streaming';
  progress?: number; // 0-1 for streaming progress
}

interface AIExtensionState {
  suggestions: AISuggestion[];
  activeSuggestion: string | null;
  isLoading: boolean;
  streamingText: string | null;
  streamingPosition: number | null;
}

const aiPluginKey = new PluginKey<AIExtensionState>('ai-extension');

// ── AI API Clients ──

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

/**
 * Stream AI response, calling onChunk for each delta.
 * Returns the full accumulated text.
 */
async function streamAI(
  action: string,
  payload: Record<string, unknown>,
  onChunk: (delta: string, accumulated: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const resp = await fetch('/api/ai/streaming', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({action, payload}),
    signal,
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({error: 'Stream failed'}));
    throw new Error(err.error || 'Stream failed');
  }

  const reader = resp.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';
  let accumulated = '';

  while (true) {
    const {done, value} = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, {stream: true});
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = JSON.parse(line.slice(6));
      if (data.type === 'delta' && data.text) {
        accumulated += data.text;
        onChunk(data.text, accumulated);
      } else if (data.type === 'error') {
        throw new Error(data.error);
      }
    }
  }

  return accumulated;
}

// ── Utility: get selected text from editor ──

function getSelectedText(editor: Editor): {text: string; from: number; to: number} | null {
  const {from, to, empty} = editor.state.selection;
  if (empty) return null;
  return {text: editor.state.doc.textBetween(from, to, '\n'), from, to};
}

// ── Active abort controller for cancellation ──

let activeStreamController: AbortController | null = null;

// ── Extension: AI Rewrite with Streaming ──

export interface AIRewriteOptions {
  /** Debounce ms for inline suggestions */
  suggestionDebounce?: number;
  /** Use streaming for rewrite operations */
  streaming?: boolean;
}

export const AIRewrite = Extension.create<AIRewriteOptions>({
  name: 'aiRewrite',

  addOptions() {
    return {suggestionDebounce: 1500, streaming: true};
  },

  // @ts-expect-error — custom AI commands extend RawCommands
  addCommands() {
    return {
      aiRewrite: (mode: 'shorter' | 'formal' | 'casual' | 'fix-grammar' | 'longer' | 'bullet-points') =>
        async ({editor, tr}) => {
          const selection = getSelectedText(editor);
          if (!selection) return false;

          const {text, from, to} = selection;
          const fullText = editor.state.doc.textContent.slice(0, 3000);
          const useStreaming = this.options.streaming;

          // Set loading state
          const loadingTr = editor.state.tr.setMeta(aiPluginKey, {
            action: 'setLoading',
            isLoading: true,
          });
          editor.view.dispatch(loadingTr);

          try {
            if (useStreaming) {
              // Cancel any existing stream
              activeStreamController?.abort();
              activeStreamController = new AbortController();

              // Show streaming placeholder
              const streamSuggestion: AISuggestion = {
                id: `stream-${Date.now()}`,
                from,
                to,
                text: '',
                originalText: text,
                type: 'streaming',
                status: 'streaming',
                progress: 0,
              };

              const sugTr = editor.state.tr.setMeta(aiPluginKey, {
                action: 'addSuggestion',
                suggestion: streamSuggestion,
              });
              editor.view.dispatch(sugTr);

              const result = await streamAI(
                'rewrite',
                {text, mode, context: fullText},
                (delta, accumulated) => {
                  // Update the streaming suggestion text
                  const pluginState = aiPluginKey.getState(editor.state);
                  if (pluginState) {
                    const suggestion = pluginState.suggestions.find(
                      s => s.id === streamSuggestion.id
                    );
                    if (suggestion) {
                      suggestion.text = accumulated;
                      suggestion.progress = Math.min(accumulated.length / (text.length * 1.5), 1);
                      // Trigger a re-render of decorations
                      const updateTr = editor.state.tr.setMeta(aiPluginKey, {
                        action: 'updateSuggestion',
                        id: streamSuggestion.id,
                        text: accumulated,
                      });
                      editor.view.dispatch(updateTr);
                    }
                  }
                },
                activeStreamController.signal,
              );

              // Replace selection with final result
              editor.chain().focus()
                .deleteRange({from, to})
                .insertContentAt(from, result)
                .run();

              // Remove streaming suggestion
              const cleanupTr = editor.state.tr.setMeta(aiPluginKey, {
                action: 'removeSuggestion',
                id: streamSuggestion.id,
              });
              editor.view.dispatch(cleanupTr);
            } else {
              // Non-streaming fallback
              const result = await callAI('rewrite', {text, mode, context: fullText});
              editor.chain().focus()
                .deleteRange({from, to})
                .insertContentAt(from, result.text)
                .run();
            }

            return true;
          } catch (err: any) {
            if (err.name === 'AbortError') return false;
            console.error('AI rewrite failed:', err);
            return false;
          } finally {
            activeStreamController = null;
            const doneTr = editor.state.tr.setMeta(aiPluginKey, {
              action: 'setLoading',
              isLoading: false,
            });
            editor.view.dispatch(doneTr);
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

      aiDraftStreaming: (description: string, documentType?: string, tone?: string) =>
        async ({editor}) => {
          try {
            activeStreamController?.abort();
            activeStreamController = new AbortController();

            const pos = editor.state.selection.empty
              ? editor.state.doc.content.size
              : editor.state.selection.from;

            const result = await streamAI(
              'draft',
              {
                description,
                documentType: documentType || 'general',
                tone: tone || 'professional',
                context: editor.state.doc.textContent.slice(0, 1000),
              },
              (_delta, accumulated) => {
                // Live-update the content as it streams in
                // We replace from the insertion point each time
                const currentSize = editor.state.doc.content.size;
                editor.chain()
                  .deleteRange({from: pos, to: Math.min(pos + accumulated.length + 100, currentSize)})
                  .insertContentAt(pos, accumulated)
                  .run();
              },
              activeStreamController.signal,
            );

            // Final replacement with complete text
            return true;
          } catch (err: any) {
            if (err.name === 'AbortError') return false;
            console.error('AI draft streaming failed:', err);
            return false;
          } finally {
            activeStreamController = null;
          }
        },

      aiResearch: (query: string, workspaceDocs?: Array<{id: string; title: string; content: string}>) =>
        async ({editor}) => {
          try {
            const result = await callAI('research', {query, workspaceDocs});

            // Build formatted research block with proper citation formatting
            let html = '<div class="ai-research-block">';
            html += `<div class="ai-research-header"><strong>📚 Research: ${query}</strong></div>`;

            for (let i = 0; i < result.results.length; i++) {
              const r = result.results[i];
              html += `<div class="ai-research-result">`;
              html += `<p class="ai-research-text">${r.text}</p>`;
              html += `<div class="ai-research-citation">`;
              html += `<span class="ai-citation-marker">[${i + 1}]</span> `;
              html += `<span class="ai-citation-source">${r.source}</span>`;
              html += ` · <span class="ai-citation-relevance">Relevance: ${Math.round(r.relevance * 100)}%</span>`;
              html += `</div>`;
              html += `</div>`;
            }

            html += '</div>';

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
        async ({editor}: {editor: Editor}) => {
          const {from} = editor.state.selection;
          const textBefore = editor.state.doc.textBetween(
            Math.max(0, from - 500), from, '\n'
          );
          const textAfter = editor.state.doc.textBetween(
            from, Math.min(editor.state.doc.content.size, from + 500), '\n'
          );

          try {
            // Use streaming for inline suggestions
            activeStreamController?.abort();
            activeStreamController = new AbortController();

            const newSuggestion: AISuggestion = {
              id: `sug-${Date.now()}`,
              from,
              to: from,
              text: '',
              originalText: '',
              type: 'inline',
              status: 'streaming',
            };

            // Add empty suggestion first
            const sugTr = editor.state.tr.setMeta(aiPluginKey, {
              action: 'addSuggestion',
              suggestion: newSuggestion,
            });
            editor.view.dispatch(sugTr);

            const result = await streamAI(
              'suggest',
              {
                textBefore,
                textAfter,
                documentContext: editor.state.doc.textContent.slice(0, 3000),
              },
              (_delta, accumulated) => {
                // Update suggestion text as it streams in
                const pluginState = aiPluginKey.getState(editor.state);
                if (pluginState) {
                  const suggestion = pluginState.suggestions.find(s => s.id === newSuggestion.id);
                  if (suggestion) {
                    suggestion.text = accumulated;
                    suggestion.status = 'streaming';
                    const updateTr = editor.state.tr.setMeta(aiPluginKey, {
                      action: 'updateSuggestion',
                      id: newSuggestion.id,
                      text: accumulated,
                    });
                    editor.view.dispatch(updateTr);
                  }
                }
              },
              activeStreamController.signal,
            );

            // Mark as pending (ready to accept/reject)
            const finalTr = editor.state.tr.setMeta(aiPluginKey, {
              action: 'updateSuggestion',
              id: newSuggestion.id,
              text: result,
              status: 'pending',
            });
            editor.view.dispatch(finalTr);

            return true;
          } catch (err: any) {
            if (err.name === 'AbortError') return false;
            console.error('AI suggest failed:', err);
            return false;
          } finally {
            activeStreamController = null;
          }
        },

      aiAcceptSuggestion: (suggestionId?: string) =>
        ({editor}: {editor: Editor}) => {
          const pluginState = aiPluginKey.getState(editor.state);
          if (!pluginState) return false;

          const suggestion = suggestionId
            ? pluginState.suggestions.find((s: AISuggestion) => s.id === suggestionId)
            : pluginState.suggestions.find((s: AISuggestion) => s.status === 'pending');

          if (!suggestion || !suggestion.text) return false;

          editor.chain().focus()
            .insertContentAt(suggestion.to, suggestion.text)
            .run();

          const tr = editor.state.tr.setMeta(aiPluginKey, {
            action: 'removeSuggestion',
            id: suggestion.id,
          });
          editor.view.dispatch(tr);
          return true;
        },

      aiRejectSuggestion: (suggestionId?: string) =>
        ({editor}: {editor: Editor}) => {
          const pluginState = aiPluginKey.getState(editor.state);
          if (!pluginState) return false;

          const id = suggestionId || pluginState.suggestions.find((s: AISuggestion) => s.status === 'pending')?.id;
          if (!id) return false;

          const tr = editor.state.tr.setMeta(aiPluginKey, {
            action: 'removeSuggestion',
            id,
          });
          editor.view.dispatch(tr);
          return true;
        },

      aiCancelStream: () =>
        () => {
          activeStreamController?.abort();
          activeStreamController = null;
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
            streamingText: null,
            streamingPosition: null,
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
              case 'updateSuggestion':
                return {
                  ...value,
                  suggestions: value.suggestions.map(s =>
                    s.id === meta.id
                      ? {...s, text: meta.text !== undefined ? meta.text : s.text, status: meta.status || s.status}
                      : s
                  ),
                };
              case 'removeSuggestion':
                return {
                  ...value,
                  suggestions: value.suggestions.filter(s => s.id !== meta.id),
                  activeSuggestion: value.activeSuggestion === meta.id ? null : value.activeSuggestion,
                };
              case 'setLoading':
                return {...value, isLoading: meta.isLoading};
              case 'setStreaming':
                return {
                  ...value,
                  streamingText: meta.text,
                  streamingPosition: meta.position,
                };
              case 'clearAll':
                return {
                  ...value,
                  suggestions: [],
                  activeSuggestion: null,
                  streamingText: null,
                  streamingPosition: null,
                };
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
              if (suggestion.status === 'accepted' || suggestion.status === 'rejected') continue;
              if (suggestion.type !== 'inline' && suggestion.type !== 'streaming') continue;
              if (!suggestion.text) continue;

              // Create inline suggestion decoration (ghost text)
              const widget = document.createElement('span');
              widget.className = `ai-suggestion-inline ${suggestion.status === 'streaming' ? 'ai-suggestion-streaming' : ''}`;
              widget.textContent = suggestion.text;
              widget.dataset.suggestionId = suggestion.id;

              // Streaming cursor animation
              if (suggestion.status === 'streaming') {
                const cursor = document.createElement('span');
                cursor.className = 'ai-streaming-cursor-inline';
                cursor.textContent = '▊';
                widget.appendChild(cursor);
              }

              widget.addEventListener('click', () => {
                (editor.commands as any).aiAcceptSuggestion(suggestion.id);
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
        const pluginState = aiPluginKey.getState(this.editor.state);
        if (pluginState?.suggestions.some(s => s.status === 'pending')) {
          return (this.editor.commands as any).aiAcceptSuggestion();
        }
        return false;
      },
      'Escape': () => {
        const pluginState = aiPluginKey.getState(this.editor.state);
        if (pluginState?.activeSuggestion) {
          // Cancel streaming if active
          if (pluginState.suggestions.some(s => s.status === 'streaming')) {
            (this.editor.commands as any).aiCancelStream();
          }
          return (this.editor.commands as any).aiRejectSuggestion();
        }
        return false;
      },
      'Mod-Shift-r': () => {
        // Quick rewrite (better mode)
        const selection = getSelectedText(this.editor);
        if (selection) {
          (this.editor.commands as any).aiRewrite('fix-grammar');
          return true;
        }
        return false;
      },
    };
  },
});

'use client';

/**
 * AI Quick Actions Bar
 *
 * Context-sensitive floating toolbar that appears when:
 * - Text is selected (rewrite, translate, explain actions)
 * - Cursor is at end of paragraph (suggest, continue actions)
 * - On an empty line (draft, template actions)
 *
 * Uses ProseMirror decorations to render inline.
 */

import {Extension} from '@tiptap/core';
import {Plugin, PluginKey} from '@tiptap/pm/state';
import {Decoration, DecorationSet} from '@tiptap/pm/view';

const quickActionsKey = new PluginKey('ai-quick-actions');

export interface QuickActionContext {
  type: 'selection' | 'cursor-end' | 'empty-line';
  from: number;
  to: number;
  text?: string;
}

export const AIQuickActions = Extension.create({
  name: 'aiQuickActions',

  addProseMirrorPlugins() {
    const editor = this.editor;

    return [
      new Plugin({
        key: quickActionsKey,
        state: {
          init: () => ({show: false, context: null as QuickActionContext | null}),
          apply: (tr, value) => {
            // Reset on selection change
            if (tr.selection || tr.docChanged) {
              const {from, to, empty} = tr.selection;

              if (!empty) {
                // Text is selected
                const text = tr.doc.textBetween(from, to, '\n');
                return {
                  show: true,
                  context: {
                    type: 'selection',
                    from,
                    to,
                    text,
                  } as QuickActionContext,
                };
              }

              // Check if cursor is at end of paragraph
              const $pos = tr.selection.$from;
              const isEndOfParagraph = $pos.parentOffset === $pos.parent.content.size - 1
                || $pos.parentOffset === $pos.parent.content.size;
              const isParagraphEmpty = $pos.parent.content.size === 0;

              if (isParagraphEmpty) {
                return {
                  show: true,
                  context: {
                    type: 'empty-line',
                    from,
                    to: from,
                  } as QuickActionContext,
                };
              }

              if (isEndOfParagraph) {
                const textBefore = tr.doc.textBetween(
                  Math.max(0, $pos.start()), from, '\n'
                );
                return {
                  show: true,
                  context: {
                    type: 'cursor-end',
                    from,
                    to: from,
                    text: textBefore,
                  } as QuickActionContext,
                };
              }
            }

            return {show: false, context: null};
          },
        },
        props: {
          decorations: (state) => {
            const pluginState = quickActionsKey.getState(state);
            if (!pluginState?.show || !pluginState.context) {
              return DecorationSet.empty;
            }

            const {context} = pluginState;
            const pos = context.type === 'selection' ? context.to : context.from;

            // Create the floating action bar widget
            const widget = document.createElement('div');
            widget.className = 'ai-quick-actions-bar';
            widget.contentEditable = 'false';

            const actions = getActionsForContext(context);

            for (const action of actions) {
              const btn = document.createElement('button');
              btn.className = 'ai-quick-action-btn';
              btn.textContent = action.label;
              btn.title = action.description;
              btn.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                action.execute(editor, context);
              });
              widget.appendChild(btn);
            }

            return DecorationSet.create(state.doc, [
              Decoration.widget(pos, widget, {side: 1, key: 'ai-quick-actions'}),
            ]);
          },
        },
      }),
    ];
  },
});

// ── Action Definitions ──

interface QuickAction {
  label: string;
  description: string;
  icon: string;
  execute: (editor: any, context: QuickActionContext) => void;
}

function getActionsForContext(context: QuickActionContext): QuickAction[] {
  switch (context.type) {
    case 'selection':
      return [
        {
          label: '✨ Rewrite',
          description: 'AI rewrite selected text',
          icon: '🔄',
          execute: (editor) => {
            (editor.commands as any).aiRewrite('improve');
          },
        },
        {
          label: '📝 Shorter',
          description: 'Make text more concise',
          icon: '↓',
          execute: (editor) => {
            (editor.commands as any).aiRewrite('shorter');
          },
        },
        {
          label: '👔 Formal',
          description: 'Make text more professional',
          icon: '👔',
          execute: (editor) => {
            (editor.commands as any).aiRewrite('formal');
          },
        },
        {
          label: '🌐 Translate',
          description: 'Translate to another language',
          icon: '🌐',
          execute: (editor) => {
            // Dispatch event to open translate panel
            editor.view.dispatch(
              editor.state.tr.setMeta('ai-command', {action: 'translate'})
            );
          },
        },
        {
          label: '📖 Explain',
          description: 'Explain in plain language',
          icon: '📖',
          execute: (editor, ctx) => {
            editor.view.dispatch(
              editor.state.tr.setMeta('ai-command', {
                action: 'explain',
                text: ctx.text,
              })
            );
          },
        },
      ];

    case 'cursor-end':
      return [
        {
          label: '💡 Suggest',
          description: 'Get AI suggestion',
          icon: '💡',
          execute: (editor) => {
            (editor.commands as any).aiSuggest();
          },
        },
        {
          label: '⏩ Continue',
          description: 'AI continues writing',
          icon: '⏩',
          execute: (editor) => {
            editor.view.dispatch(
              editor.state.tr.setMeta('ai-command', {action: 'continue'})
            );
          },
        },
      ];

    case 'empty-line':
      return [
        {
          label: '✍️ Draft',
          description: 'Describe what to write',
          icon: '✍️',
          execute: (editor) => {
            editor.view.dispatch(
              editor.state.tr.setMeta('ai-command', {action: 'draft'})
            );
          },
        },
        {
          label: '🔍 Research',
          description: 'Search and insert findings',
          icon: '🔍',
          execute: (editor) => {
            editor.view.dispatch(
              editor.state.tr.setMeta('ai-command', {action: 'research'})
            );
          },
        },
      ];

    default:
      return [];
  }
}

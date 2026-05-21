/**
 * AI Slash Command Plugin for Tiptap
 *
 * Registers a floating command menu triggered by "/ai" that provides:
 * - /ai draft — Describe what you want, AI writes it
 * - /ai rewrite — Rewrite selected text (shorter/formal/casual/fix grammar/expand/bullets)
 * - /ai research — Query workspace, insert results with citations
 * - /ai translate — Translate selected text
 * - /ai suggest — Get inline suggestion at cursor
 * - /ai title — Generate a document title
 * - /ai summarize — Generate a document summary
 * - /ai template — Generate a smart template
 * - /ai improve — Improve clarity and flow of selected text
 * - /ai explain — Explain selected text in plain language
 * - /ai continue — AI continues writing from cursor
 *
 * Uses Tiptap Suggestion extension for the dropdown UI.
 */

import {Extension, Range} from '@tiptap/core';
import Suggestion, {type SuggestionProps, type SuggestionKeyDownProps} from '@tiptap/suggestion';
import {ReactRenderer} from '@tiptap/react';
import tippy, {type Instance as TippyInstance} from 'tippy.js';
import type {Editor} from '@tiptap/core';

// ── Command Definitions ──

export interface AICommand {
  id: string;
  label: string;
  description: string;
  icon: string;
  shortcut?: string;
  requiresSelection?: boolean;
  hasInput?: boolean;
  inputPlaceholder?: string;
}

export const AI_COMMANDS: AICommand[] = [
  {
    id: 'draft',
    label: 'Draft',
    description: 'Describe what you want to write',
    icon: '✍️',
    hasInput: true,
    inputPlaceholder: 'e.g., A project update email about Q3 roadmap delays',
  },
  {
    id: 'rewrite',
    label: 'Rewrite',
    description: 'Rewrite selected text with a specific style',
    icon: '🔄',
    requiresSelection: true,
  },
  {
    id: 'research',
    label: 'Research',
    description: 'Search workspace docs and insert findings with citations',
    icon: '🔍',
    hasInput: true,
    inputPlaceholder: 'e.g., Best practices for microservices architecture',
  },
  {
    id: 'translate',
    label: 'Translate',
    description: 'Translate selected text to another language',
    icon: '🌐',
    requiresSelection: true,
    hasInput: true,
    inputPlaceholder: 'e.g., Spanish, French, Japanese',
  },
  {
    id: 'suggest',
    label: 'Suggest',
    description: 'Get an inline AI suggestion at your cursor position',
    icon: '💡',
  },
  {
    id: 'continue',
    label: 'Continue Writing',
    description: 'AI continues writing from where your cursor is',
    icon: '⏩',
  },
  {
    id: 'improve',
    label: 'Improve',
    description: 'Improve clarity, flow, and readability of selected text',
    icon: '✨',
    requiresSelection: true,
  },
  {
    id: 'explain',
    label: 'Explain',
    description: 'Explain selected text in plain language',
    icon: '📖',
    requiresSelection: true,
  },
  {
    id: 'shorter',
    label: 'Make Shorter',
    description: 'Make selected text more concise',
    icon: '↓',
    requiresSelection: true,
  },
  {
    id: 'formal',
    label: 'Make Formal',
    description: 'Rewrite selected text in professional tone',
    icon: '👔',
    requiresSelection: true,
  },
  {
    id: 'casual',
    label: 'Make Casual',
    description: 'Rewrite selected text in casual, friendly tone',
    icon: '😊',
    requiresSelection: true,
  },
  {
    id: 'fix-grammar',
    label: 'Fix Grammar',
    description: 'Fix grammar, spelling, and punctuation errors',
    icon: '✓',
    requiresSelection: true,
  },
  {
    id: 'bullets',
    label: 'Convert to Bullets',
    description: 'Convert selected text into bullet points',
    icon: '•',
    requiresSelection: true,
  },
  {
    id: 'title',
    label: 'Generate Title',
    description: 'Auto-generate a title for this document',
    icon: '📝',
  },
  {
    id: 'summarize',
    label: 'Summarize',
    description: 'Generate a summary of this document',
    icon: '📋',
  },
  {
    id: 'template',
    label: 'Smart Template',
    description: 'Generate a proposal, report, or meeting notes template',
    icon: '📄',
    hasInput: true,
    inputPlaceholder: 'e.g., Project proposal for a fintech startup',
  },
];

// ── Command Items for Suggestion ──

interface CommandItem {
  command: AICommand;
}

const getItems = (query: string): CommandItem[] => {
  const q = query.toLowerCase();
  return AI_COMMANDS
    .filter(cmd => {
      if (!q) return true;
      return cmd.label.toLowerCase().includes(q)
        || cmd.description.toLowerCase().includes(q)
        || cmd.id.includes(q);
    })
    .map(command => ({command}));
};

// ── Command Renderer Component ──

// We export a render function instead of a React component so the plugin
// stays framework-agnostic at the Tiptap level while still using React.

export function renderCommandItems(): {
  onBeforeStart: (props: SuggestionProps<CommandItem>) => void;
  onStart: (props: SuggestionProps<CommandItem>) => void;
  onUpdate: (props: SuggestionProps<CommandItem>) => void;
  onExit: (props: SuggestionProps<CommandItem>) => void;
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
} {
  let component: ReactRenderer | null = null;
  let popup: TippyInstance[] | null = null;

  const destroy = () => {
    component?.destroy();
    component = null;
    popup?.[0]?.destroy();
    popup = null;
  };

  const getClientCoords = (props: SuggestionProps<CommandItem> | SuggestionKeyDownProps) => {
    if ('clientRect' in props && typeof props.clientRect === 'function') {
      return props.clientRect();
    }
    return null;
  };

  return {
    onBeforeStart(props) {
      // Build DOM directly for zero-dependency rendering
      component = new ReactRenderer(AICommandList, {
        props: {items: props.items, command: props.command},
        editor: props.editor,
      });

      popup = tippy('body', {
        getReferenceClientRect: () => {
          const rect = getClientCoords(props);
          return rect || new DOMRect(0, 0, 0, 0);
        },
        appendTo: () => document.body,
        content: component.element,
        showOnCreate: true,
        interactive: true,
        trigger: 'manual',
        placement: 'bottom-start',
        maxWidth: 380,
        theme: 'ai-commands',
      });
    },

    onStart(props) {
      this.onBeforeStart(props);
    },

    onUpdate(props) {
      component?.updateProps({items: props.items, command: props.command});
      popup?.[0]?.setProps({
        getReferenceClientRect: () => {
          const rect = getClientCoords(props);
          return rect || new DOMRect(0, 0, 0, 0);
        },
      });
    },

    onExit() {
      destroy();
    },

    onKeyDown(props) {
      if (props.event.key === 'Escape') {
        destroy();
        return true;
      }
      return false;
    },
  };
}

// ── AI Command List Component (React) ──

import {useState, useEffect, forwardRef, useImperativeHandle} from 'react';

export interface AICommandListRef {
  onKeyDown: (props: {event: KeyboardEvent}) => boolean;
}

const AICommandList = forwardRef<AICommandListRef, {
  items: CommandItem[];
  command: (item: CommandItem) => void;
}>((props, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
  }, [props.items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({event}) => {
      if (event.key === 'ArrowUp') {
        setSelectedIndex(i => (i - 1 + props.items.length) % props.items.length);
        return true;
      }
      if (event.key === 'ArrowDown') {
        setSelectedIndex(i => (i + 1) % props.items.length);
        return true;
      }
      if (event.key === 'Enter') {
        if (props.items[selectedIndex]) {
          props.command(props.items[selectedIndex]);
        }
        return true;
      }
      return false;
    },
  }));

  if (props.items.length === 0) {
    return (
      <div className="ai-command-menu">
        <div className="ai-command-empty">No matching commands</div>
      </div>
    );
  }

  return (
    <div className="ai-command-menu">
      <div className="ai-command-header">
        <span className="ai-command-header-icon">✨</span>
        <span className="ai-command-header-title">AI Commands</span>
      </div>
      {props.items.map((item, index) => (
        <button
          key={item.command.id}
          className={`ai-command-item ${index === selectedIndex ? 'is-selected' : ''}`}
          onClick={() => props.command(item)}
          onMouseEnter={() => setSelectedIndex(index)}
        >
          <span className="ai-command-icon">{item.command.icon}</span>
          <div className="ai-command-text">
            <div className="ai-command-label">{item.command.label}</div>
            <div className="ai-command-desc">{item.command.description}</div>
          </div>
          {item.command.shortcut && (
            <kbd className="ai-command-shortcut">{item.command.shortcut}</kbd>
          )}
        </button>
      ))}
    </div>
  );
});

AICommandList.displayName = 'AICommandList';

// ── Tiptap Extension ──

export const AISlashCommands = Extension.create({
  name: 'aiSlashCommands',

  addOptions() {
    return {
      suggestion: {
        char: '/ai',
        command: ({
          editor,
          range,
          props,
        }: {
          editor: Editor;
          range: Range;
          props: CommandItem;
        }) => {
          // Delete the "/ai" trigger text
          editor.chain().focus().deleteRange(range).run();

          // Execute the selected command
          const cmd = props.command;
          executeAICommand(editor, cmd);
        },
        items: ({query}: {query: string}) => getItems(query),
        render: renderCommandItems,
        allowSpaces: true,
        startOfLine: false,
        decorationTag: 'span',
        decorationClass: 'ai-slash-trigger',
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});

// ── Command Execution ──

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

function getSelectedText(editor: Editor): {text: string; from: number; to: number} | null {
  const {from, to, empty} = editor.state.selection;
  if (empty) return null;
  return {text: editor.state.doc.textBetween(from, to, '\n'), from, to};
}

function executeAICommand(editor: Editor, cmd: AICommand) {
  const selection = getSelectedText(editor);
  const fullText = editor.state.doc.textContent.slice(0, 3000);

  switch (cmd.id) {
    case 'draft':
      // Open draft input — handled by the editor component via custom event
      editor.view.dispatch(
        editor.state.tr.setMeta('ai-command', {action: 'draft'})
      );
      break;

    case 'rewrite':
    case 'improve':
    case 'shorter':
    case 'formal':
    case 'casual':
    case 'fix-grammar':
    case 'bullets': {
      if (!selection) {
        // Signal no selection
        editor.view.dispatch(
          editor.state.tr.setMeta('ai-command', {
            action: 'error',
            message: 'Select text first',
          })
        );
        return;
      }
      const mode = cmd.id === 'bullets' ? 'bullet-points' : cmd.id;
      (editor.commands as any).aiRewrite(mode);
      break;
    }

    case 'research':
      editor.view.dispatch(
        editor.state.tr.setMeta('ai-command', {action: 'research'})
      );
      break;

    case 'translate':
      editor.view.dispatch(
        editor.state.tr.setMeta('ai-command', {action: 'translate'})
      );
      break;

    case 'suggest':
      (editor.commands as any).aiSuggest();
      break;

    case 'continue': {
      const {from} = editor.state.selection;
      const textBefore = editor.state.doc.textBetween(
        Math.max(0, from - 800), from, '\n'
      );
      callAI('continue', {
        textBefore,
        documentContext: fullText,
      }).then((result: any) => {
        if (result.text) {
          editor.chain().focus().insertContentAt(from, result.text).run();
        }
      }).catch((err: Error) => {
        console.error('AI continue failed:', err);
      });
      break;
    }

    case 'explain': {
      if (!selection) return;
      callAI('explain', {
        text: selection.text,
        context: fullText,
      }).then((result: any) => {
        // Insert explanation as a blockquote
        const html = `<blockquote><p><strong>Explanation:</strong></p><p>${result.explanation}</p></blockquote>`;
        editor.chain().focus()
          .insertContentAt(editor.state.selection.from, html)
          .run();
      }).catch((err: Error) => {
        console.error('AI explain failed:', err);
      });
      break;
    }

    case 'title':
      (editor.commands as any).aiGenerateTitle().then((result: any) => {
        if (result?.title) {
          editor.view.dispatch(
            editor.state.tr.setMeta('ai-command', {
              action: 'title',
              title: result.title,
            })
          );
        }
      });
      break;

    case 'summarize':
      (editor.commands as any).aiGenerateSummary().then((result: any) => {
        if (result?.summary) {
          editor.view.dispatch(
            editor.state.tr.setMeta('ai-command', {
              action: 'summary',
              summary: result.summary,
            })
          );
        }
      });
      break;

    case 'template':
      editor.view.dispatch(
        editor.state.tr.setMeta('ai-command', {action: 'template'})
      );
      break;

    default:
      console.warn('Unknown AI command:', cmd.id);
  }
}

export default AISlashCommands;

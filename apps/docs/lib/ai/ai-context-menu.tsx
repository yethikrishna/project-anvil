'use client';

/**
 * AI Context Menu for Anvil Docs
 *
 * Right-click context menu with AI actions:
 * - Rewrite (shorter/formal/casual)
 * - Translate
 * - Explain
 * - Summarize selection
 * - Continue writing
 * - Find similar in workspace
 * - Generate bullet points
 */

import {useState, useCallback, useEffect, useRef} from 'react';
import type {Editor} from '@tiptap/react';

// ── Types ──

interface ContextMenuPosition {
  x: number;
  y: number;
}

interface ContextMenuAction {
  id: string;
  label: string;
  icon: string;
  description: string;
  shortcut?: string;
  children?: ContextMenuAction[];
}

// ── Menu Actions ──

const AI_MENU_ACTIONS: ContextMenuAction[] = [
  {
    id: 'rewrite',
    label: 'AI Rewrite',
    icon: '✨',
    description: 'Rewrite selected text',
    children: [
      {id: 'rewrite-shorter', label: 'Make Shorter', icon: '📉', description: 'Reduce word count by ~40%'},
      {id: 'rewrite-formal', label: 'Make Formal', icon: '👔', description: 'Professional business tone'},
      {id: 'rewrite-casual', label: 'Make Casual', icon: '😊', description: 'Friendly conversational tone'},
      {id: 'rewrite-grammar', label: 'Fix Grammar', icon: '✅', description: 'Fix grammar and spelling'},
      {id: 'rewrite-bullets', label: 'Bullet Points', icon: '•', description: 'Convert to bullet points'},
    ],
  },
  {id: 'separator-1', label: '', icon: '', description: ''},
  {id: 'translate', label: 'Translate...', icon: '🌐', description: 'Translate to another language', shortcut: '⌘⇧T'},
  {id: 'explain', label: 'Explain This', icon: '💡', description: 'Get an explanation of selected text'},
  {id: 'summarize', label: 'Summarize', icon: '📝', description: 'Summarize the selection'},
  {id: 'separator-2', label: '', icon: '', description: ''},
  {id: 'continue', label: 'Continue Writing', icon: '✏️', description: 'AI continues from cursor', shortcut: '⌘⇧C'},
  {id: 'improve', label: 'Improve Writing', icon: '🔧', description: 'Enhance clarity and flow'},
  {id: 'separator-3', label: '', icon: '', description: ''},
  {id: 'research', label: 'Research Topic', icon: '🔍', description: 'Search workspace for related content'},
  {id: 'find-similar', label: 'Find Similar', icon: '🔗', description: 'Find similar content in workspace'},
];

// ── Component ──

interface AIContextMenuProps {
  editor: Editor | null;
  position: ContextMenuPosition | null;
  onClose: () => void;
}

export function AIContextMenu({editor, position, onClose}: AIContextMenuProps) {
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    if (position) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [position, onClose]);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (position) {
      document.addEventListener('keydown', handleKey);
      return () => document.removeEventListener('keydown', handleKey);
    }
  }, [position, onClose]);

  const handleAction = useCallback(async (actionId: string) => {
    if (!editor || isProcessing) return;

    const {from, to} = editor.state.selection;
    const selectedText = from !== to ? editor.state.doc.textBetween(from, to, '\n') : '';

    setIsProcessing(true);

    try {
      switch (actionId) {
        case 'rewrite-shorter':
        case 'rewrite-formal':
        case 'rewrite-casual':
        case 'rewrite-grammar':
        case 'rewrite-bullets': {
          const modeMap: Record<string, string> = {
            'rewrite-shorter': 'shorter',
            'rewrite-formal': 'formal',
            'rewrite-casual': 'casual',
            'rewrite-grammar': 'fix-grammar',
            'rewrite-bullets': 'bullet-points',
          };
          // Use streaming for rewrite
          const resp = await fetch('/api/ai/streaming', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
              action: 'rewrite',
              payload: {text: selectedText, mode: modeMap[actionId]},
            }),
          });

          if (resp.ok) {
            const reader = resp.body?.getReader();
            if (reader) {
              const decoder = new TextDecoder();
              let fullText = '';
              while (true) {
                const {done, value} = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, {stream: true});
                for (const line of chunk.split('\n')) {
                  if (!line.startsWith('data: ')) continue;
                  try {
                    const data = JSON.parse(line.slice(6));
                    if (data.type === 'delta') fullText += data.text;
                  } catch {}
                }
              }
              editor.chain().focus().insertContentAt({from, to}, fullText).run();
            }
          }
          break;
        }

        case 'translate': {
          // Trigger translation dropdown instead
          onClose();
          window.dispatchEvent(new CustomEvent('anvil:show-translation'));
          return;
        }

        case 'explain':
        case 'summarize': {
          const resp = await fetch('/api/ai', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
              action: actionId === 'explain' ? 'explain' : 'summary',
              payload: {content: selectedText || editor.getHTML()},
            }),
          });

          if (resp.ok) {
            const data = await resp.json();
            // Show as floating tooltip
            const result = data.explanation || data.summary || '';
            if (result) {
              editor.chain().focus().insertContentAt({to, from: to}, `\n\n💡 **AI:** ${result}\n\n`).run();
            }
          }
          break;
        }

        case 'continue': {
          const textBefore = editor.state.doc.textBetween(
            Math.max(0, from - 200), from, '\n'
          );
          const resp = await fetch('/api/ai/streaming', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
              action: 'continue',
              payload: {
                textBefore,
                documentContext: editor.getHTML().slice(-500),
              },
            }),
          });

          if (resp.ok) {
            const reader = resp.body?.getReader();
            if (reader) {
              const decoder = new TextDecoder();
              let fullText = '';
              while (true) {
                const {done, value} = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, {stream: true});
                for (const line of chunk.split('\n')) {
                  if (!line.startsWith('data: ')) continue;
                  try {
                    const data = JSON.parse(line.slice(6));
                    if (data.type === 'delta') fullText += data.text;
                  } catch {}
                }
              }
              editor.chain().focus().insertContent(fullText).run();
            }
          }
          break;
        }

        case 'improve': {
          const resp = await fetch('/api/ai/streaming', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
              action: 'improve',
              payload: {text: selectedText},
            }),
          });

          if (resp.ok) {
            const reader = resp.body?.getReader();
            if (reader) {
              const decoder = new TextDecoder();
              let fullText = '';
              while (true) {
                const {done, value} = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, {stream: true});
                for (const line of chunk.split('\n')) {
                  if (!line.startsWith('data: ')) continue;
                  try {
                    const data = JSON.parse(line.slice(6));
                    if (data.type === 'delta') fullText += data.text;
                  } catch {}
                }
              }
              editor.chain().focus().insertContentAt({from, to}, fullText).run();
            }
          }
          break;
        }

        case 'research': {
          const resp = await fetch('/api/ai', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
              action: 'research',
              payload: {query: selectedText},
            }),
          });

          if (resp.ok) {
            const data = await resp.json();
            if (data.results) {
              const researchHtml = data.results.map((r: any) =>
                `<blockquote><p>${r.text}</p><footer>— ${r.source}</footer></blockquote>`
              ).join('');
              editor.chain().focus().insertContent(researchHtml).run();
            }
          }
          break;
        }

        case 'find-similar': {
          // Use RAG to find similar content
          const resp = await fetch('/api/ai', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
              action: 'research',
              payload: {query: `similar to: ${selectedText}`},
            }),
          });

          if (resp.ok) {
            const data = await resp.json();
            if (data.results) {
              const similarHtml = data.results.map((r: any) =>
                `<p><strong>${r.source}</strong>: ${r.text}</p>`
              ).join('');
              editor.chain().focus().insertContent(`\n${similarHtml}`).run();
            }
          }
          break;
        }
      }
    } catch (err) {
      console.error('Context menu action failed:', err);
    } finally {
      setIsProcessing(false);
      onClose();
    }
  }, [editor, isProcessing, onClose]);

  if (!position) return null;

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-white border border-gray-200 rounded-xl shadow-xl py-1 min-w-[220px]"
      style={{left: position.x, top: position.y}}
    >
      {AI_MENU_ACTIONS.map(action => {
        if (action.id.startsWith('separator')) {
          return <div key={action.id} className="h-px bg-gray-100 my-1" />;
        }

        if (action.children) {
          return (
            <div
              key={action.id}
              className="relative"
              onMouseEnter={() => setActiveSubmenu(action.id)}
              onMouseLeave={() => setActiveSubmenu(null)}
            >
              <button
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
              >
                <span className="w-5 text-center">{action.icon}</span>
                <span className="flex-1 text-left">{action.label}</span>
                <span className="text-gray-300">▸</span>
              </button>

              {activeSubmenu === action.id && (
                <div className="absolute left-full top-0 bg-white border border-gray-200 rounded-xl shadow-xl py-1 min-w-[200px]">
                  {action.children.map(child => (
                    <button
                      key={child.id}
                      onClick={() => handleAction(child.id)}
                      disabled={isProcessing}
                      className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-50 transition-colors"
                    >
                      <span className="w-5 text-center">{child.icon}</span>
                      <div className="text-left">
                        <div>{child.label}</div>
                        <div className="text-[10px] text-gray-400">{child.description}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        }

        return (
          <button
            key={action.id}
            onClick={() => handleAction(action.id)}
            disabled={isProcessing}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-50 transition-colors"
          >
            <span className="w-5 text-center">{action.icon}</span>
            <div className="flex-1 text-left">
              <div>{action.label}</div>
              <div className="text-[10px] text-gray-400">{action.description}</div>
            </div>
            {action.shortcut && (
              <span className="text-[10px] text-gray-300 font-mono">{action.shortcut}</span>
            )}
          </button>
        );
      })}

      {isProcessing && (
        <div className="px-3 py-2 text-xs text-indigo-600 flex items-center gap-2">
          <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          Processing...
        </div>
      )}
    </div>
  );
}

// ── Hook ──

export function useAIContextMenu(editor: Editor | null) {
  const [menuPosition, setMenuPosition] = useState<ContextMenuPosition | null>(null);

  useEffect(() => {
    if (!editor) return;

    const handleContextMenu = (e: MouseEvent) => {
      const {from, to} = editor.state.selection;
      if (from === to) return; // Only show for selections

      e.preventDefault();
      setMenuPosition({x: e.clientX, y: e.clientY});
    };

    const view = editor.view.dom;
    view.addEventListener('contextmenu', handleContextMenu);
    return () => view.removeEventListener('contextmenu', handleContextMenu);
  }, [editor]);

  const closeMenu = useCallback(() => setMenuPosition(null), []);

  return {menuPosition, closeMenu};
}

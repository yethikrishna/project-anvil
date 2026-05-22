'use client';

/**
 * AI Floating Selection Toolbar — Anvil Docs
 *
 * A contextual mini-toolbar that appears inline above any text selection.
 * Provides instant one-click AI actions without opening menus.
 *
 * Features:
 * - Appears ~300ms after text is selected (debounced)
 * - Positioned above the selection, auto-flips if near top of viewport
 * - One-click: Shorter | Formal | Casual | Fix Grammar | Explain | Continue
 * - Shows streaming spinner while AI processes
 * - Dismiss on click-outside or Escape
 * - Keyboard accessible (Tab through actions, Enter to trigger)
 */

import {useState, useEffect, useRef, useCallback} from 'react';
import type {Editor} from '@tiptap/react';

// ── Types ──

interface ToolbarPosition {
  top: number;
  left: number;
  flipped: boolean; // true = appear below selection instead of above
}

interface FloatingAction {
  id: string;
  label: string;
  icon: string;
  tooltip: string;
  mode?: string; // for rewrite actions
  action: 'rewrite' | 'explain' | 'continue' | 'translate';
}

const FLOATING_ACTIONS: FloatingAction[] = [
  {id: 'shorter',   label: '↓ Short',  icon: '↓', tooltip: 'Make shorter (~40% fewer words)', mode: 'shorter',      action: 'rewrite'},
  {id: 'formal',    label: '👔 Formal', icon: '👔', tooltip: 'Make formal/professional',        mode: 'formal',       action: 'rewrite'},
  {id: 'casual',    label: '😊 Casual', icon: '😊', tooltip: 'Make casual/conversational',      mode: 'casual',       action: 'rewrite'},
  {id: 'grammar',   label: '✓ Fix',    icon: '✓', tooltip: 'Fix grammar & spelling',            mode: 'fix-grammar',  action: 'rewrite'},
  {id: 'expand',    label: '↑ Expand', icon: '↑', tooltip: 'Expand with more detail',           mode: 'longer',       action: 'rewrite'},
  {id: 'bullets',   label: '• Bullets',icon: '•', tooltip: 'Convert to bullet points',          mode: 'bullet-points',action: 'rewrite'},
  {id: 'explain',   label: '💡 Explain',icon: '💡', tooltip: 'Explain this in plain language',                        action: 'explain'},
  {id: 'continue',  label: '➤ Continue',icon: '➤', tooltip: 'AI continues writing from here',                        action: 'continue'},
];

async function callAI(action: string, payload: Record<string, unknown>): Promise<{text: string}> {
  const resp = await fetch('/api/ai', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({action, payload}),
  });
  if (!resp.ok) throw new Error('AI request failed');
  return resp.json();
}

// ── Component ──

interface AIFloatingToolbarProps {
  editor: Editor;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export function AIFloatingToolbar({editor, containerRef}: AIFloatingToolbarProps) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<ToolbarPosition>({top: 0, left: 0, flipped: false});
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [resultPreview, setResultPreview] = useState<{action: string; text: string} | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Compute position from selection ──
  const computePosition = useCallback(() => {
    if (!editor || !containerRef.current) return null;

    const {from, to} = editor.state.selection;
    if (from === to) return null; // no selection

    const view = editor.view;
    const startCoords = view.coordsAtPos(from);
    const endCoords = view.coordsAtPos(to);
    const containerRect = containerRef.current.getBoundingClientRect();

    const selectionCenterX = (startCoords.left + endCoords.right) / 2;
    const selectionTop = Math.min(startCoords.top, endCoords.top);

    const relX = selectionCenterX - containerRect.left;
    const relY = selectionTop - containerRect.top;

    // Toolbar is ~320px wide, 40px tall — center it above selection
    const toolbarWidth = 360;
    const toolbarHeight = 44;
    const margin = 8;

    let left = relX - toolbarWidth / 2;
    // Clamp to container bounds
    left = Math.max(margin, Math.min(left, containerRect.width - toolbarWidth - margin));

    const top = relY - toolbarHeight - margin;
    const flipped = top < 0; // flip below if off-screen

    return {
      top: flipped ? relY + (endCoords.bottom - endCoords.top) + margin : top,
      left,
      flipped,
    };
  }, [editor, containerRef]);

  // ── Show/hide based on selection ──
  useEffect(() => {
    if (!editor) return;

    const handleSelectionChange = () => {
      // Clear pending show timer
      if (showTimerRef.current) clearTimeout(showTimerRef.current);

      const {from, to} = editor.state.selection;
      const selectedText = editor.state.doc.textBetween(from, to, ' ').trim();

      if (!selectedText || selectedText.length < 3) {
        setVisible(false);
        setResultPreview(null);
        return;
      }

      // Debounce: show after 280ms of stable selection
      showTimerRef.current = setTimeout(() => {
        const pos = computePosition();
        if (pos) {
          setPosition(pos);
          setVisible(true);
        }
      }, 280);
    };

    editor.on('selectionUpdate', handleSelectionChange);
    editor.on('blur', () => {
      // Small delay so clicking toolbar buttons doesn't hide first
      setTimeout(() => {
        if (!toolbarRef.current?.matches(':focus-within')) {
          setVisible(false);
        }
      }, 150);
    });

    return () => {
      editor.off('selectionUpdate', handleSelectionChange);
      if (showTimerRef.current) clearTimeout(showTimerRef.current);
    };
  }, [editor, computePosition]);

  // ── Dismiss on click-outside / Escape ──
  useEffect(() => {
    if (!visible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setVisible(false); setResultPreview(null); }
    };
    const handleClick = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setVisible(false);
        setResultPreview(null);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClick);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [visible]);

  // ── Execute AI action ──
  const handleAction = useCallback(async (floatingAction: FloatingAction) => {
    if (!editor || loadingAction) return;

    const {from, to} = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to, ' ').trim();
    if (!selectedText) return;

    const docContent = editor.getText().slice(0, 1500);

    setLoadingAction(floatingAction.id);
    setResultPreview(null);

    try {
      let result: {text: string};

      if (floatingAction.action === 'rewrite') {
        result = await callAI('rewrite', {
          text: selectedText,
          mode: floatingAction.mode,
          context: docContent,
        });
      } else if (floatingAction.action === 'explain') {
        result = await callAI('explain', {
          text: selectedText,
          context: docContent,
        });
      } else {
        // continue
        result = await callAI('continue', {
          textBefore: selectedText,
          documentContext: docContent,
        });
      }

      if (floatingAction.action === 'explain' || floatingAction.action === 'continue') {
        // Show preview before applying
        setResultPreview({action: floatingAction.id, text: result.text});
      } else {
        // Directly replace selection with rewritten text
        editor.chain().focus()
          .deleteRange({from, to})
          .insertContentAt(from, result.text)
          .run();
        setVisible(false);
        setResultPreview(null);
      }
    } catch (err) {
      console.error('AI floating action failed:', err);
    } finally {
      setLoadingAction(null);
    }
  }, [editor, loadingAction]);

  // ── Accept preview ──
  const acceptPreview = useCallback(() => {
    if (!editor || !resultPreview) return;
    const {from, to} = editor.state.selection;

    if (resultPreview.action === 'continue') {
      // Insert after selection
      editor.chain().focus().insertContentAt(to, ' ' + resultPreview.text).run();
    } else {
      // Replace selection (explain → insert after as a callout)
      const callout = `\n\n> 💡 **Explanation:** ${resultPreview.text}`;
      editor.chain().focus().insertContentAt(to, callout).run();
    }
    setVisible(false);
    setResultPreview(null);
  }, [editor, resultPreview]);

  if (!visible) return null;

  return (
    <div
      ref={toolbarRef}
      className="absolute z-50 pointer-events-auto"
      style={{
        top: position.top,
        left: position.left,
        transformOrigin: position.flipped ? 'top center' : 'bottom center',
        animation: 'floatingToolbarIn 0.15s ease-out',
      }}
    >
      {/* Result preview strip */}
      {resultPreview && (
        <div className="mb-1 bg-blue-50 border border-blue-200 rounded-lg p-2 shadow-lg max-w-sm">
          <p className="text-xs text-gray-700 line-clamp-3">{resultPreview.text}</p>
          <div className="flex gap-1 mt-1.5">
            <button
              onClick={acceptPreview}
              className="text-xs px-2 py-0.5 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              ✓ Insert
            </button>
            <button
              onClick={() => setResultPreview(null)}
              className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
            >
              ✕ Discard
            </button>
          </div>
        </div>
      )}

      {/* Main toolbar */}
      <div className="flex items-center gap-0.5 bg-gray-900 rounded-lg shadow-xl border border-gray-700 px-1.5 py-1">
        {/* AI label */}
        <span className="text-xs font-semibold text-purple-400 px-1 mr-0.5 select-none">✨ AI</span>
        <div className="w-px h-4 bg-gray-600" />

        {FLOATING_ACTIONS.map((act) => (
          <button
            key={act.id}
            title={act.tooltip}
            disabled={loadingAction !== null}
            onClick={() => handleAction(act)}
            className={`
              relative px-2 py-1 rounded text-xs font-medium transition-all
              ${loadingAction === act.id
                ? 'bg-blue-500 text-white cursor-wait'
                : 'text-gray-300 hover:bg-gray-700 hover:text-white cursor-pointer'
              }
              disabled:opacity-60
            `}
          >
            {loadingAction === act.id ? (
              <span className="inline-flex items-center gap-1">
                <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                {act.label.split(' ')[1] || act.label}
              </span>
            ) : (
              act.label
            )}
          </button>
        ))}
      </div>

      <style>{`
        @keyframes floatingToolbarIn {
          from { opacity: 0; transform: scale(0.95) translateY(4px); }
          to   { opacity: 1; transform: scale(1)    translateY(0); }
        }
      `}</style>
    </div>
  );
}

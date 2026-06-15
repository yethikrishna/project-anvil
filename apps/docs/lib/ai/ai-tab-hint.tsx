'use client';

/**
 * AITabHint — Shows a subtle "Tab to accept" hint when an inline AI suggestion is pending.
 * Fades in/out automatically. Positioned bottom-right of the editor.
 * Also shows "Esc to dismiss" and "Ctrl+→ for one word".
 */

import { useState, useEffect } from 'react';
import type { Editor } from '@tiptap/react';

interface AITabHintProps {
  editor: Editor | null;
}

export function AITabHint({ editor }: AITabHintProps) {
  const [hasSuggestion, setHasSuggestion] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);

  useEffect(() => {
    if (!editor) return;

    const check = () => {
      try {
        // Access plugin state safely
        const state = editor.state;
        // Look for any ai-suggestion-inline decoration in the doc
        const view = editor.view;
        const suggestionEl = view.dom.querySelector('.ai-suggestion-inline');
        const streamingEl = view.dom.querySelector('.ai-suggestion-streaming');
        setHasSuggestion(!!suggestionEl);
        setIsStreaming(!!streamingEl);
      } catch {
        setHasSuggestion(false);
        setIsStreaming(false);
      }
    };

    editor.on('transaction', check);
    // Also poll at lower frequency to catch DOM changes
    const interval = setInterval(check, 500);

    return () => {
      editor.off('transaction', check);
      clearInterval(interval);
    };
  }, [editor]);

  if (!hasSuggestion && !isStreaming) return null;

  return (
    <div className="ai-tab-hint">
      {isStreaming ? (
        <>
          <span className="inline-block w-3 h-3 border border-purple-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-purple-500">AI writing...</span>
        </>
      ) : (
        <>
          <span className="text-indigo-400">✨</span>
          <kbd>Tab</kbd>
          <span>accept</span>
          <span className="text-gray-300">·</span>
          <kbd>Ctrl</kbd><kbd>→</kbd>
          <span>one word</span>
          <span className="text-gray-300">·</span>
          <kbd>Esc</kbd>
          <span>dismiss</span>
        </>
      )}
    </div>
  );
}

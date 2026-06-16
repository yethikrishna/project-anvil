/**
 * MessageEditor — inline edit + re-run any user message.
 *
 * Lets users click "edit" on any message, modify the text,
 * and re-run from that point — creating a branched conversation.
 *
 * UX:
 * - Textarea replaces the message bubble
 * - Ctrl/Cmd+Enter to submit
 * - Escape to cancel
 */

'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@anvil/ui';

interface Props {
  originalText: string;
  onSave: (newText: string) => void;
  onCancel: () => void;
}

export default function MessageEditor({ originalText, onSave, onCancel }: Props) {
  const [text, setText] = useState(originalText);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (text.trim()) onSave(text.trim());
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  }, [text, onSave, onCancel]);

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }, []);

  return (
    <div className="flex flex-col gap-2 w-full">
      <textarea
        ref={textareaRef}
        value={text}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        className={cn(
          'w-full resize-none rounded-xl px-4 py-3 text-sm',
          'bg-blue-50 dark:bg-blue-900/30 border-2 border-blue-400 dark:border-blue-600',
          'text-gray-900 dark:text-gray-100',
          'focus:outline-none focus:ring-2 focus:ring-blue-500',
          'min-h-[60px]',
        )}
        placeholder="Edit your message..."
      />
      <div className="flex items-center gap-2 justify-end">
        <span className="text-[10px] text-gray-400">
          {navigator.platform?.toLowerCase().includes('mac') ? '⌘' : 'Ctrl'}+Enter to save
        </span>
        <button
          onClick={onCancel}
          className="text-xs px-3 py-1.5 rounded-lg text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={() => { if (text.trim()) onSave(text.trim()); }}
          disabled={!text.trim() || text.trim() === originalText}
          className={cn(
            'text-xs px-3 py-1.5 rounded-lg font-medium transition-colors',
            'bg-blue-500 text-white hover:bg-blue-600',
            'disabled:opacity-40 disabled:cursor-not-allowed',
          )}
        >
          Re-run →
        </button>
      </div>
    </div>
  );
}

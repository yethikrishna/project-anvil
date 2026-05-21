/**
 * ChatInput — message input with voice recording, send button, and command hints.
 *
 * Features:
 * - Auto-resizing textarea
 * - Push-to-talk voice input with audio visualization
 * - Quick command suggestions
 * - Keyboard shortcuts (Enter to send, Shift+Enter for new line)
 */

'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { cn } from '@anvil/ui';
import { useVoiceInput } from '@/lib/use-voice-input';

interface Props {
  onSend: (text: string) => void;
  isLoading: boolean;
  disabled?: boolean;
}

const SUGGESTIONS = [
  'What needs my attention?',
  'Draft a reply to my latest email',
  'Find the Q3 report on Drive',
  'Schedule a meeting with the team',
  'Give me a weekly summary',
  'Search emails about the project deadline',
];

export default function ChatInput({ onSend, isLoading, disabled }: Props) {
  const [input, setInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Voice input
  const { isRecording, isProcessing, audioLevel, startRecording, stopRecording } =
    useVoiceInput({
      onTranscript: (text) => {
        setInput(prev => prev + (prev ? ' ' : '') + text);
        textareaRef.current?.focus();
      },
      silenceTimeoutMs: 4000,
    });

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
    }
  }, [input]);

  const handleSend = useCallback(() => {
    if (!input.trim() || isLoading || disabled) return;
    onSend(input.trim());
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [input, isLoading, disabled, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950">
      {/* Quick suggestions */}
      {showSuggestions && (
        <div className="px-4 pt-3 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map(s => (
            <button
              key={s}
              onClick={() => { setInput(s); setShowSuggestions(false); textareaRef.current?.focus(); }}
              className="text-xs px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2 p-3">
        {/* Suggestions toggle */}
        <button
          onClick={() => setShowSuggestions(!showSuggestions)}
          className={cn(
            'w-8 h-8 rounded-lg flex items-center justify-center text-sm transition-colors shrink-0',
            showSuggestions
              ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300'
              : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800',
          )}
          title="Quick commands"
        >
          ⚡
        </button>

        {/* Textarea */}
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isProcessing ? 'Processing voice...' : 'Ask Anvil AI anything...'}
            className={cn(
              'w-full resize-none rounded-xl border border-gray-200 dark:border-gray-700',
              'bg-gray-50 dark:bg-gray-900 px-4 py-2.5 text-sm',
              'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
              'placeholder:text-gray-400',
              'max-h-40',
              isRecording && 'ring-2 ring-red-400',
            )}
            rows={1}
            disabled={disabled || isLoading}
          />
        </div>

        {/* Voice button */}
        <div className="relative">
          <button
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onMouseLeave={() => isRecording && stopRecording()}
            onTouchStart={startRecording}
            onTouchEnd={stopRecording}
            disabled={disabled || isProcessing}
            className={cn(
              'w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0 transition-all',
              isRecording
                ? 'bg-red-500 text-white voice-pulse'
                : isProcessing
                  ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 animate-pulse'
                  : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800',
            )}
            title={isRecording ? 'Release to stop' : isProcessing ? 'Processing...' : 'Hold to record voice'}
          >
            {isProcessing ? '⏳' : '🎤'}
          </button>

          {/* Audio level ring */}
          {isRecording && (
            <div className="absolute inset-0 pointer-events-none">
              <svg viewBox="0 0 32 32" className="w-full h-full">
                <circle
                  cx="16" cy="16" r={12 + audioLevel * 6}
                  fill="none"
                  stroke="rgba(239, 68, 68, 0.3)"
                  strokeWidth="2"
                  className="transition-all duration-75"
                />
              </svg>
            </div>
          )}
        </div>

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={!input.trim() || isLoading || disabled}
          className={cn(
            'w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0 transition-colors',
            input.trim() && !isLoading
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-gray-200 dark:bg-gray-800 text-gray-400 cursor-not-allowed',
          )}
        >
          {isLoading ? (
            <span className="animate-spin">⟳</span>
          ) : (
            '↑'
          )}
        </button>
      </div>

      <div className="px-4 pb-2 text-[10px] text-gray-400 flex justify-between">
        <span>
          Anvil AI can search your mail, files, calendar, and docs. Shift+Enter for new line.
        </span>
        {isRecording && (
          <span className="text-red-500 font-medium animate-pulse">
            Recording...
          </span>
        )}
      </div>
    </div>
  );
}

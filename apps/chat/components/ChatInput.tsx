/**
 * ChatInput — message input with voice recording, send button, and command hints.
 */

'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { cn } from '@anvil/ui';

interface Props {
  onSend: (text: string) => void;
  isLoading: boolean;
  disabled?: boolean;
}

// Quick command suggestions
const SUGGESTIONS = [
  'What needs my attention?',
  'Draft a reply to Sarah',
  'Find the Q3 report on Drive',
  'Schedule a meeting with the team',
  'Give me a weekly summary',
  'Search emails about the project deadline',
];

export default function ChatInput({ onSend, isLoading, disabled }: Props) {
  const [input, setInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

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

  // ── Voice Recording ──

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });

        // Send to STT API
        try {
          const formData = new FormData();
          formData.append('audio', blob, 'recording.webm');
          const res = await fetch('/api/voice/stt', { method: 'POST', body: formData });
          const data = await res.json();
          if (data.text) {
            setInput(prev => prev + (prev ? ' ' : '') + data.text);
          }
        } catch {
          // STT failed, ignore
        }
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch {
      // No mic access
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }, []);

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
              : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
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
            placeholder="Ask Anvil AI anything..."
            className={cn(
              'w-full resize-none rounded-xl border border-gray-200 dark:border-gray-700',
              'bg-gray-50 dark:bg-gray-900 px-4 py-2.5 text-sm',
              'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
              'placeholder:text-gray-400',
              'max-h-40',
            )}
            rows={1}
            disabled={disabled || isLoading}
          />
        </div>

        {/* Voice button */}
        <button
          onMouseDown={startRecording}
          onMouseUp={stopRecording}
          onMouseLeave={() => isRecording && stopRecording()}
          className={cn(
            'w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0 transition-all relative',
            isRecording
              ? 'bg-red-500 text-white voice-pulse'
              : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800',
          )}
          title={isRecording ? 'Release to stop' : 'Hold to record voice'}
        >
          🎤
        </button>

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

      <div className="px-4 pb-2 text-[10px] text-gray-400">
        Anvil AI can search your mail, files, calendar, and docs. Shift+Enter for new line.
      </div>
    </div>
  );
}

/**
 * ChatInput — enhanced message input with:
 * - Auto-resizing textarea
 * - Slash command autocomplete
 * - @mention suggestions
 * - Push-to-talk voice input
 * - File drag & drop for context
 * - Quick action chips
 */

'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { cn } from '@anvil/ui';
import { useVoiceInput } from '@/lib/use-voice-input';
import { getSlashCommandHints } from '@/lib/rich-renderer';

interface Props {
  onSend: (text: string) => void;
  isLoading: boolean;
  disabled?: boolean;
}

const QUICK_CHIPS = [
  { icon: '⚡', label: 'Attention', prompt: 'What needs my attention right now?' },
  { icon: '✉️', label: 'Reply', prompt: 'Draft a reply to my latest email' },
  { icon: '📄', label: 'Find', prompt: 'Search Drive for ' },
  { icon: '📅', label: 'Schedule', prompt: 'Schedule a meeting ' },
  { icon: '📊', label: 'Summary', prompt: 'Give me a weekly summary' },
];

const SLASH_COMMANDS: Record<string, string> = {
  '/attention': 'Scan my unread emails and upcoming events. Give me a priority digest of what needs attention.',
  '/draft': 'Find my most recent unread email, read the full thread, and draft a professional reply. Save it to drafts.',
  '/find': 'Search Drive for files matching: ',
  '/share': 'Find a file on Drive and create a shareable link for it.',
  '/schedule': 'Check calendar availability and help me schedule a meeting.',
  '/summary': 'Generate a comprehensive weekly summary across Mail, Calendar, and Drive.',
  '/compose': 'Help me compose a new email.',
  '/search': 'Search the web for: ',
  '/help': 'I can help you with:\n\n- **Emails**: Search, draft replies, compose new, read threads\n- **Files**: Search Drive, read documents, share links\n- **Calendar**: Check availability, schedule meetings, see upcoming events\n- **Docs**: Create and edit documents\n- **Web**: Search the internet\n\nJust describe what you need in natural language!',
};

export default function ChatInput({ onSend, isLoading, disabled }: Props) {
  const [input, setInput] = useState('');
  const [showChips, setShowChips] = useState(true);
  const [slashCommands, setSlashCommands] = useState<Array<{ command: string; description: string }>>([]);
  const [selectedSlashIdx, setSelectedSlashIdx] = useState(0);
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

  // Slash command detection
  useEffect(() => {
    if (input.startsWith('/')) {
      const hints = getSlashCommandHints(input.split(' ')[0]);
      setSlashCommands(hints);
      setSelectedSlashIdx(0);
    } else {
      setSlashCommands([]);
    }
  }, [input]);

  const handleSend = useCallback(() => {
    // Check for slash command expansion
    const slashCmd = input.trim().match(/^(\/\w+)\s*(.*)/);
    if (slashCmd && SLASH_COMMANDS[slashCmd[1]]) {
      const expanded = SLASH_COMMANDS[slashCmd[1]] + (slashCmd[2] || '');
      onSend(expanded);
    } else if (input.trim()) {
      onSend(input.trim());
    }

    setInput('');
    setShowChips(true);
    setSlashCommands([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [input, isLoading, disabled, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Slash command navigation
    if (slashCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedSlashIdx(i => Math.min(i + 1, slashCommands.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedSlashIdx(i => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        const selected = slashCommands[selectedSlashIdx];
        if (selected) {
          setInput(selected.command + ' ');
          setSlashCommands([]);
        }
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChipClick = (prompt: string) => {
    setInput(prompt);
    setShowChips(false);
    textareaRef.current?.focus();
    // Auto-send if it's a complete prompt
    if (!prompt.endsWith(' ')) {
      setTimeout(() => {
        onSend(prompt);
        setInput('');
        setShowChips(true);
      }, 50);
    }
  };

  const hasInput = input.trim().length > 0;

  return (
    <div className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950">
      {/* Quick chips (shown when input is empty) */}
      {showChips && !hasInput && (
        <div className="px-4 pt-3 flex flex-wrap gap-1.5">
          {QUICK_CHIPS.map(chip => (
            <button
              key={chip.label}
              onClick={() => handleChipClick(chip.prompt)}
              className="text-[11px] px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600 transition-all flex items-center gap-1.5"
            >
              <span className="text-xs">{chip.icon}</span>
              {chip.label}
            </button>
          ))}
        </div>
      )}

      {/* Slash command dropdown */}
      {slashCommands.length > 0 && (
        <div className="mx-4 mt-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg overflow-hidden">
          {slashCommands.map((cmd, i) => (
            <button
              key={cmd.command}
              onClick={() => {
                setInput(cmd.command + ' ');
                setSlashCommands([]);
                textareaRef.current?.focus();
              }}
              onMouseEnter={() => setSelectedSlashIdx(i)}
              className={cn(
                'w-full text-left px-3 py-2 flex items-center gap-3 transition-colors',
                i === selectedSlashIdx
                  ? 'bg-blue-50 dark:bg-blue-950'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-800',
              )}
            >
              <span className="text-xs font-mono font-semibold text-blue-600 dark:text-blue-400">
                {cmd.command}
              </span>
              <span className="text-[11px] text-gray-500 dark:text-gray-400">
                {cmd.description}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Input area */}
      <div className="flex items-end gap-2 p-3">
        {/* Chip toggle */}
        <button
          onClick={() => setShowChips(!showChips)}
          className={cn(
            'w-8 h-8 rounded-lg flex items-center justify-center text-sm transition-colors shrink-0',
            showChips && !hasInput
              ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300'
              : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800',
          )}
          title="Quick actions"
        >
          ⚡
        </button>

        {/* Textarea */}
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              if (e.target.value) setShowChips(false);
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => { if (!input) setShowChips(true); }}
            placeholder={isProcessing ? 'Processing voice...' : 'Message Anvil AI... (type / for commands)'}
            className={cn(
              'w-full resize-none rounded-xl border border-gray-200 dark:border-gray-700',
              'bg-gray-50 dark:bg-gray-900 px-4 py-2.5 text-sm',
              'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
              'placeholder:text-gray-400',
              'max-h-40',
              isRecording && 'ring-2 ring-red-400 border-red-300',
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
            title={isRecording ? 'Release to stop' : isProcessing ? 'Processing...' : 'Hold to record'}
          >
            {isProcessing ? '⏳' : '🎤'}
          </button>

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
          disabled={!hasInput || isLoading || disabled}
          className={cn(
            'w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0 transition-all',
            hasInput && !isLoading
              ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-300 dark:text-gray-600',
          )}
        >
          {isLoading ? (
            <span className="animate-spin text-blue-500">⟳</span>
          ) : (
            '↑'
          )}
        </button>
      </div>

      {/* Footer hint */}
      <div className="px-4 pb-2 text-[10px] text-gray-400 flex justify-between">
        <span>
          {isRecording ? (
            <span className="text-red-500 font-medium animate-pulse">Recording...</span>
          ) : (
            <>Shift+Enter for new line · <kbd className="px-1 border border-gray-200 dark:border-gray-700 rounded text-[9px]">/</kbd> for commands</>
          )}
        </span>
        {input.length > 0 && (
          <span className={input.length > 2000 ? 'text-amber-500' : ''}>
            {input.length > 2000 ? `${input.length} chars` : ''}
          </span>
        )}
      </div>
    </div>
  );
}

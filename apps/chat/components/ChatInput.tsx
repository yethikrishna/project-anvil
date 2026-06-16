/**
 * ChatInput — enhanced message input with:
 * - Auto-resizing textarea
 * - Slash command autocomplete
 * - @mention suggestions
 * - Push-to-talk voice input
 * - File drag & drop for context (images, PDFs, text files)
 * - Quick action chips
 * - Agent autonomy mode toggle
 */

'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { cn } from '@anvil/ui';
import { useVoiceInput } from '@/lib/use-voice-input';
import { getSlashCommandHints } from '@/lib/rich-renderer';

export interface AttachedFile {
  id: string;
  name: string;
  type: string;
  size: number;
  /** Base64 data URI for images; raw text for text files */
  content: string;
  /** Preview URL for images */
  previewUrl?: string;
}

interface Props {
  onSend: (text: string, attachments?: AttachedFile[]) => void;
  isLoading: boolean;
  disabled?: boolean;
  /** When true, AI auto-approves all tool calls (agent mode) */
  agentMode?: boolean;
  onAgentModeChange?: (enabled: boolean) => void;
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
  '/agent': '__agent_mode__',
  '/help': 'I can help you with:\n\n- **Emails**: Search, draft replies, compose new, read threads\n- **Files**: Search Drive, read documents, share links\n- **Calendar**: Check availability, schedule meetings, see upcoming events\n- **Docs**: Create and edit documents\n- **Web**: Search the internet\n\nJust describe what you need in natural language!',
};

const ACCEPTED_FILE_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf', 'text/plain', 'text/csv', 'text/markdown',
  'application/json', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const MAX_FILE_SIZE_MB = 10;

async function readFileAsContent(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    if (file.type.startsWith('image/')) {
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
    } else if (file.type === 'text/plain' || file.type === 'text/csv'
      || file.type === 'text/markdown' || file.type === 'application/json') {
      reader.readAsText(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
    } else {
      // For PDFs and DOCX — read as base64, server will extract text
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
    }
  });
}

export default function ChatInput({ onSend, isLoading, disabled, agentMode = false, onAgentModeChange }: Props) {
  const [input, setInput] = useState('');
  const [showChips, setShowChips] = useState(true);
  const [slashCommands, setSlashCommands] = useState<Array<{ command: string; description: string }>>([]);
  const [selectedSlashIdx, setSelectedSlashIdx] = useState(0);
  const [attachments, setAttachments] = useState<AttachedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

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

  // ── File attachment handlers ──

  const processFiles = useCallback(async (files: FileList | File[]) => {
    setAttachError(null);
    const fileArray = Array.from(files);

    for (const file of fileArray) {
      if (!ACCEPTED_FILE_TYPES.includes(file.type) && !file.name.endsWith('.md')) {
        setAttachError(`Unsupported file type: ${file.type || 'unknown'}`);
        setTimeout(() => setAttachError(null), 3000);
        continue;
      }

      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        setAttachError(`File too large (max ${MAX_FILE_SIZE_MB}MB): ${file.name}`);
        setTimeout(() => setAttachError(null), 3000);
        continue;
      }

      try {
        const content = await readFileAsContent(file);
        const newAttachment: AttachedFile = {
          id: crypto.randomUUID(),
          name: file.name,
          type: file.type,
          size: file.size,
          content,
          previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
        };

        setAttachments(prev => {
          if (prev.length >= 5) return prev; // max 5 attachments
          return [...prev, newAttachment];
        });
      } catch {
        setAttachError(`Failed to read: ${file.name}`);
        setTimeout(() => setAttachError(null), 3000);
      }
    }
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes('Files')) setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      await processFiles(e.dataTransfer.files);
    }
  }, [processFiles]);

  const removeAttachment = useCallback((id: string) => {
    setAttachments(prev => {
      const att = prev.find(a => a.id === id);
      if (att?.previewUrl) URL.revokeObjectURL(att.previewUrl);
      return prev.filter(a => a.id !== id);
    });
  }, []);

  // ── Send handler ──

  const handleSend = useCallback(() => {
    // Check for special slash commands
    const slashCmd = input.trim().match(/^(\/\w+)\s*(.*)/);
    if (slashCmd && SLASH_COMMANDS[slashCmd[1]]) {
      const expanded = SLASH_COMMANDS[slashCmd[1]];
      if (expanded === '__agent_mode__') {
        onAgentModeChange?.(!agentMode);
        setInput('');
        return;
      }
      onSend(expanded + (slashCmd[2] || ''), attachments.length > 0 ? attachments : undefined);
    } else if (input.trim() || attachments.length > 0) {
      onSend(input.trim() || '(See attached file)', attachments.length > 0 ? attachments : undefined);
    }

    setInput('');
    setAttachments([]);
    setShowChips(true);
    setSlashCommands([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [input, agentMode, onAgentModeChange, onSend, attachments]);

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

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const files = e.clipboardData.files;
    if (files.length > 0) {
      e.preventDefault();
      await processFiles(files);
    }
  }, [processFiles]);

  const handleChipClick = (prompt: string) => {
    setInput(prompt);
    setShowChips(false);
    textareaRef.current?.focus();
    if (!prompt.endsWith(' ')) {
      setTimeout(() => {
        onSend(prompt, undefined);
        setInput('');
        setShowChips(true);
      }, 50);
    }
  };

  const hasInput = input.trim().length > 0 || attachments.length > 0;

  return (
    <div
      className={cn(
        'border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 transition-colors',
        isDragging && 'border-blue-400 bg-blue-50/50 dark:bg-blue-950/20',
      )}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-blue-50/80 dark:bg-blue-950/80 border-2 border-dashed border-blue-400 rounded-lg pointer-events-none m-1">
          <div className="text-center">
            <div className="text-3xl mb-2">📎</div>
            <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Drop files to attach</p>
            <p className="text-xs text-blue-500 mt-1">Images, PDFs, text files — max 10MB each</p>
          </div>
        </div>
      )}

      {/* Agent mode banner */}
      {agentMode && (
        <div className="px-4 pt-2 flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 px-3 py-1.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
            <span className="text-amber-600 dark:text-amber-400 text-sm">🤖</span>
            <span className="text-xs font-medium text-amber-700 dark:text-amber-300">Agent mode — AI will auto-approve all actions</span>
            <button
              onClick={() => onAgentModeChange?.(false)}
              className="ml-auto text-[10px] text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200 underline"
            >
              Disable
            </button>
          </div>
        </div>
      )}

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
          {/* Agent mode hint */}
          <button
            onClick={() => {
              onAgentModeChange?.(!agentMode);
              setInput('');
              setSlashCommands([]);
            }}
            onMouseEnter={() => setSelectedSlashIdx(slashCommands.length)}
            className={cn(
              'w-full text-left px-3 py-2 flex items-center gap-3 transition-colors border-t border-gray-100 dark:border-gray-800',
              selectedSlashIdx === slashCommands.length
                ? 'bg-amber-50 dark:bg-amber-950'
                : 'hover:bg-gray-50 dark:hover:bg-gray-800',
            )}
          >
            <span className="text-xs font-mono font-semibold text-amber-600 dark:text-amber-400">/agent</span>
            <span className="text-[11px] text-gray-500 dark:text-gray-400">
              {agentMode ? 'Disable agent mode (auto-approve off)' : 'Enable agent mode (auto-approve all actions)'}
            </span>
          </button>
        </div>
      )}

      {/* Attachment previews */}
      {attachments.length > 0 && (
        <div className="px-4 pt-3 flex flex-wrap gap-2">
          {attachments.map(att => (
            <div
              key={att.id}
              className="relative flex items-center gap-1.5 px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 max-w-[180px] group"
            >
              {att.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={att.previewUrl} alt={att.name} className="w-8 h-8 rounded object-cover shrink-0" />
              ) : (
                <span className="text-lg shrink-0">
                  {att.type === 'application/pdf' ? '📄'
                    : att.type.includes('text') ? '📝'
                    : att.type.includes('json') ? '{ }'
                    : '📎'}
                </span>
              )}
              <div className="min-w-0">
                <p className="text-[10px] font-medium text-gray-700 dark:text-gray-300 truncate">{att.name}</p>
                <p className="text-[9px] text-gray-400">{(att.size / 1024).toFixed(0)}KB</p>
              </div>
              <button
                onClick={() => removeAttachment(att.id)}
                className="absolute -top-1 -right-1 w-4 h-4 bg-gray-500 text-white rounded-full text-[8px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                ✕
              </button>
            </div>
          ))}
          {attachments.length < 5 && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1 px-2 py-1 border border-dashed border-gray-300 dark:border-gray-700 rounded-lg text-[10px] text-gray-400 hover:border-gray-400 hover:text-gray-600 transition-colors"
            >
              + Add
            </button>
          )}
        </div>
      )}

      {/* Error message */}
      {attachError && (
        <div className="mx-4 mt-2 px-3 py-1.5 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-xs text-red-600 dark:text-red-400">{attachError}</p>
        </div>
      )}

      {/* Input area */}
      <div className="flex items-end gap-2 p-3">
        {/* Attach file button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || isLoading || attachments.length >= 5}
          className={cn(
            'w-8 h-8 rounded-lg flex items-center justify-center text-sm transition-colors shrink-0',
            attachments.length > 0
              ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300'
              : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800',
            (disabled || isLoading || attachments.length >= 5) && 'opacity-50 cursor-not-allowed',
          )}
          title={attachments.length >= 5 ? 'Max 5 attachments' : 'Attach file'}
        >
          {attachments.length > 0 ? `📎${attachments.length}` : '📎'}
        </button>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_FILE_TYPES.join(',')}
          className="hidden"
          onChange={async (e) => {
            if (e.target.files) await processFiles(e.target.files);
            e.target.value = '';
          }}
        />

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
            onPaste={handlePaste}
            onFocus={() => { if (!input) setShowChips(true); }}
            placeholder={
              isDragging ? 'Drop files here...'
              : isProcessing ? 'Processing voice...'
              : attachments.length > 0 ? 'Add a message about these files... (optional)'
              : 'Message Anvil AI... (type / for commands, drag files to attach)'
            }
            className={cn(
              'w-full resize-none rounded-xl border border-gray-200 dark:border-gray-700',
              'bg-gray-50 dark:bg-gray-900 px-4 py-2.5 text-sm',
              'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
              'placeholder:text-gray-400',
              'max-h-40',
              isRecording && 'ring-2 ring-red-400 border-red-300',
              isDragging && 'ring-2 ring-blue-400 border-blue-300',
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

        {/* Agent mode toggle */}
        <button
          onClick={() => onAgentModeChange?.(!agentMode)}
          title={agentMode ? 'Agent mode ON — click to disable' : 'Enable agent mode (auto-approve)'}
          className={cn(
            'w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0 transition-all',
            agentMode
              ? 'bg-amber-500 text-white shadow-sm'
              : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800',
          )}
        >
          🤖
        </button>

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
          ) : isDragging ? (
            <span className="text-blue-500 font-medium">Drop to attach</span>
          ) : (
            <>Shift+Enter for new line · <kbd className="px-1 border border-gray-200 dark:border-gray-700 rounded text-[9px]">/</kbd> for commands · drag files to attach</>
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

'use client';

import {useState, useCallback, useRef, useEffect} from 'react';
import {cn} from '../utils';

// ── Types ──

interface CopilotMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  context?: {
    app?: string;
    action?: string;
  };
}

interface CopilotSuggestion {
  label: string;
  prompt: string;
  icon?: string;
}

interface AICopilotProps {
  /** Currently active Anvil app */
  activeApp?: string;
  /** Callback to send a message to the AI backend */
  onSendMessage: (message: string, context?: {app?: string}) => Promise<string>;
  /** Quick action suggestions */
  suggestions?: CopilotSuggestion[];
  /** Open/close state */
  open: boolean;
  onClose: () => void;
}

// ── App-aware suggestions ──

const APP_SUGGESTIONS: Record<string, CopilotSuggestion[]> = {
  drive: [
    {label: 'Find my recent files', prompt: 'Show me files I edited this week', icon: '📁'},
    {label: 'Organize my downloads', prompt: 'Help me organize my Downloads folder', icon: '🗂️'},
    {label: 'Find duplicates', prompt: 'Find duplicate files in my Drive', icon: '🔍'},
  ],
  docs: [
    {label: 'Improve my writing', prompt: 'Review this document and suggest improvements', icon: '✍️'},
    {label: 'Generate a summary', prompt: 'Summarize this document in 3 bullet points', icon: '📋'},
    {label: 'Fix grammar', prompt: 'Check and fix grammar issues in this document', icon: '📝'},
  ],
  youtube: [
    {label: 'Summarize this video', prompt: 'Summarize the key points of this video', icon: '📝'},
    {label: 'Find related videos', prompt: 'Find videos similar to this one', icon: '🔍'},
  ],
  gmail: [
    {label: 'Draft a reply', prompt: 'Help me draft a professional reply to this email', icon: '✉️'},
    {label: 'Summarize thread', prompt: 'Summarize this email thread', icon: '📋'},
    {label: 'Clean up inbox', prompt: 'Help me organize my inbox', icon: '🧹'},
  ],
  search: [
    {label: 'Refine my search', prompt: 'Help me build a better search query', icon: '🎯'},
  ],
  maps: [
    {label: 'Plan a route', prompt: 'Help me plan an efficient route between these locations', icon: '🗺️'},
  ],
  _default: [
    {label: 'What can you do?', prompt: 'What can you help me with across the Anvil apps?', icon: '💡'},
    {label: 'Quick summary', prompt: 'Give me a summary of my recent activity', icon: '📊'},
  ],
};

// ── Component ──

export function AICopilot({activeApp, onSendMessage, suggestions, open, onClose}: AICopilotProps) {
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const appSuggestions = suggestions ?? APP_SUGGESTIONS[activeApp ?? ''] ?? APP_SUGGESTIONS._default;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({behavior: 'smooth'});
  }, [messages]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMsg: CopilotMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: text.trim(),
      timestamp: new Date(),
      context: {app: activeApp},
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await onSendMessage(text.trim(), {app: activeApp});
      const assistantMsg: CopilotMessage = {
        id: `msg_${Date.now()}_resp`,
        role: 'assistant',
        content: response,
        timestamp: new Date(),
        context: {app: activeApp},
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch {
      const errorMsg: CopilotMessage = {
        id: `msg_${Date.now()}_err`,
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, activeApp, onSendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed right-0 top-0 h-full w-96 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 shadow-xl z-50 flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">✨</span>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">AI Copilot</h3>
            <p className="text-[10px] text-gray-500">Context-aware assistant</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          ✕
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="space-y-4">
            <div className="text-center py-8">
              <span className="text-4xl">🤖</span>
              <p className="text-sm text-gray-500 mt-3">How can I help you today?</p>
              <p className="text-xs text-gray-400 mt-1">
                {activeApp ? `I'm aware you're in ${activeApp}` : 'I can help across all Anvil apps'}
              </p>
            </div>

            {/* Quick suggestions */}
            <div className="space-y-2">
              {appSuggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(s.prompt)}
                  className="w-full text-left px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {s.icon && <span className="text-sm">{s.icon}</span>}
                    <span className="text-sm text-gray-700 dark:text-gray-300">{s.label}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map(msg => (
              <div
                key={msg.id}
                className={cn(
                  'flex',
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                <div
                  className={cn(
                    'max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm',
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                  )}
                >
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                  <div
                    className={cn(
                      'text-[10px] mt-1',
                      msg.role === 'user' ? 'text-blue-200' : 'text-gray-400'
                    )}
                  >
                    {msg.timestamp.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}
                  </div>
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 dark:bg-gray-800 rounded-xl px-4 py-3">
                  <div className="flex gap-1.5">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0ms'}} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '150ms'}} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '300ms'}} />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div className="p-3 border-t border-gray-200 dark:border-gray-700">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything..."
            rows={1}
            className="flex-1 resize-none rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isLoading}
            className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-40 hover:bg-blue-700 transition-colors"
          >
            ↑
          </button>
        </div>
        <p className="text-[10px] text-gray-400 mt-1.5 text-center">
          AI can make mistakes. Verify important info.
        </p>
      </div>
    </div>
  );
}

// ── Copilot Toggle Button ──

export function CopilotToggleButton({onClick, active}: {onClick: () => void; active: boolean}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'fixed bottom-6 right-6 z-40 w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-105',
        active
          ? 'bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-800'
          : 'bg-blue-600 text-white hover:bg-blue-700'
      )}
      title="AI Copilot"
    >
      <span className="text-lg">{active ? '✕' : '✨'}</span>
    </button>
  );
}

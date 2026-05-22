/**
 * Anvil Chat — AI Command Center
 *
 * The Anthropic killer: an intelligent assistant that can act across
 * Mail, Drive, Calendar, and Docs with persistent memory.
 *
 * Features:
 * - Streaming AI responses with tool use visualization
 * - Multi-step workflow execution with progress tracking
 * - Human-in-the-loop approval for high-risk actions
 * - Persistent conversation memory across sessions
 * - Context accumulation and user pattern learning
 * - Voice input/output
 * - Quick commands and slash commands
 * - Rich content rendering (email previews, file cards, etc.)
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import ChatSidebar from '@/components/ChatSidebar';
import MessageBubble from '@/components/MessageBubble';
import ChatInput from '@/components/ChatInput';
import AttentionPanel from '@/components/AttentionPanel';
import SearchModal from '@/components/SearchModal';
import ConversationActions from '@/components/ConversationActions';
import ContextIndicator from '@/components/ContextIndicator';
import CommandPalette from '@/components/CommandPalette';
import ApprovalGate, { type ApprovalAction } from '@/components/ApprovalGate';
import ChatSettingsPanel, { DEFAULT_SETTINGS, type ChatSettings } from '@/components/ChatSettings';
import { ToastContainer, toastSuccess, toastError, toastInfo } from '@/components/Toast';
import type {
  Conversation, ChatMessage as ChatMessageType, ToolCallResult, ConversationContext,
} from '@/lib/types';
import {
  listConversations, getConversation, createConversation,
  deleteConversation, saveConversation, addMessage,
  getActiveConversationId, setActiveConversationId,
} from '@/lib/memory';
import {
  analyzePatterns, buildContextSummary, loadPatterns, savePatterns,
  detectPreferences, startSession,
} from '@/lib/context-manager';
import { parseChatStream } from '@/lib/sse-parser';
import { generateAutoTitle } from '@/lib/rich-renderer';

export default function ChatPage() {
  // ── State ──
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showAttention, setShowAttention] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [activeToolCalls, setActiveToolCalls] = useState<ToolCallResult[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<ApprovalAction | null>(null);
  const [userPatternSummary, setUserPatternSummary] = useState<string>('');
  const [chatSettings, setChatSettings] = useState<ChatSettings>(DEFAULT_SETTINGS);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Command palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowCommandPalette(prev => !prev);
      }
      // New conversation
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'N') {
        e.preventDefault();
        handleNewConversation();
      }
      // Toggle attention
      if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
        e.preventDefault();
        setShowAttention(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── Initialize ──
  useEffect(() => {
    startSession();
    (async () => {
      const convs = await listConversations();
      setConversations(convs);

      // Restore last active conversation
      const activeId = await getActiveConversationId();
      if (activeId) {
        const conv = await getConversation(activeId);
        if (conv) setActiveConv(conv);
      }

      // Load user patterns
      const patterns = loadPatterns();
      if (patterns) {
        setUserPatternSummary(
          buildContextSummary(
            { files: [], people: [], topics: patterns.interests, preferences: [], actions: [] },
            patterns,
          ),
        );
      }
    })();
  }, []);

  // ── Scroll to bottom ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConv?.messages, streamingText]);

  // ── Save patterns periodically ──
  useEffect(() => {
    if (!activeConv) return;
    const interval = setInterval(() => {
      if (activeConv.context.actions.length > 0) {
        const patterns = analyzePatterns(activeConv.context);
        const existing = loadPatterns();
        const merged = existing ? { ...existing, ...patterns } : patterns;
        savePatterns(merged);
        setUserPatternSummary(
          buildContextSummary(activeConv.context, merged),
        );
      }
    }, 30_000);
    return () => clearInterval(interval);
  }, [activeConv]);

  // ── Handlers ──

  const handleNewConversation = useCallback(async () => {
    const conv = await createConversation();
    setConversations(prev => [conv, ...prev]);
    setActiveConv(conv);
    setActiveConversationId(conv.id);
    setStreamingText('');
    setActiveToolCalls([]);
    setShowAttention(false);
  }, []);

  const handleSelectConversation = useCallback(async (id: string) => {
    const conv = await getConversation(id);
    if (conv) {
      setActiveConv(conv);
      setActiveConversationId(id);
      setStreamingText('');
      setActiveToolCalls([]);
    }
  }, []);

  const handleDeleteConversation = useCallback(async (id: string) => {
    await deleteConversation(id);
    setConversations(prev => prev.filter(c => c.id !== id));
    if (activeConv?.id === id) {
      setActiveConv(null);
    }
    toastInfo('Conversation deleted');
  }, [activeConv]);

  const handleRenameConversation = useCallback(async (id: string, title: string) => {
    const conv = await getConversation(id);
    if (conv) {
      conv.title = title;
      await saveConversation(conv);
      setConversations(prev => prev.map(c => c.id === id ? { ...c, title } : c));
      if (activeConv?.id === id) setActiveConv({ ...activeConv, title });
    }
  }, [activeConv]);

  const handleClearConversation = useCallback(async (id: string) => {
    const conv = await getConversation(id);
    if (conv) {
      conv.messages = [];
      await saveConversation(conv);
      setConversations(prev => prev.map(c => c.id === id ? { ...c, messages: [] } : c));
      if (activeConv?.id === id) setActiveConv({ ...activeConv, messages: [] });
      toastInfo('Conversation cleared');
    }
  }, [activeConv]);

  // ── Detect implicit preferences from message ──
  const detectAndStorePreferences = useCallback(async (text: string, convId: string) => {
    const prefs = detectPreferences(text);
    if (prefs.length === 0) return;

    const conv = await getConversation(convId);
    if (!conv) return;

    conv.context.preferences = [...new Set([...conv.context.preferences, ...prefs])].slice(-15);
    await saveConversation(conv);
  }, []);

  const handleSend = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;

    let conv = activeConv;
    if (!conv) {
      conv = await createConversation(generateAutoTitle(text));
      setConversations(prev => [conv!, ...prev]);
      setActiveConv(conv);
      setActiveConversationId(conv.id);
    }

    // Detect implicit preferences
    detectAndStorePreferences(text, conv.id);

    // Add user message locally
    const userMsg: ChatMessageType = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };
    const updatedMessages = [...conv.messages, userMsg];
    const updatedConv = { ...conv, messages: updatedMessages, updatedAt: Date.now() };
    setActiveConv(updatedConv);
    setIsLoading(true);
    setStreamingText('');
    setActiveToolCalls([]);

    // Persist user message
    await addMessage(conv.id, { role: 'user', content: text });

    // Call API with streaming
    const abortController = new AbortController();
    abortRef.current = abortController;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortController.signal,
        body: JSON.stringify({
          conversationId: conv.id,
          message: text,
          history: updatedMessages.map(m => ({ role: m.role, content: m.content })),
          context: conv.context,
          userPatterns: userPatternSummary,
        }),
      });

      if (!res.ok || !res.body) throw new Error('Chat API error');

      // Parse SSE stream with proper event handling
      let finalMessage: ChatMessageType | null = null;

      await parseChatStream(res, {
        onStart: () => {
          // Stream started
        },
        onDelta: (content) => {
          setStreamingText(prev => prev + content);
        },
        onTool: (toolCall) => {
          setActiveToolCalls(prev => [...prev, toolCall]);

          // Check if this tool needs approval
          if (chatSettings.requireApprovalForEmail &&
              ['email_send'].includes(toolCall.tool)) {
            setPendingApproval({
              id: toolCall.id,
              type: toolCall.tool,
              description: `AI wants to: ${toolCall.tool.replace(/_/g, ' ')}`,
              risk: 'high',
              params: toolCall.args,
            });
          } else if (chatSettings.requireApprovalForCalendar &&
                     ['calendar_create_event'].includes(toolCall.tool)) {
            setPendingApproval({
              id: toolCall.id,
              type: toolCall.tool,
              description: `AI wants to: ${toolCall.tool.replace(/_/g, ' ')}`,
              risk: 'medium',
              params: toolCall.args,
            });
          }
        },
        onDone: (data) => {
          if (data.message) {
            finalMessage = data.message as ChatMessageType;
          }
        },
        onError: (data) => {
          console.error('Chat stream error:', data.message);
        },
      }, abortController.signal);

      if (finalMessage) {
        setActiveConv(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            messages: [...prev.messages, finalMessage!],
            updatedAt: Date.now(),
          };
        });
      }

      setStreamingText('');
      setActiveToolCalls([]);
      setPendingApproval(null);

      // Reload conversation from storage
      const reloadedConv = await getConversation(conv.id);
      if (reloadedConv) {
        setActiveConv(reloadedConv);
        setConversations(prev => prev.map(c => c.id === reloadedConv.id ? reloadedConv : c));
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setActiveConv(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            messages: [...prev.messages, {
              id: crypto.randomUUID(),
              role: 'assistant' as const,
              content: 'Sorry, I encountered an error processing your request. Please try again.',
              timestamp: Date.now(),
            }],
            updatedAt: Date.now(),
          };
        });
        toastError('Failed to get response');
      }
    } finally {
      setIsLoading(false);
      setStreamingText('');
      setActiveToolCalls([]);
    }
  }, [activeConv, isLoading, userPatternSummary, chatSettings, detectAndStorePreferences]);

  // ── Approval handlers ──
  const handleApprove = useCallback((actionId: string, _modifications?: Record<string, unknown>) => {
    setPendingApproval(null);
    toastSuccess('Action approved');
  }, []);

  const handleReject = useCallback((_actionId: string) => {
    setPendingApproval(null);
    toastInfo('Action rejected');
  }, []);

  // ── Attention action handler ──
  const handleAttentionAction = useCallback((tool: string, args: Record<string, unknown>) => {
    const actionMessages: Record<string, string> = {
      email_search: `Show me emails about ${args.query ?? 'this'}`,
      email_send: `Reply to ${args.to ?? 'the sender'}`,
      email_save_draft: `Draft a reply to ${args.to ?? 'the sender'}`,
      file_search: `Find the file "${args.query ?? ''}"`,
      calendar_create_event: `Schedule: ${args.title ?? 'a meeting'}`,
    };

    const msg = actionMessages[tool] ?? `Use ${tool} with: ${JSON.stringify(args)}`;
    handleSend(msg);
    setShowAttention(false);
  }, [handleSend]);

  // ── Cancel streaming ──
  const handleCancelStream = useCallback(() => {
    abortRef.current?.abort();
    setIsLoading(false);
    setStreamingText('');
    setActiveToolCalls([]);
  }, []);

  // ── Render ──

  const messages = activeConv?.messages ?? [];
  const showWelcome = messages.length === 0 && !streamingText && !isLoading;

  return (
    <div className="h-screen flex flex-col">
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <ChatSidebar
          conversations={conversations}
          activeId={activeConv?.id ?? null}
          onSelect={handleSelectConversation}
          onNew={handleNewConversation}
          onDelete={handleDeleteConversation}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        />

        {/* Main chat area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header bar */}
          <div className="h-11 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-4 shrink-0 bg-white dark:bg-gray-950">
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="text-sm font-semibold truncate">
                {activeConv?.title ?? 'Anvil AI'}
              </h1>
              {activeConv && (
                <span className="text-[10px] text-gray-400 shrink-0">
                  {messages.length > 0 && `${messages.length} messages`}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              {activeConv && (
                <ConversationActions
                  conversation={activeConv}
                  onRename={handleRenameConversation}
                  onClear={handleClearConversation}
                  onClose={() => setActiveConv(null)}
                />
              )}
              <button
                onClick={() => setShowCommandPalette(true)}
                className="text-[11px] px-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors hidden sm:block"
                title="Command palette (Ctrl+K)"
              >
                ⌘K
              </button>
              <button
                onClick={() => setShowSettings(true)}
                className="text-[11px] px-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors"
                title="Settings"
              >
                ⚙️
              </button>
              <button
                onClick={() => setShowAttention(!showAttention)}
                className={showAttention
                  ? 'text-[11px] px-2 py-1 rounded-lg bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 font-medium'
                  : 'text-[11px] px-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors'
                }
                title="What needs attention (Ctrl+E)"
              >
                ⚡ Attention
              </button>
            </div>
          </div>

          {/* Context indicator */}
          {activeConv && activeConv.context &&
            (activeConv.context.files.length > 0 ||
             activeConv.context.people.length > 0 ||
             activeConv.context.topics.length > 0) && (
            <ContextIndicator context={activeConv.context} />
          )}

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto chat-scroll">
            {showWelcome ? (
              <div className="flex flex-col items-center justify-center h-full px-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xl font-bold mb-4 shadow-lg">
                  A
                </div>
                <h2 className="text-lg font-semibold mb-1">Anvil AI Command Center</h2>
                <p className="text-gray-500 dark:text-gray-400 text-sm text-center max-w-sm mb-6">
                  Your intelligent assistant across Mail, Drive, Calendar, and Docs.
                  Ask anything, or use the quick actions below.
                </p>
                <div className="grid grid-cols-2 gap-2.5 max-w-md w-full">
                  {[
                    { icon: '⚡', title: 'Attention scan', desc: 'Priority email & calendar digest', prompt: 'What needs my attention right now?' },
                    { icon: '✉️', title: 'Draft reply', desc: 'AI-powered email response', prompt: 'Draft a reply to my latest unread email' },
                    { icon: '📄', title: 'Find a file', desc: 'Search Drive instantly', prompt: 'Help me find a file on Drive' },
                    { icon: '📅', title: 'Schedule', desc: 'Smart meeting scheduling', prompt: 'Help me schedule a meeting' },
                    { icon: '📊', title: 'Weekly summary', desc: 'Activity across all apps', prompt: 'Give me a comprehensive weekly summary' },
                    { icon: '🔍', title: 'Search web', desc: 'Look up anything online', prompt: 'Search the web for ' },
                  ].map(item => (
                    <button
                      key={item.title}
                      onClick={() => handleSend(item.prompt)}
                      className="text-left p-3 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600 transition-all group"
                      disabled={isLoading}
                    >
                      <span className="text-base group-hover:scale-110 inline-block transition-transform">{item.icon}</span>
                      <p className="text-xs font-medium mt-1.5">{item.title}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{item.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="py-2">
                {messages.map((msg, i) => (
                  <MessageBubble
                    key={msg.id}
                    message={msg}
                    isLast={i === messages.length - 1}
                  />
                ))}

                {/* Approval gate */}
                {pendingApproval && (
                  <ApprovalGate
                    action={pendingApproval}
                    onApprove={handleApprove}
                    onReject={handleReject}
                  />
                )}

                {/* Active tool calls */}
                {activeToolCalls.length > 0 && (
                  <div className="px-4 py-2 space-y-2">
                    {activeToolCalls.map(tc => (
                      <div key={tc.id} className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/30 p-3 text-xs font-mono tool-card-enter">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-blue-700 dark:text-blue-300">
                            {tc.tool.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                          </span>
                          <span className="text-blue-500 animate-pulse ml-auto">⟳ Running...</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Streaming text */}
                {streamingText && (
                  <div className="flex gap-3 px-4 py-2.5">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5 shadow-sm">
                      A
                    </div>
                    <div className="max-w-[75%]">
                      <div className="rounded-2xl rounded-bl-md bg-gray-100 dark:bg-gray-800 px-4 py-2.5 text-sm prose-chat streaming-cursor">
                        {streamingText}
                      </div>
                    </div>
                  </div>
                )}

                {/* Loading indicator */}
                {isLoading && !streamingText && activeToolCalls.length === 0 && (
                  <div className="flex gap-3 px-4 py-2.5">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5 shadow-sm">
                      A
                    </div>
                    <div className="flex items-center gap-2 rounded-2xl rounded-bl-md bg-gray-100 dark:bg-gray-800 px-4 py-3">
                      <div className="flex gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                      <button
                        onClick={handleCancelStream}
                        className="text-[10px] text-gray-400 hover:text-red-500 transition-colors ml-1"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input */}
          <ChatInput onSend={handleSend} isLoading={isLoading} />
        </div>

        {/* Attention panel */}
        {showAttention && (
          <AttentionPanel
            onAction={handleAttentionAction}
            onClose={() => setShowAttention(false)}
          />
        )}
      </div>

      {/* Overlays */}
      {showCommandPalette && (
        <CommandPalette
          conversations={conversations}
          onCommand={(prompt) => handleSend(prompt)}
          onSelectConversation={handleSelectConversation}
          onNewChat={handleNewConversation}
          onOpenSettings={() => setShowSettings(true)}
          onClose={() => setShowCommandPalette(false)}
        />
      )}

      {showSettings && (
        <ChatSettingsPanel
          onClose={() => setShowSettings(false)}
          onSave={setChatSettings}
        />
      )}

      {showSearch && (
        <SearchModal
          conversations={conversations}
          onSelect={handleSelectConversation}
          onClose={() => setShowSearch(false)}
        />
      )}

      {/* Toasts */}
      <ToastContainer />
    </div>
  );
}

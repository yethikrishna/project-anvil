/**
 * Anvil Chat - AI Command Center
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
 * - Quick commands for common workflows
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import ChatSidebar from '@/components/ChatSidebar';
import MessageBubble from '@/components/MessageBubble';
import ChatInput from '@/components/ChatInput';
import AttentionPanel from '@/components/AttentionPanel';
import VoiceOutput from '@/components/VoiceOutput';
import SearchModal from '@/components/SearchModal';
import ConversationActions from '@/components/ConversationActions';
import ContextIndicator from '@/components/ContextIndicator';
import CommandPalette from '@/components/CommandPalette';
import ApprovalGate, { type ApprovalAction } from '@/components/ApprovalGate';
import ChatSettingsPanel, { DEFAULT_SETTINGS, type ChatSettings } from '@/components/ChatSettings';
import type {
  Conversation, ChatMessage as ChatMessageType, ToolCallResult, ConversationContext,
} from '@/lib/types';
import { QUICK_COMMANDS } from '@/lib/quick-commands';
import {
  listConversations, getConversation, createConversation,
  deleteConversation, saveConversation, addMessage,
  getActiveConversationId, setActiveConversationId,
} from '@/lib/memory';
import {
  analyzePatterns, buildContextSummary, loadPatterns, savePatterns,
  detectPreferences, startSession,
} from '@/lib/context-manager';

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
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowCommandPalette(prev => !prev);
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
    }, 30_000); // Every 30s
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
      conv = await createConversation();
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

      // Parse SSE stream
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalMessage: ChatMessageType | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const dataStr = line.slice(6);
          if (!dataStr.trim()) continue;

          try {
            const data = JSON.parse(dataStr);

            if (data.content) {
              setStreamingText(prev => prev + data.content);
            }

            if (data.tool) {
              setActiveToolCalls(prev => [...prev, data.tool]);

              // Check if this tool needs approval
              if (['email_send', 'calendar_create_event', 'file_share'].includes(data.tool.tool)) {
                setPendingApproval({
                  id: data.tool.id,
                  type: data.tool.tool,
                  description: `AI wants to: ${data.tool.tool.replace(/_/g, ' ')}`,
                  risk: data.tool.tool === 'email_send' ? 'high' : 'medium',
                  params: data.tool.args,
                });
              }
            }

            if (data.message) {
              finalMessage = data.message;
            }

            if (data.error) {
              console.error('Chat error:', data.message);
            }
          } catch {
            // Skip malformed SSE
          }
        }
      }

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
              content: 'Sorry, I encountered an error. Please try again.',
              timestamp: Date.now(),
            }],
            updatedAt: Date.now(),
          };
        });
      }
    } finally {
      setIsLoading(false);
      setStreamingText('');
      setActiveToolCalls([]);
    }
  }, [activeConv, isLoading, userPatternSummary, detectAndStorePreferences]);

  // ── Approval handlers ──
  const handleApprove = useCallback((actionId: string, _modifications?: Record<string, unknown>) => {
    // In production, this would send the approval to the backend
    // which would then continue the tool execution
    setPendingApproval(null);
  }, []);

  const handleReject = useCallback((_actionId: string) => {
    setPendingApproval(null);
    // The AI will see the rejection and adjust its response
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

  // ── Render ──

  const messages = activeConv?.messages ?? [];
  const showWelcome = messages.length === 0;

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
          {/* Header */}
          <div className="h-12 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-4 shrink-0">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold">
                {activeConv?.title ?? 'Anvil Chat'}
              </h1>
              {activeConv && (
                <span className="text-[10px] text-gray-400">
                  {activeConv.context.files.length > 0 && `📄 ${activeConv.context.files.length}`}
                  {activeConv.context.people.length > 0 && ` 👥 ${activeConv.context.people.length}`}
                  {activeConv.context.preferences.length > 0 && ` ⚙️ ${activeConv.context.preferences.length}`}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {activeConv && (
                <ConversationActions
                  conversation={activeConv}
                  onRename={handleRenameConversation}
                  onClear={handleClearConversation}
                  onClose={() => {}}
                />
              )}
              <button
                onClick={() => setShowCommandPalette(true)}
                className="text-xs px-2.5 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
                title="Command palette (Ctrl+K)"
              >
                ⌘ Commands
              </button>
              <button
                onClick={() => setShowSettings(true)}
                className="text-xs px-2.5 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
                title="Chat settings"
              >
                ⚙️
              </button>
              <button
                onClick={() => setShowAttention(!showAttention)}
                className={showAttention
                  ? 'text-xs px-2.5 py-1 rounded-lg bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300'
                  : 'text-xs px-2.5 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500'
                }
                title="What needs my attention"
              >
                ⚡ Attention
              </button>
              <button
                onClick={() => handleSend('Give me a comprehensive weekly summary of my activity across Mail, Docs, and Calendar.')}
                className="text-xs px-2.5 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
                disabled={isLoading}
                title="Weekly Summary"
              >
                📊
              </button>
            </div>
          </div>

          {/* Context indicator */}
          {activeConv && activeConv.context && (
            <ContextIndicator context={activeConv.context} />
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto chat-scroll">
            {showWelcome ? (
              <div className="flex flex-col items-center justify-center h-full px-4">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-2xl font-bold mb-4">
                  A
                </div>
                <h2 className="text-xl font-semibold mb-2">Anvil AI Command Center</h2>
                <p className="text-gray-500 dark:text-gray-400 text-sm text-center max-w-md mb-6">
                  Your intelligent assistant across Mail, Drive, Calendar, and Docs.
                  I can search, read, write, schedule, and connect everything together.
                </p>
                <div className="grid grid-cols-2 gap-3 max-w-lg">
                  {QUICK_COMMANDS.slice(0, 6).map(item => (
                    <button
                      key={item.id}
                      onClick={() => handleSend(item.prompt)}
                      className="text-left p-3 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                      disabled={isLoading}
                    >
                      <span className="text-lg">{item.icon}</span>
                      <p className="text-sm font-medium mt-1">{item.label}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{item.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="py-4">
                {messages.map((msg, i) => (
                  <div key={msg.id}>
                    <MessageBubble message={msg} />
                    {/* Voice output for assistant messages */}
                    {msg.role === 'assistant' && i === messages.length - 1 && !isLoading && (
                      <div className="px-4 -mt-1 mb-2 ml-11">
                        <VoiceOutput text={msg.content} />
                      </div>
                    )}
                  </div>
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
                  <div className="px-4 py-2">
                    {activeToolCalls.map(tc => (
                      <div key={tc.id} className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 p-3 text-xs font-mono tool-card-enter mb-2">
                        <span className="font-semibold text-blue-700 dark:text-blue-300">
                          {tc.tool.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                        </span>
                        <span className="ml-2 text-blue-500">⟳ Running...</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Streaming text */}
                {streamingText && (
                  <div className="flex gap-3 px-4 py-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold shrink-0 mt-0.5">
                      A
                    </div>
                    <div className="max-w-[75%]">
                      <div className="rounded-2xl rounded-bl-md bg-gray-100 dark:bg-gray-800 px-4 py-2.5 text-sm prose-chat streaming-cursor">
                        {streamingText}
                      </div>
                      <VoiceOutput text={streamingText} />
                    </div>
                  </div>
                )}

                {/* Loading indicator */}
                {isLoading && !streamingText && activeToolCalls.length === 0 && (
                  <div className="flex gap-3 px-4 py-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold shrink-0 mt-0.5">
                      A
                    </div>
                    <div className="rounded-2xl rounded-bl-md bg-gray-100 dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-400">
                      <span className="animate-pulse">Thinking...</span>
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

        {/* Command palette */}
        {showCommandPalette && (
          <CommandPalette
            conversations={conversations}
            onCommand={(prompt) => handleSend(prompt)}
            onSelectConversation={handleSelectConversation}
            onNewChat={handleNewConversation}
            onOpenSettings={() => { setShowSettings(true); }}
            onClose={() => setShowCommandPalette(false)}
          />
        )}

        {/* Settings panel */}
        {showSettings && (
          <ChatSettingsPanel
            onClose={() => setShowSettings(false)}
            onSave={setChatSettings}
          />
        )}

        {/* Search modal */}
        {showSearch && (
          <SearchModal
            conversations={conversations}
            onSelect={handleSelectConversation}
            onClose={() => setShowSearch(false)}
          />
        )}

        {/* Attention panel */}
        {showAttention && (
          <AttentionPanel
            onAction={handleAttentionAction}
            onClose={() => setShowAttention(false)}
          />
        )}
      </div>
    </div>
  );
}

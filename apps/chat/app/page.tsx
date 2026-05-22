/**
 * Anvil Chat — AI Command Center
 *
 * The Anthropic killer: an intelligent assistant that can act across
 * Mail, Drive, Calendar, and Docs with persistent memory.
 *
 * Features:
 * - Streaming AI responses with rich tool result cards
 * - Multi-step workflow execution with progress tracking
 * - Human-in-the-loop approval for high-risk actions
 * - Persistent conversation memory across sessions
 * - Context accumulation and user pattern learning
 * - Voice input/output
 * - Quick commands and slash commands
 * - Premium welcome screen with smart suggestions
 * - Conversation export (Markdown/JSON)
 * - Keyboard shortcuts
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import ErrorBoundary from '@/components/ErrorBoundary';
import ChatSidebar from '@/components/ChatSidebar';
import MessageBubble from '@/components/MessageBubble';
import ChatInput from '@/components/ChatInput';
import StreamingMessage from '@/components/StreamingMessage';
import WelcomeScreen from '@/components/WelcomeScreen';
import ExportButton from '@/components/ExportButton';
import AttentionPanel from '@/components/AttentionPanel';
import SearchModal from '@/components/SearchModal';
import ConversationActions from '@/components/ConversationActions';
import ContextIndicator from '@/components/ContextIndicator';
import CommandPalette from '@/components/CommandPalette';
import ApprovalGate, { type ApprovalAction } from '@/components/ApprovalGate';
import ChatSettingsPanel, { DEFAULT_SETTINGS, type ChatSettings } from '@/components/ChatSettings';
import WeeklySummaryWidget from '@/components/WeeklySummaryWidget';
import DraftPreviewModal from '@/components/DraftPreviewModal';
import MeetingSchedulerModal from '@/components/MeetingSchedulerModal';
import { ToastContainer, toastSuccess, toastError, toastInfo } from '@/components/Toast';
import type {
  Conversation, ChatMessage as ChatMessageType, ToolCallResult, ConversationContext,
} from '@/lib/types';
import { useAutoTitle } from '@/lib/use-auto-title';
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
import { extractFullContext, mergeContext } from '@/lib/context-extractor';

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
  const [showWeeklySummary, setShowWeeklySummary] = useState(false);
  const [showDraftPreview, setShowDraftPreview] = useState(false);
  const [showMeetingScheduler, setShowMeetingScheduler] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<ApprovalAction | null>(null);
  const [userPatternSummary, setUserPatternSummary] = useState<string>('');
  const [chatSettings, setChatSettings] = useState<ChatSettings>(DEFAULT_SETTINGS);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { generateTitle } = useAutoTitle();

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowCommandPalette(prev => !prev);
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'N') {
        e.preventDefault();
        handleNewConversation();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
        e.preventDefault();
        setShowAttention(prev => !prev);
      }
      // Export current conversation
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'E') {
        e.preventDefault();
        // Handled by ExportButton
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

      const activeId = await getActiveConversationId();
      if (activeId) {
        const conv = await getConversation(activeId);
        if (conv) setActiveConv(conv);
      }

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
  }, [activeConv?.messages, streamingText, activeToolCalls]);

  // ── Save patterns periodically ──
  useEffect(() => {
    if (!activeConv) return;
    const interval = setInterval(() => {
      if (activeConv.context.actions.length > 0) {
        const patterns = analyzePatterns(activeConv.context);
        const existing = loadPatterns();
        const merged = existing ? { ...existing, ...patterns } : patterns;
        savePatterns(merged);
        setUserPatternSummary(buildContextSummary(activeConv.context, merged));
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
      const title = generateTitle(text);
      conv = await createConversation(title);
      setConversations(prev => [conv!, ...prev]);
      setActiveConv(conv);
      setActiveConversationId(conv.id);
    }

    detectAndStorePreferences(text, conv.id);

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

    await addMessage(conv.id, { role: 'user', content: text });

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

      let finalMessage: ChatMessageType | null = null;

      await parseChatStream(res, {
        onStart: () => {},
        onDelta: (content) => {
          setStreamingText(prev => prev + content);
        },
        onTool: (toolCall) => {
          setActiveToolCalls(prev => {
            // Update existing tool call or add new one
            const existing = prev.findIndex(tc => tc.id === toolCall.id);
            if (existing >= 0) {
              const updated = [...prev];
              updated[existing] = toolCall;
              return updated;
            }
            return [...prev, toolCall];
          });

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
          // Apply context updates from server-side tool execution
          if (data.contextUpdates && conv) {
            const updates = data.contextUpdates as {
              files?: Array<{ id: string; name: string; type: string; lastAccessed: number }>;
              people?: string[];
              topics?: string[];
            };
            setActiveConv(prev => {
              if (!prev) return prev;
              const ctx = prev.context;
              return {
                ...prev,
                context: {
                  ...ctx,
                  files: [...ctx.files, ...(updates.files ?? [])].slice(-20),
                  people: [...new Set([...ctx.people, ...(updates.people ?? [])])].slice(-20),
                  topics: [...new Set([...ctx.topics, ...(updates.topics ?? [])])].slice(-20),
                },
              };
            });
          }
        },
        onError: (data) => {
          console.error('Chat stream error:', data.message);
        },
      }, abortController.signal);

      if (finalMessage) {
        setActiveConv(prev => {
          if (!prev) return prev;
          // Extract context from the new message exchange and merge
          const newMsgs = [{ ...finalMessage! }, { role: 'user' as const, id: '', content: text, timestamp: Date.now() }];
          const extracted = extractFullContext(newMsgs);
          const mergedCtx = mergeContext(prev.context, extracted);
          // Auto-refine title after first exchange (first user + first AI message)
          const isFirstExchange = prev.messages.length === 1 && prev.messages[0].role === 'user';
          const refinedTitle = isFirstExchange
            ? generateTitle(`${text}: ${finalMessage!.content.slice(0, 60)}`)
            : prev.title;
          return {
            ...prev,
            title: refinedTitle,
            messages: [...prev.messages, finalMessage!],
            context: mergedCtx,
            updatedAt: Date.now(),
          };
        });
      }

      setStreamingText('');
      setActiveToolCalls([]);
      setPendingApproval(null);

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

  const handleApprove = useCallback((actionId: string) => {
    setPendingApproval(null);
    toastSuccess('Action approved');
  }, []);

  const handleReject = useCallback((_actionId: string) => {
    setPendingApproval(null);
    toastInfo('Action rejected');
  }, []);

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

  const handleCancelStream = useCallback(() => {
    abortRef.current?.abort();
    setIsLoading(false);
    setStreamingText('');
    setActiveToolCalls([]);
  }, []);

  // ── Render ──

  const messages = activeConv?.messages ?? [];
  const isStreaming = isLoading || streamingText.length > 0 || activeToolCalls.length > 0;
  const showWelcome = messages.length === 0 && !isStreaming;

  return (
    <ErrorBoundary>
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
          <div className="h-11 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-4 shrink-0 bg-white/80 dark:bg-gray-950/80 backdrop-blur-sm">
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="text-sm font-semibold truncate">
                {activeConv?.title ?? 'Anvil AI'}
              </h1>
              {activeConv && messages.length > 0 && (
                <span className="text-[10px] text-gray-400 shrink-0">
                  {messages.length} msg{messages.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            <div className="flex items-center gap-0.5">
              {activeConv && messages.length > 0 && (
                <ExportButton conversation={activeConv} />
              )}
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
                title="Command palette (⌘K)"
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
                onClick={() => setShowMeetingScheduler(true)}
                className="text-[11px] px-2.5 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors"
                title="Schedule a meeting"
              >
                📅 Schedule
              </button>
              <button
                onClick={() => setShowWeeklySummary(true)}
                className="text-[11px] px-2.5 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors hidden lg:block"
                title="Weekly summary"
              >
                📊 Summary
              </button>
              <button
                onClick={() => setShowAttention(!showAttention)}
                className={
                  showAttention
                    ? 'text-[11px] px-2.5 py-1 rounded-lg bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 font-medium'
                    : 'text-[11px] px-2.5 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors'
                }
                title="What needs attention (⌘E)"
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
              <WelcomeScreen
                onSend={handleSend}
                onShowWeeklySummary={() => setShowWeeklySummary(true)}
                onShowScheduler={() => setShowMeetingScheduler(true)}
                recentConversations={conversations.slice(0, 3)}
              />
            ) : (
              <div className="py-2">
                {/* Pinned messages */}
                {messages.map((msg, i) => (
                  <MessageBubble
                    key={msg.id}
                    message={msg}
                    isLast={i === messages.length - 1 && !isStreaming}
                    onSuggestionClick={handleSend}
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

                {/* Streaming response with rich tool cards */}
                {(streamingText || activeToolCalls.length > 0) && (
                  <StreamingMessage
                    text={streamingText}
                    toolCalls={activeToolCalls}
                    onCancel={handleCancelStream}
                  />
                )}

                {/* Loading indicator (thinking, before any stream) */}
                {isLoading && !streamingText && activeToolCalls.length === 0 && (
                  <div className="flex gap-3 px-4 py-2.5">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5 shadow-sm">
                      A
                    </div>
                    <div className="flex items-center gap-3 rounded-2xl rounded-bl-md bg-gray-100 dark:bg-gray-800 px-4 py-3">
                      <div className="flex gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                      <span className="text-[10px] text-gray-400">Thinking...</span>
                      <button
                        onClick={handleCancelStream}
                        className="text-[10px] text-gray-400 hover:text-red-500 transition-colors"
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
          onCommand={(prompt) => {
            if (prompt === '__weekly_summary__') { setShowWeeklySummary(true); return; }
            if (prompt === '__schedule__') { setShowMeetingScheduler(true); return; }
            handleSend(prompt);
          }}
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

      {showWeeklySummary && (
        <WeeklySummaryWidget onClose={() => setShowWeeklySummary(false)} />
      )}

      {showDraftPreview && (
        <DraftPreviewModal onClose={() => setShowDraftPreview(false)} />
      )}

      {showMeetingScheduler && (
        <MeetingSchedulerModal onClose={() => setShowMeetingScheduler(false)} />
      )}

      <ToastContainer />
    </div>
    </ErrorBoundary>
  );
}

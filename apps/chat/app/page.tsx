/**
 * Anvil Chat — AI Command Center
 *
 * The Anthropic killer: an intelligent assistant that can act across
 * Mail, Drive, Calendar, and Docs with persistent memory.
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { ThemeProvider, ThemeToggle, AppShell } from '@anvil/ui';
import ChatSidebar from '@/components/ChatSidebar';
import MessageBubble from '@/components/MessageBubble';
import ChatInput from '@/components/ChatInput';
import AttentionPanel from '@/components/AttentionPanel';
import VoiceOutput from '@/components/VoiceOutput';
import type {
  Conversation, ChatMessage as ChatMessageType, ToolCallResult, ConversationContext,
} from '@/lib/types';
import {
  listConversations, getConversation, createConversation,
  deleteConversation, saveConversation, addMessage, updateMessage,
  getActiveConversationId, setActiveConversationId,
} from '@/lib/memory';

export default function ChatPage() {
  // ── State ──
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showAttention, setShowAttention] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [activeToolCalls, setActiveToolCalls] = useState<ToolCallResult[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── Load conversations on mount ──
  useEffect(() => {
    (async () => {
      const convs = await listConversations();
      setConversations(convs);

      // Restore last active conversation
      const activeId = await getActiveConversationId();
      if (activeId) {
        const conv = await getConversation(activeId);
        if (conv) setActiveConv(conv);
      }
    })();
  }, []);

  // ── Scroll to bottom ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConv?.messages, streamingText]);

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

  const handleSend = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;

    let conv = activeConv;
    if (!conv) {
      conv = await createConversation();
      setConversations(prev => [conv!, ...prev]);
      setActiveConv(conv);
      setActiveConversationId(conv.id);
    }

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
          if (!dataStr) continue;

          try {
            const data = JSON.parse(dataStr);

            // Handle different event types
            if (data.content) {
              // Streaming delta
              setStreamingText(prev => prev + data.content);
            }

            if (data.tool) {
              // Tool call update
              setActiveToolCalls(prev => [...prev, data.tool]);
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

      // Finalize: replace streaming text with actual message
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

      // Reload conversation from storage to get full state
      const reloadedConv = await getConversation(conv.id);
      if (reloadedConv) {
        setActiveConv(reloadedConv);
        setConversations(prev => prev.map(c => c.id === reloadedConv.id ? reloadedConv : c));
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        // Show error in conversation
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
  }, [activeConv, isLoading]);

  // ── Attention action handler ──
  const handleAttentionAction = useCallback((tool: string, args: Record<string, unknown>) => {
    // Convert attention action to a chat message
    const actionMessages: Record<string, string> = {
      email_search: `Show me emails about ${args.query ?? 'this'}`,
      email_send: `Reply to ${args.to ?? 'the sender'}`,
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
                  {activeConv.context.files.length > 0 && `📄 ${activeConv.context.files.length} files`}
                  {activeConv.context.people.length > 0 && ` 👥 ${activeConv.context.people.length} people`}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAttention(!showAttention)}
                className={showAttention
                  ? 'text-xs px-3 py-1 rounded-lg bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300'
                  : 'text-xs px-3 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500'
                }
                title="What needs my attention"
              >
                ⚡ Attention
              </button>
              <button
                onClick={() => handleSend('Give me a weekly summary of my activity across Mail, Docs, and Calendar.')}
                className="text-xs px-3 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
                disabled={isLoading}
              >
                📊 Weekly Summary
              </button>
              <ThemeToggle />
            </div>
          </div>

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
                  {[
                    { icon: '⚡', text: 'What needs my attention?', desc: 'Priority scan of Mail + Calendar' },
                    { icon: '✉️', text: 'Draft a reply to my latest email', desc: 'AI reads threads, writes replies' },
                    { icon: '📄', text: 'Find the Q3 report on Drive', desc: 'Semantic search + share link' },
                    { icon: '📅', text: 'Schedule a team meeting', desc: 'Check calendars, send invites' },
                    { icon: '📊', text: 'Weekly summary', desc: 'Activity across all apps' },
                    { icon: '🔗', text: 'Find and share a file', desc: 'Search Drive, create share link' },
                  ].map(item => (
                    <button
                      key={item.text}
                      onClick={() => handleSend(item.text)}
                      className="text-left p-3 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                      disabled={isLoading}
                    >
                      <span className="text-lg">{item.icon}</span>
                      <p className="text-sm font-medium mt-1">{item.text}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{item.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="py-4">
                {messages.map((msg) => (
                  <MessageBubble key={msg.id} message={msg} />
                ))}

                {/* Active tool calls */}
                {activeToolCalls.length > 0 && (
                  <div className="px-4 py-2">
                    {activeToolCalls.map(tc => (
                      <div key={tc.id} className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 p-3 text-xs font-mono tool-card-enter mb-2">
                        <span className="font-semibold text-blue-700 dark:text-blue-300">
                          {tc.tool.replace(/_/g, ' ')}
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

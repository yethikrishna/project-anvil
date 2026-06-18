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
import MemorySearchModal from '@/components/MemorySearchModal';
import ConversationActions from '@/components/ConversationActions';
import ContextIndicator from '@/components/ContextIndicator';
import CommandPalette from '@/components/CommandPalette';
import ApprovalGate, { type ApprovalAction } from '@/components/ApprovalGate';
import ChatSettingsPanel, { DEFAULT_SETTINGS, type ChatSettings } from '@/components/ChatSettings';
import WeeklySummaryWidget from '@/components/WeeklySummaryWidget';
import DraftPreviewModal from '@/components/DraftPreviewModal';
import { ReplyThreadModal } from '@/components/ReplyThreadModal';
import type { ReplyDraft } from '@/components/ReplyThreadModal';
import SmartCompose from '@/components/SmartCompose';
import MeetingSchedulerModal from '@/components/MeetingSchedulerModal';
import MeetingPrepPanel from '@/components/MeetingPrepPanel';
import PinnedMessages from '@/components/PinnedMessages';
import SaveToDocsModal from '@/components/SaveToDocsModal';
import ThemeToggle from '@/components/ThemeToggle';
import NotificationBell from '@/components/NotificationBell';
import FollowUpPanel from '@/components/FollowUpPanel';
import { ToastContainer, toastSuccess, toastError, toastInfo } from '@/components/Toast';
import SmartSearchModal from '@/components/SmartSearchModal';
import ChainProgress from '@/components/ChainProgress';
import { useChain } from '@/lib/use-chain';
import type {
  Conversation, ChatMessage as ChatMessageType, ToolCallResult, ConversationContext,
} from '@/lib/types';
import { useAutoTitle } from '@/lib/use-auto-title';
import {
  listConversations, getConversation, createConversation,
  deleteConversation, saveConversation, addMessage,
  getActiveConversationId, setActiveConversationId,
  syncConversationToServer, syncFromServer,
} from '@/lib/memory';
import {
  analyzePatterns, buildContextSummary, loadPatterns, savePatterns,
  detectPreferences, startSession,
} from '@/lib/context-manager';
import { parseChatStream } from '@/lib/sse-parser';
import { generateAutoTitle } from '@/lib/rich-renderer';
import { extractFullContext, mergeContext } from '@/lib/context-extractor';
import { maybeAutoSummarize } from '@/lib/conversation-summarizer';
import ContextPanel from '@/components/ContextPanel';
import AttentionBadge from '@/components/AttentionBadge';
import ProactiveNotifications from '@/components/ProactiveNotifications';
import TaskExtractionPanel from '@/components/TaskExtractionPanel';
import InboxTriagePanel from '@/components/InboxTriagePanel';
import ActionHistory, { type ActionRecord } from '@/components/ActionHistory';
import { useAttentionBadge } from '@/lib/use-attention-badge';
import { useSmartInsights } from '@/lib/use-smart-insights';
import type { AttachedFile } from '@/components/ChatInput';
import { syncPatternsToServer, fetchPatternsFromServer } from '@/lib/memory';
import { startWarmup, registerVisibilityRefresh } from '@/lib/smart-warmup';
import { learnFromTurnProactive, buildProactiveContext } from '@/lib/proactive-context';
import PersonaSelector, { PERSONAS, loadPersona, type Persona } from '@/components/PersonaSelector';
import ConversationInsights from '@/components/ConversationInsights';
import ConversationForkModal, { type ForkConfig } from '@/components/ConversationForkModal';
import AgentActivityMonitor, { toolCallsToAgentSteps } from '@/components/AgentActivityMonitor';
import KeyboardShortcutsHelp from '@/components/KeyboardShortcutsHelp';
import ConversationExportMenu from '@/components/ConversationExportMenu';
import MemoryManagerPanel from '@/components/MemoryManagerPanel';
import AttentionToast from '@/components/AttentionToast';
import { useRealtimeEvents } from '@/hooks/useRealtimeEvents';
import ChatAnalyticsPanel from '@/components/ChatAnalyticsPanel';
import GoalAutopilotPanel from '@/components/GoalAutopilotPanel';
import SmartPaste, { useSmartPaste } from '@/components/SmartPaste';
import LiveContextSidebar from '@/components/LiveContextSidebar';
import ThinkingDisplay from '@/components/ThinkingDisplay';

export default function ChatPage() {
  // ── State ──
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showAttention, setShowAttention] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [streamingThinking, setStreamingThinking] = useState('');
  const [activeToolCalls, setActiveToolCalls] = useState<ToolCallResult[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [showSmartSearch, setShowSmartSearch] = useState(false);
  const [showMemorySearch, setShowMemorySearch] = useState(false);
  const [showWeeklySummary, setShowWeeklySummary] = useState(false);
  const [showDraftPreview, setShowDraftPreview] = useState(false);
  const [pendingReplyDraft, setPendingReplyDraft] = useState<ReplyDraft | null>(null);
  const [showSmartCompose, setShowSmartCompose] = useState(false);
  const [showMeetingScheduler, setShowMeetingScheduler] = useState(false);
  const [meetingPrepData, setMeetingPrepData] = useState<{ title?: string; startTime?: string; attendees?: string[] } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showPinnedMessages, setShowPinnedMessages] = useState(false);
  const [showContextPanel, setShowContextPanel] = useState(false);
  const [showTaskPanel, setShowTaskPanel] = useState(false);
  const [showInboxTriage, setShowInboxTriage] = useState(false);
  const [showActionHistory, setShowActionHistory] = useState(false);
  const [actionHistory, setActionHistory] = useState<ActionRecord[]>([]);
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [saveToDocsContent, setSaveToDocsContent] = useState<string | null>(null);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [pendingApproval, setPendingApproval] = useState<ApprovalAction | null>(null);
  const [approvedToolIds, setApprovedToolIds] = useState<Set<string>>(new Set());
  const pendingConvRef = useRef<string | null>(null);
  const [userPatternSummary, setUserPatternSummary] = useState<string>('');
  const [chatSettings, setChatSettings] = useState<ChatSettings>(DEFAULT_SETTINGS);
  const [agentMode, setAgentMode] = useState(false);
  const chain = useChain();
  const [chainVisible, setChainVisible] = useState(false);
  const [renamingConvId, setRenamingConvId] = useState<string | null>(null);
  const [activePersona, setActivePersona] = useState<Persona>(() => loadPersona());
  const [showPersonaSelector, setShowPersonaSelector] = useState(false);
  const [showInsights, setShowInsights] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [forkMessage, setForkMessage] = useState<ChatMessageType | null>(null);
  const [showAgentMonitor, setShowAgentMonitor] = useState(false);
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  const [showMemoryManager, setShowMemoryManager] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showAutopilot, setShowAutopilot] = useState(false);
  const [showLiveContext, setShowLiveContext] = useState(false);
  const { pasteEvent, clearPaste } = useSmartPaste(80);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { generateTitle } = useAutoTitle();

  // ── Realtime events (SSE) ──
  const { latestAlert, dismissAlert } = useRealtimeEvents();

  // ── Attention badge (background scanner) ──
  const { badgeCount, urgentItems, lastFetched, isLoading: attLoading, refresh: refreshAttention } = useAttentionBadge({ enabled: true });
  const { insightsSummary } = useSmartInsights(conversations);

  // ── Relationship graph ingestion (client-side, after each turn) ──
  // We run this whenever the active conversation's context updates
  const prevContextRef = useRef<string>('');
  useEffect(() => {
    const ctx = activeConv?.context;
    if (!ctx) return;
    const sig = JSON.stringify({ people: ctx.people, topics: ctx.topics, actions: ctx.actions?.length });
    if (sig === prevContextRef.current) return;
    prevContextRef.current = sig;
    // Dynamically import to avoid SSR
    import('@/lib/relationship-graph').then(({ ingestContext }) => {
      if (activeConv?.messages) {
        ingestContext(ctx, activeConv.messages.map(m => ({ role: m.role, content: m.content })));
      }
    }).catch(() => {});
  }, [activeConv?.context, activeConv?.messages]);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowCommandPalette(prev => !prev);
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'K') {
        e.preventDefault();
        setShowSmartSearch(prev => !prev);
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'N') {
        e.preventDefault();
        handleNewConversation();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        setShowSearch(prev => !prev);
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'M') {
        e.preventDefault();
        setShowMemorySearch(prev => !prev);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
        e.preventDefault();
        setShowAttention(prev => !prev);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
        e.preventDefault();
        setShowPinnedMessages(prev => !prev);
      }
      if (e.key === 'Escape') {
        setShowCommandPalette(false);
        setShowSearch(false);
        setShowSmartSearch(false);
        setShowPinnedMessages(false);
        setShowPersonaSelector(false);
        setShowInsights(false);
        setShowKeyboardHelp(false);
        setShowMemoryManager(false);
      }
      // '?' to show keyboard shortcuts (when not typing in an input)
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        setShowKeyboardHelp(prev => !prev);
      }
      // Alt+1-5 for persona switching
      if (e.altKey && !e.ctrlKey && !e.metaKey && ['1','2','3','4','5'].includes(e.key)) {
        e.preventDefault();
        const idx = parseInt(e.key) - 1;
        if (idx >= 0 && idx < PERSONAS.length) {
          setActivePersona(PERSONAS[idx]);
          // savePersona is imported from PersonaSelector
          import('@/components/PersonaSelector').then(({ savePersona }) => savePersona(PERSONAS[idx])).catch(() => {});
        }
      }
      // Export current conversation
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'E') {
        e.preventDefault();
        // Handled by ExportButton
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'A') {
        e.preventDefault();
        setShowAnalytics(prev => !prev);
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'G') {
        e.preventDefault();
        setShowAutopilot(prev => !prev);
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'L') {
        e.preventDefault();
        setShowLiveContext(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── Initialize ──
  useEffect(() => {
    startSession();
    startWarmup('default');
    const cleanupVisibility = registerVisibilityRefresh('default');
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

      // Background: pull from server for cross-device sync
      syncFromServer().then(merged => {
        if (merged > 0) {
          listConversations().then(updated => setConversations(updated)).catch(console.error);
        }
      }).catch(() => { /* silent */ });

      // Load patterns from server (cross-device context restore)
      fetchPatternsFromServer().then(serverPatterns => {
        if (serverPatterns) {
          const localPatterns = loadPatterns();
          // Merge server patterns into local — local takes precedence
          // Use unknown cast to avoid structural mismatch TypeScript errors
          const merged = localPatterns
            ? { ...(serverPatterns as unknown as typeof localPatterns), ...localPatterns }
            : (serverPatterns as unknown as Parameters<typeof savePatterns>[0]);
          savePatterns(merged);
        }
      }).catch(() => {});
    })();
      return () => cleanupVisibility();
  }, []);

  // ── Scroll to bottom ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConv?.messages, streamingText, activeToolCalls]);

  // ── Save patterns periodically (local + server) ──
  useEffect(() => {
    if (!activeConv) return;
    const interval = setInterval(() => {
      if (activeConv.context.actions.length > 0) {
        const patterns = analyzePatterns(activeConv.context);
        const existing = loadPatterns();
        const merged = existing ? { ...existing, ...patterns } : patterns;
        savePatterns(merged);
        setUserPatternSummary(buildContextSummary(activeConv.context, merged));
        syncPatternsToServer(merged as unknown as Record<string, unknown>).catch(() => {});
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

  // ── Workflow result → inject as AI message ──
  const handleWorkflowResult = useCallback(async (workflowId: string, output: string) => {
    // Create a new conversation or use active one
    let conv = activeConv;
    if (!conv) {
      conv = await createConversation();
      setConversations(prev => [conv!, ...prev]);
      setActiveConv(conv);
      setActiveConversationId(conv.id);
    }

    const workflowNames: Record<string, string> = {
      inbox_zero: 'Inbox Zero',
      deal_room: 'Deal Room',
      weekly_brief: 'Weekly Brief',
      meeting_prep: 'Meeting Prep',
    };

    const aiMessage = {
      id: `wf_${Date.now()}`,
      role: 'assistant' as const,
      content: `**🔄 Workflow Complete: ${workflowNames[workflowId] ?? workflowId}**\n\n${output}`,
      timestamp: Date.now(),
      toolCalls: [],
    };

    await addMessage(conv.id, aiMessage);
    const updated = await getConversation(conv.id);
    if (updated) {
      setActiveConv(updated);
      setConversations(prev => prev.map(c => c.id === updated.id ? updated : c));
    }
    toastSuccess(`${workflowNames[workflowId] ?? workflowId} complete!`);
  }, [activeConv]);

  // ── Inline rename ──
  const handleStartRename = useCallback((id: string, currentTitle: string) => {
    setRenamingConvId(id);
    setRenameValue(currentTitle);
  }, []);

  const handleFinishRename = useCallback(async () => {
    if (!renamingConvId || !renameValue.trim()) { setRenamingConvId(null); return; }
    await handleRenameConversation(renamingConvId, renameValue.trim());
    setRenamingConvId(null);
  }, [renamingConvId, renameValue, handleRenameConversation]);

  const detectAndStorePreferences = useCallback(async (text: string, convId: string) => {
    const prefs = detectPreferences(text);
    if (prefs.length === 0) return;
    const conv = await getConversation(convId);
    if (!conv) return;
    conv.context.preferences = [...new Set([...conv.context.preferences, ...prefs])].slice(-15);
    await saveConversation(conv);
  }, []);

  const handleSend = useCallback(async (text: string, attachments?: AttachedFile[]) => {
    if ((!text.trim() && !attachments?.length) || isLoading) return;

    // Autopilot shortcut
    if (text.trim() === '__autopilot__') {
      setShowAutopilot(true);
      return;
    }

    // /chain command: run AI-driven autonomous multi-step tool chain
    if (text.trim().startsWith('/chain ')) {
      const goal = text.slice('/chain '.length).trim();
      if (goal) {
        chain.reset();
        setChainVisible(true);
        chain.run(goal, { userId: 'default' });
        return;
      }
    }

    const effectiveApprovedIds = agentMode
      ? new Set([...approvedToolIds, '__agent_mode__'])
      : approvedToolIds;

    let conv = activeConv;
    if (!conv) {
      const title = generateTitle(text);
      conv = await createConversation(title);
      // After first AI response, upgrade to AI-generated title
      const isNew = true; void isNew; // flag for post-response title upgrade
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
    setStreamingThinking('');
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
          userPatterns: [userPatternSummary, insightsSummary, activePersona.systemSuffix].filter(Boolean).join('\n'),
          settings: {
            requireApprovalForEmail: agentMode ? false : chatSettings.requireApprovalForEmail,
            requireApprovalForCalendar: agentMode ? false : chatSettings.requireApprovalForCalendar,
            communicationStyle: chatSettings.communicationStyle,
            emailTone: chatSettings.emailTone,
            agentMode,
          },
          approvedToolIds: Array.from(effectiveApprovedIds),
          userId: 'default', // TODO: real userId from auth session
          attachments: attachments?.map(a => ({
            name: a.name,
            type: a.type,
            size: a.size,
            content: a.content.length > 50_000
              ? a.content.slice(0, 50_000) + '\n...[truncated]'
              : a.content,
          })),
        }),
      });

      if (!res.ok || !res.body) throw new Error('Chat API error');

      let finalMessage: ChatMessageType | null = null;

      await parseChatStream(res, {
        onStart: () => {},
        onDelta: (content) => {
          setStreamingText(prev => prev + content);
        },
        onThinking: (text) => {
          setStreamingThinking(prev => prev + text);
        },
        onTool: (toolCall) => {
          setActiveToolCalls(prev => {
            const existing = prev.findIndex(tc => tc.id === toolCall.id);
            if (existing >= 0) {
              const updated = [...prev];
              updated[existing] = toolCall;
              return updated;
            }
            return [...prev, toolCall];
          });
          // Detect completed email_reply draft to show review modal
          if (toolCall.tool === 'email_reply' && toolCall.status === 'success') {
            try {
              const result = JSON.parse(toolCall.result) as { drafted?: boolean; to?: string; subject?: string; tone?: string };
              if (result.drafted && result.to) {
                const args = toolCall.args as { body?: string; thread_id?: string; tone?: string };
                setPendingReplyDraft({
                  threadId: String(toolCall.args.thread_id ?? ''),
                  to: result.to,
                  subject: result.subject ?? 'Re: (untitled)',
                  body: args.body ?? '',
                  tone: args.tone ?? result.tone ?? 'professional',
                });
              }
            } catch { /* ignore parse errors */ }
          }
        },
        onPendingApproval: (data) => {
          const riskMap: Record<string, 'high' | 'medium' | 'low'> = {
            email_send: 'high',
            email_reply: 'high',
            calendar_create_event: 'medium',
            calendar_update_event: 'medium',
            calendar_cancel_event: 'high',
            document_write: 'medium',
            file_share: 'medium',
          };
          const labelMap: Record<string, string> = {
            email_send: 'Send an email',
            email_reply: 'Send a reply email',
            calendar_create_event: 'Create a calendar event',
            calendar_update_event: 'Update a calendar event',
            calendar_cancel_event: 'Cancel a calendar event',
            document_write: 'Create/edit a document',
            file_share: 'Share a file',
          };
          setPendingApproval({
            id: data.toolId,
            type: data.toolName,
            description: labelMap[data.toolName] ?? `Execute: ${data.toolName.replace(/_/g, ' ')}`,
            risk: riskMap[data.toolName] ?? 'medium',
            params: data.args,
          });
          pendingConvRef.current = conv?.id ?? null;
        },
        onDone: (data) => {
          if (data.message) {
            finalMessage = data.message as ChatMessageType;
            // Learn from this turn for proactive context
            learnFromTurnProactive(
              text,
              (data.message as ChatMessageType).content,
              conv?.context ?? { files: [], people: [], topics: [], preferences: [], actions: [] },
            );
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
          // Upgrade title using AI route on first exchange (fire-and-forget)
          if (isFirstExchange) {
            fetch('/api/conversations/auto-title', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                firstUserMessage: text,
                firstAssistantMessage: finalMessage!.content.slice(0, 300),
              }),
            })
              .then(r => r.json())
              .then(({ title: aiTitle }) => {
                if (aiTitle && prev?.id) {
                  handleRenameConversation(prev.id, aiTitle);
                }
              })
              .catch(() => {});
          }
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
      setStreamingThinking('');
      setActiveToolCalls(prev => {
        if (prev.length > 0) {
          const newActions: ActionRecord[] = prev.map(tc => ({
            id: tc.id,
            tool: tc.tool,
            args: tc.args as Record<string, unknown>,
            result: tc.result,
            status: tc.status === 'error' ? 'error' : 'success',
            durationMs: tc.duration ?? 0,
            conversationId: conv.id,
            timestamp: Date.now(),
            userId: 'default',
          }));
          setActionHistory(hist => [...hist, ...newActions].slice(-200)); // keep last 200
        }
        return [];
      });

      setPendingApproval(null);

      const reloadedConv = await getConversation(conv.id);
      if (reloadedConv) {
        setActiveConv(reloadedConv);
        setConversations(prev => prev.map(c => c.id === reloadedConv.id ? reloadedConv : c));

        // Push to server for cross-device sync (fire-and-forget)
        syncConversationToServer(reloadedConv).catch(() => { /* silent */ });

        // Auto-summarize long conversations in the background
        const totalMessages = reloadedConv.messages.filter(m => m.role !== 'system').length;
        if (totalMessages >= 30) {
          maybeAutoSummarize(reloadedConv.id).then(compressed => {
            if (compressed) {
              // Reload with compressed history
              getConversation(reloadedConv.id).then(compressedConv => {
                if (compressedConv) {
                  setActiveConv(compressedConv);
                  setConversations(prev => prev.map(c =>
                    c.id === compressedConv.id ? compressedConv : c
                  ));
                }
              }).catch(console.error);
            }
          }).catch(console.error);
        }
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
      setStreamingThinking('');
      setActiveToolCalls([]);
    }
  }, [activeConv, isLoading, userPatternSummary, insightsSummary, chatSettings, detectAndStorePreferences]);

  const handleApprove = useCallback((actionId: string) => {
    // Add to approved set so next retry executes the tool
    setApprovedToolIds(prev => new Set([...prev, actionId]));
    setPendingApproval(null);
    toastSuccess('Action approved — retrying…');
    // Re-send the last user message so the engine can execute with approval
    if (activeConv) {
      const lastUserMsg = [...(activeConv.messages)].reverse().find(m => m.role === 'user');
      if (lastUserMsg) {
        // Remove the last assistant message (the one with pending state)
        setActiveConv(prev => {
          if (!prev) return prev;
          const withoutLastAI = prev.messages.filter((_, i) => i < prev.messages.length - 1);
          return { ...prev, messages: withoutLastAI };
        });
        setTimeout(() => {
          handleSend(lastUserMsg.content);
          // Clear approved tools after retry
          setApprovedToolIds(new Set());
        }, 100);
      }
    }
  }, [activeConv, handleSend]);

  const handleReject = useCallback((_actionId: string) => {
    setPendingApproval(null);
    setApprovedToolIds(new Set());
    toastInfo('Action rejected');
  }, []);

  const handleRegenerate = useCallback(() => {
    if (!activeConv) return;
    // Find the last user message and re-send it
    const msgs = activeConv.messages;
    const lastUserMsg = [...msgs].reverse().find(m => m.role === 'user');
    if (lastUserMsg) {
      // Remove last assistant message and re-send
      setActiveConv(prev => {
        if (!prev) return prev;
        const withoutLastAI = prev.messages.filter((_, i) => i < prev.messages.length - 1);
        return { ...prev, messages: withoutLastAI };
      });
      handleSend(lastUserMsg.content);
    }
  }, [activeConv, handleSend]);

  /**
   * Edit a past user message and re-run the conversation from that point.
   * All messages after the edited message are discarded, then the new text
   * is sent — creating a clean branch.
   */
  const handleEditAndResend = useCallback((messageId: string, newText: string) => {
    if (!activeConv) return;
    const msgIndex = activeConv.messages.findIndex(m => m.id === messageId);
    if (msgIndex < 0) return;

    // Truncate history up to (not including) the edited message
    const truncated = activeConv.messages.slice(0, msgIndex);
    setActiveConv(prev => {
      if (!prev) return prev;
      return { ...prev, messages: truncated, updatedAt: Date.now() };
    });

    // Re-send with the new text
    setTimeout(() => handleSend(newText), 50);
  }, [activeConv, handleSend]);

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

  const handlePinMessage = useCallback((messageId: string, pinned: boolean) => {
    setActiveConv(prev => {
      if (!prev) return prev;
      const updated = {
        ...prev,
        messages: prev.messages.map(m =>
          m.id === messageId ? { ...m, pinned } : m
        ),
        updatedAt: Date.now(),
      };
      saveConversation(updated).catch(console.error);
      return updated;
    });
    toastSuccess(pinned ? 'Message pinned' : 'Message unpinned');
  }, []);

  // ── Conversation Fork ──
  const handleFork = useCallback(async (forkConfig: ForkConfig) => {
    try {
      const res = await fetch('/api/conversations/fork', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceConversationId: forkConfig.sourceConversationId,
          forkFromMessageId: forkConfig.forkFromMessageId,
          newTitle: forkConfig.newTitle,
          preserveContext: forkConfig.preserveContext,
          userId: 'default',
        }),
      });
      if (!res.ok) throw new Error('Fork failed');
      const { forkId } = await res.json() as { forkId: string };

      // Load the forked conversation
      const forkedConv = await getConversation(forkId);
      if (forkedConv) {
        setConversations(prev => [forkedConv, ...prev]);
        setActiveConv(forkedConv);
        setActiveConversationId(forkId);
        setForkMessage(null);
        toastSuccess(`Forked: "${forkConfig.newTitle}"`);
        // If an initial prompt was given, send it
        if (forkConfig.initialPrompt) {
          setTimeout(() => handleSend(forkConfig.initialPrompt), 100);
        }
      }
    } catch {
      toastError('Failed to fork conversation');
    }
  }, [getConversation, handleSend]);

  const handleScrollToMessage = useCallback((messageId: string) => {
    const el = messageRefs.current.get(messageId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.style.transition = 'background-color 0.5s';
      el.style.backgroundColor = 'rgba(251, 191, 36, 0.2)';
      setTimeout(() => { el.style.backgroundColor = ''; }, 1200);
    }
  }, []);

  const handleCancelStream = useCallback(() => {
    abortRef.current?.abort();
    setIsLoading(false);
    setStreamingText('');
    setStreamingThinking('');
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
          model={process.env.NEXT_PUBLIC_AI_MODEL ?? 'GPT-4o'}
          agentMode={agentMode}
          personaIcon={activePersona.icon}
          personaName={activePersona.name}
          userId="default"
          onWorkflowResult={handleWorkflowResult}
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
                onClick={() => setShowSearch(true)}
                className="text-[11px] px-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors hidden sm:block"
                title="Search conversations (⌘F)"
              >
                🔍
              </button>
              <button
                onClick={() => setShowCommandPalette(true)}
                className="text-[11px] px-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors hidden sm:block"
                title="Command palette (⌘K)"
              >
                ⌘K
              </button>
              <a
                href="/channels"
                className="text-[11px] px-2.5 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors hidden sm:inline-block"
                title="Team channels &amp; messaging"
              >
                💬 Channels
              </a>
              <button
                onClick={() => setShowSettings(true)}
                className="text-[11px] px-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors"
                title="Settings"
              >
                ⚙️
              </button>
              <button
                onClick={() => setShowAutopilot(true)}
                className="text-[11px] px-2.5 py-1 rounded-lg hover:bg-violet-100 dark:hover:bg-violet-900/30 text-violet-600 dark:text-violet-400 font-medium transition-colors hidden lg:flex items-center gap-1"
                title="AI Autopilot — set a goal, AI executes it (Ctrl+Shift+G)"
              >
                🚀 Autopilot
              </button>
              <button
                onClick={() => setShowAnalytics(true)}
                className="text-[11px] px-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors hidden lg:block"
                title="Chat analytics (Ctrl+Shift+A)"
              >
                📈
              </button>
              <button
                onClick={() => setShowLiveContext(v => !v)}
                className={showLiveContext
                  ? 'text-[11px] px-2 py-1 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 font-medium transition-colors'
                  : 'text-[11px] px-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors'
                }
                title="AI Knowledge Index — semantic search across emails, docs &amp; conversations (Ctrl+Shift+L)"
              >
                🧠
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
              {/* Live attention badge */}
              <div className="relative">
                <AttentionBadge
                  badgeCount={badgeCount}
                  urgentItems={urgentItems}
                  isLoading={attLoading}
                  lastFetched={lastFetched}
                  onAskAI={(prompt) => {
                    setShowAttention(false);
                    handleSend(prompt);
                  }}
                  onRefresh={refreshAttention}
                />
              </div>
              {activeConv && messages.filter(m => m.pinned).length > 0 && (
                <button
                  onClick={() => setShowPinnedMessages(v => !v)}
                  className={
                    showPinnedMessages
                      ? 'text-[11px] px-2.5 py-1 rounded-lg bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 font-medium'
                      : 'text-[11px] px-2.5 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors'
                  }
                  title="Pinned messages"
                >
                  📌 {messages.filter(m => m.pinned).length}
                </button>
              )}
              <ThemeToggle />
              <button
                onClick={() => setShowSmartSearch(true)}
                title="Smart Search — ⌘⇧K"
                className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/8 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>
              <NotificationBell onAction={(prompt) => { handleSend(prompt); setShowCommandPalette(false); }} />
              {/* Persona selector */}
              <div className="relative">
                <PersonaSelector
                  current={activePersona}
                  onChange={(p) => { setActivePersona(p); setShowPersonaSelector(false); }}
                  compact
                />
              </div>
              {activeConv && (
                <ConversationExportMenu
                  conversationId={activeConv.id}
                  conversationTitle={activeConv.title}
                />
              )}
              {activeConv && (
                <button
                  onClick={() => setShowSmartCompose(true)}
                  className="text-[11px] px-2.5 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors"
                  title="Smart Compose email"
                >
                  ✏️
                </button>
              )}
              {activeConv && (
                <button
                  onClick={() => { setShowTaskPanel(v => !v); setShowInboxTriage(false); setShowContextPanel(false); }}
                  className={
                    showTaskPanel
                      ? 'text-[11px] px-2.5 py-1 rounded-lg bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 font-medium'
                      : 'text-[11px] px-2.5 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors'
                  }
                  title="Action items"
                >
                  ✅
                </button>
              )}
              <button
                onClick={() => { setShowInboxTriage(v => !v); setShowTaskPanel(false); setShowContextPanel(false); }}
                className={
                  showInboxTriage
                    ? 'text-[11px] px-2.5 py-1 rounded-lg bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 font-medium'
                    : 'text-[11px] px-2.5 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors'
                }
                title="Smart inbox triage"
              >
                📥
              </button>
              {activeConv && (
                <>
                <button
                  onClick={() => { setShowContextPanel(v => !v); setShowTaskPanel(false); setShowInboxTriage(false); setShowActionHistory(false); }}
                  className={
                    showContextPanel
                      ? 'text-[11px] px-2.5 py-1 rounded-lg bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 font-medium'
                      : 'text-[11px] px-2.5 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors'
                  }
                  title="AI Memory panel"
                >
                  🧠
                </button>
                <button
                  onClick={() => { setShowActionHistory(v => !v); setShowContextPanel(false); setShowTaskPanel(false); setShowInboxTriage(false); }}
                  className={
                    showActionHistory
                      ? 'text-[11px] px-2.5 py-1 rounded-lg bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300 font-medium'
                      : 'text-[11px] px-2.5 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors'
                  }
                  title="Action History — see every tool call the AI made"
                >
                  ⚡ {actionHistory.length > 0 && <span className="ml-0.5 text-orange-500">{actionHistory.length}</span>}
                </button>
                <button
                  onClick={() => setShowMemoryManager(true)}
                  className="text-[11px] px-2.5 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors"
                  title="Manage AI memory (saved preferences &amp; facts)"
                >
                  🗂️ Memory
                </button>
                </>
              )}
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
                onShowSmartSearch={() => setShowSmartSearch(true)}
                onOpenTriage={() => setShowInboxTriage(true)}
                onOpenTasks={() => setShowTaskPanel(true)}
                recentConversations={conversations.slice(0, 3)}
              />
            ) : (
              <div className="py-2">
                {/* Pinned messages */}
                {messages.map((msg, i) => (
                  <div
                    key={msg.id}
                    ref={el => {
                      if (el) messageRefs.current.set(msg.id, el);
                      else messageRefs.current.delete(msg.id);
                    }}
                  >
                    <MessageBubble
                      message={msg}
                      isLast={i === messages.length - 1 && !isStreaming}
                      isStreaming={isStreaming && i === messages.length - 1}
                      onSuggestionClick={handleSend}
                      onRegenerate={i === messages.length - 1 && msg.role === 'assistant' && !isStreaming ? handleRegenerate : undefined}
                      onPin={handlePinMessage}
                      onSaveToDocs={(c) => setSaveToDocsContent(c)}
                      onEditAndResend={msg.role === 'user' && !isStreaming ? handleEditAndResend : undefined}
                      onFork={activeConv ? (m) => setForkMessage(m) : undefined}
                      context={activeConv?.context}
                    />
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

                {/* Streaming response with rich tool cards + agent activity monitor */}
                {(streamingText || activeToolCalls.length > 0) && (
                  <div className="space-y-2">
                    {agentMode && activeToolCalls.length > 0 && (
                      <div className="px-4">
                        <AgentActivityMonitor
                          steps={toolCallsToAgentSteps(activeToolCalls)}
                          isRunning={isLoading}
                          onStop={handleCancelStream}
                          className="text-xs"
                        />
                      </div>
                    )}
                    <StreamingMessage
                      text={streamingText}
                      toolCalls={activeToolCalls}
                      onCancel={handleCancelStream}
                      onAction={handleSend}
                      thinking={streamingThinking}
                      isThinking={isLoading && !streamingText && activeToolCalls.length === 0}
                    />
                  </div>
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
          {/* Proactive action chips — surfaces AI commitments as executable buttons */}
          {messages.length > 0 && (
            <ProactiveNotifications
              messages={messages}
              onExecute={handleSend}
            />
          )}
          {/* Smart Paste — AI clipboard analysis */}
          {pasteEvent && (
            <SmartPaste
              pastedText={pasteEvent.text}
              onAction={(prompt) => {
                clearPaste();
                handleSend(prompt);
              }}
              onDismiss={clearPaste}
              className="mx-4 mb-2"
            />
          )}
          <ChatInput
            onSend={handleSend}
            isLoading={isLoading}
            agentMode={agentMode}
            onAgentModeChange={setAgentMode}
            contacts={activeConv?.context?.people ?? []}
            personaId={activePersona.id}
            personaIcon={activePersona.icon}
            personaName={activePersona.name}
            onPersonaClick={() => setShowPersonaSelector(v => !v)}
          />
        </div>

        {/* Attention panel */}
        {showAttention && (
          <AttentionPanel
            onAction={handleAttentionAction}
            onClose={() => setShowAttention(false)}
          />
        )}

        {/* Smart inbox triage panel */}
        {showInboxTriage && (
          <InboxTriagePanel
            onAction={(prompt) => { handleSend(prompt); }}
            onClose={() => setShowInboxTriage(false)}
          />
        )}

        {/* Task extraction panel */}
        {showTaskPanel && activeConv && (
          <TaskExtractionPanel
            messages={messages}
            onExecute={(prompt) => { handleSend(prompt); }}
            onClose={() => setShowTaskPanel(false)}
          />
        )}

        {/* Context / AI Memory panel */}
        {showContextPanel && activeConv?.context && (
          <div className="w-72 border-l border-gray-200 dark:border-gray-800 overflow-y-auto bg-white dark:bg-gray-950 flex flex-col gap-3 p-3">
            <ContextPanel
              context={activeConv.context}
              patterns={null}
              onAction={(text) => {
                setShowContextPanel(false);
                handleSend(text);
              }}
              onClose={() => setShowContextPanel(false)}
            />
            {/* Conversation insights below context panel */}
            <ConversationInsights
              context={activeConv.context}
            />
          </div>
        )}

        {/* Action History panel */}
        {showActionHistory && (
          <div className="w-72 border-l border-gray-200 dark:border-gray-800 overflow-y-auto bg-white dark:bg-gray-950 flex flex-col p-3 gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Action History</h3>
              <button
                onClick={() => setShowActionHistory(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xs"
              >
                ✕
              </button>
            </div>
            <ActionHistory
              actions={actionHistory}
              onClear={() => setActionHistory([])}
            />
          </div>
        )}

        {/* Pinned messages panel */}
        {showPinnedMessages && activeConv && (
          <PinnedMessages
            messages={messages}
            onClose={() => setShowPinnedMessages(false)}
            onUnpin={(id) => handlePinMessage(id, false)}
            onScrollTo={handleScrollToMessage}
          />
        )}

        {/* Live Context / RAG Knowledge sidebar */}
        {showLiveContext && (
          <LiveContextSidebar
            context={activeConv?.context ?? { files: [], people: [], topics: [], preferences: [], actions: [] }}
            userId="default"
            onSendMessage={(msg) => {
              setShowLiveContext(false);
              handleSend(msg);
            }}
            className="w-64"
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
            if (prompt === '__inbox_triage__') { setShowInboxTriage(true); setShowCommandPalette(false); return; }
            if (prompt === '__extract_tasks__') { setShowTaskPanel(true); setShowCommandPalette(false); return; }
            if (prompt === '__smart_search__') { setShowSmartSearch(true); setShowCommandPalette(false); return; }
            handleSend(prompt);
          }}
          onSelectConversation={handleSelectConversation}
          onNewChat={handleNewConversation}
          onOpenSettings={() => setShowSettings(true)}
          onOpenMemorySearch={() => setShowMemorySearch(true)}
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

      {showSmartSearch && (
        <SmartSearchModal
          open={showSmartSearch}
          onClose={() => setShowSmartSearch(false)}
          onSelectResult={(prompt) => {
            setShowSmartSearch(false);
            handleSend(prompt);
          }}
        />
      )}

      {showMemorySearch && (
        <MemorySearchModal
          onClose={() => setShowMemorySearch(false)}
          onLoadConversation={(id) => {
            handleSelectConversation(id);
            setShowMemorySearch(false);
          }}
          onInsertContext={(text) => {
            handleSend(`[Memory context]\n${text}\n\nBased on the above context from past conversations, `);
            setShowMemorySearch(false);
          }}
        />
      )}

      {showWeeklySummary && (
        <WeeklySummaryWidget onClose={() => setShowWeeklySummary(false)} />
      )}

      {/* Chain Progress — shown when /chain command is active */}
      {chainVisible && (
        <div className="fixed inset-x-0 bottom-24 z-40 flex justify-center px-4 pointer-events-none">
          <div className="w-full max-w-2xl pointer-events-auto">
            <ChainProgress
              steps={chain.steps}
              isRunning={chain.isRunning}
              answer={chain.answer}
              error={chain.error}
              stoppedReason={chain.stoppedReason}
              totalDurationMs={chain.totalDurationMs}
              onCancel={() => { chain.cancel(); setChainVisible(false); }}
            />
            {!chain.isRunning && (
              <button
                onClick={() => { chain.reset(); setChainVisible(false); }}
                className="mt-1.5 w-full text-[10px] text-gray-400 hover:text-gray-600 transition-colors"
              >
                Dismiss
              </button>
            )}
          </div>
        </div>
      )}

      {showDraftPreview && (
        <DraftPreviewModal onClose={() => setShowDraftPreview(false)} />
      )}

      {pendingReplyDraft && (
        <ReplyThreadModal
          draft={pendingReplyDraft}
          onSend={(body) => {
            handleSend(`Send this reply to ${pendingReplyDraft.to}: ${body}`);
            setPendingReplyDraft(null);
          }}
          onSaveDraft={(body) => {
            toastSuccess('Reply saved to drafts');
            setPendingReplyDraft(null);
          }}
          onDiscard={() => { setPendingReplyDraft(null); toastInfo('Reply discarded'); }}
        />
      )}

      {showSmartCompose && (
        <SmartCompose
          messages={messages}
          onSend={(prompt) => { handleSend(prompt); }}
          onClose={() => setShowSmartCompose(false)}
        />
      )}

      {showMeetingScheduler && (
        <MeetingSchedulerModal onClose={() => setShowMeetingScheduler(false)} />
      )}

      {meetingPrepData && (
        <MeetingPrepPanel
          eventTitle={meetingPrepData.title}
          startTime={meetingPrepData.startTime}
          attendees={meetingPrepData.attendees}
          onClose={() => setMeetingPrepData(null)}
          onAction={(prompt) => {
            setMeetingPrepData(null);
            handleSend(prompt);
          }}
        />
      )}

      {saveToDocsContent && (
        <SaveToDocsModal
          content={saveToDocsContent}
          onClose={() => setSaveToDocsContent(null)}
        />
      )}

      {/* Conversation Fork Modal */}
      {forkMessage && activeConv && (
        <ConversationForkModal
          conversation={activeConv}
          forkFromMessage={forkMessage}
          onFork={handleFork}
          onClose={() => setForkMessage(null)}
        />
      )}

      {showKeyboardHelp && (
        <KeyboardShortcutsHelp onClose={() => setShowKeyboardHelp(false)} />
      )}

      {showMemoryManager && (
        <MemoryManagerPanel
          onClose={() => setShowMemoryManager(false)}
          onInjectContext={(text) => {
            setShowMemoryManager(false);
            handleSend(text);
          }}
        />
      )}

      {showAnalytics && (
        <ChatAnalyticsPanel
          conversations={conversations}
          model={chatSettings?.defaultModel ?? 'gpt-4o'}
          onClose={() => setShowAnalytics(false)}
        />
      )}

      {showAutopilot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
          <GoalAutopilotPanel
            onSendMessage={(msg) => {
              setShowAutopilot(false);
              handleSend(msg);
            }}
            onClose={() => setShowAutopilot(false)}
          />
        </div>
      )}

      <ToastContainer />
      <AttentionToast
        alert={latestAlert}
        onAction={(prompt) => handleSend(prompt)}
        onDismiss={dismissAlert}
      />
    </div>
    </ErrorBoundary>
  );
}

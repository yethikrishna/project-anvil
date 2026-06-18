/**
 * AI Chat Engine — orchestrates conversation with tool use.
 *
 * Architecture:
 * 1. System prompt with dynamic context from user patterns
 * 2. Multi-round tool use loop via @anvil/ai provider
 * 3. Streaming response with tool call visualization
 * 4. Context accumulation across conversations
 * 5. Intent-aware system prompt optimization
 * 6. Auto-summarization for long conversations
 *
 * Uses @anvil/ai for:
 * - Provider abstraction (OpenAI, Ollama)
 * - Tool definitions (ANVIL_TOOLS)
 * - Streaming with tool call deltas
 */

import { createAI, createSmartRouterFromEnv } from '@anvil/ai';
import type { AIInstance, Message, StreamChunk, ToolCall } from '@anvil/ai';
import { ANVIL_TOOLS } from '@anvil/ai';
import { getToolExecutor } from './tool-executor';
import { detectIntent, getIntentPrompt } from './intent-router';
import type { ChatMessage, ToolCallResult, ConversationContext } from './types';
import { extractContextFromToolCall } from './memory';

// ── Server-side context accumulator (per-request, in-memory) ──

const serverContextUpdates = new Map<string, Partial<ConversationContext>>();

function accumulateContext(
  convId: string,
  tool: string,
  args: Record<string, unknown>,
  result: string,
): void {
  const ctxUpdate = extractContextFromToolCall(tool, args, result);
  const existing = serverContextUpdates.get(convId) ?? {};
  serverContextUpdates.set(convId, {
    files: [...(existing.files ?? []), ...(ctxUpdate.files ?? [])].slice(-20),
    people: [...new Set([...(existing.people ?? []), ...(ctxUpdate.people ?? [])])].slice(-20),
    topics: [...new Set([...(existing.topics ?? []), ...(ctxUpdate.topics ?? [])])].slice(-20),
  });
}

function getContextUpdates(convId: string): Partial<ConversationContext> {
  const updates = serverContextUpdates.get(convId) ?? {};
  serverContextUpdates.delete(convId);
  return updates;
}

// ── System Prompt Builder ──

function buildSystemPrompt(
  context: ConversationContext,
  userPatterns?: string,
  settings?: ChatEngineConfig['settings'],
): string {
  const sections: string[] = [];

  // Live date/time context
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });

  const styleMap: Record<string, string> = {
    concise: 'Be extremely concise. 1-3 sentences per response unless more detail is needed.',
    detailed: 'Provide thorough, detailed explanations with context and examples.',
    technical: 'Use precise technical language. Include code, APIs, and technical specifics.',
    casual: 'Be conversational and relaxed. Use contractions and informal language.',
  };
  const styleInstruction = styleMap[settings?.communicationStyle ?? 'concise'] ?? styleMap.concise;
  const emailToneInstruction = settings?.emailTone
    ? `When drafting emails, use a ${settings.emailTone} tone by default.`
    : 'When drafting emails, use a professional tone by default.';

  sections.push(`You are Anvil AI, an intelligent executive assistant embedded in the Anvil productivity suite.
Current date/time: ${dateStr} at ${timeStr}

CORE PERSONALITY:
- ${styleInstruction}
- When you can ACT, act. Use tools instead of describing what you would do.
- Always confirm before sending emails or creating calendar events.
- If you need more info, ask specific questions.
- Use markdown for structured responses. Use tables for comparisons.
- Show tool results inline when useful.
- ${emailToneInstruction}

CAPABILITIES (use tools for these):
📧 Mail:
- email_search: Search emails by subject, sender, content, date
- email_send: Send new emails (always confirm first)
- email_reply: Reply to a thread (PREFER this over email_send for replies)
- email_read_thread: Read full email thread
- email_save_draft: Save draft reply
- email_mark_read: Mark emails as read/unread
- email_label: Add/remove labels for organization
- email_archive: Archive emails
- email_bulk_action: Process multiple emails at once

📁 Drive:
- smart_search: Cross-app unified search across Mail + Drive + Calendar (USE THIS FIRST when searching)
- file_search: Search Drive files by name or content
- file_read: Read file contents
- file_share: Create shareable link

📝 Docs:
- document_write: Create or edit documents

📅 Calendar:
- calendar_create_event: Create events, send invites (always confirm first)
- calendar_update_event: Update existing events (time, title, attendees)
- calendar_cancel_event: Cancel events and notify attendees
- calendar_check_availability: Find free time slots
- calendar_get_events: Get events for a date range

🌐 Web:
- web_search: Search the web for current information

🧠 Memory (ALWAYS USE THESE):
- user_remember: Store user facts/preferences permanently (use when user says "remember", "my X is", "always do")
- user_recall: Retrieve all stored facts about user (use at session start or when personalizing)
- memory_search_semantic: Semantic search across indexed emails, docs, and conversations. Use for "what did we discuss about X?", "find emails about Y", "what was in the Z report?". MUCH more powerful than text search — understands meaning and context.
- context_memo: Store context for this conversation
- context_recall: Retrieve conversation context

✅ Tasks:
- tasks_create: Create a task or reminder

MULTI-STEP WORKFLOWS (chain tools automatically):
- Reply to thread: email_read_thread → email_reply
- Find + share: smart_search → file_share
- Find + summarize + email: smart_search → file_read → email_send
- Check + book: calendar_check_availability → calendar_create_event
- Research + document: web_search → document_write
- Triage inbox: email_search → email_mark_read + email_label + email_archive
- Update meeting: calendar_get_events → calendar_update_event or calendar_cancel_event

APPROVAL PROTOCOL:
- email_send / email_reply (when send=true): ALWAYS confirm recipient + content before executing
- calendar_create_event / calendar_update_event / calendar_cancel_event: ALWAYS confirm before executing
- file_share: Confirm recipient before sharing
- document_write: Confirm before overwriting existing docs`);


  // Conversation context
  if (context.files.length > 0) {
    const recent = context.files.slice(-5).map(f => f.name).join(', ');
    sections.push(`\nRECENTLY ACCESSED FILES: ${recent}`);
  }
  if (context.people.length > 0) {
    sections.push(`PEOPLE IN CONTEXT: ${context.people.slice(-10).join(', ')}`);
  }
  if (context.topics.length > 0) {
    sections.push(`CURRENT TOPICS: ${context.topics.slice(-8).join(', ')}`);
  }
  if (context.preferences.length > 0) {
    sections.push(`USER PREFERENCES:\n${context.preferences.slice(-8).map(p => `- ${p}`).join('\n')}`);
  }

  // User patterns (learned across sessions)
  if (userPatterns && userPatterns.trim()) {
    sections.push(`\nLEARNED USER PATTERNS:\n${userPatterns}`);
  }

  // Approval settings
  const approvalNotes: string[] = [];
  if (settings?.requireApprovalForEmail === false) {
    approvalNotes.push('User has pre-approved email sends — no need to confirm before sending.');
  }
  if (settings?.requireApprovalForCalendar === false) {
    approvalNotes.push('User has pre-approved calendar creation — no need to confirm before creating events.');
  }
  if (approvalNotes.length > 0) {
    sections.push(`\nAPPROVAL OVERRIDES:\n${approvalNotes.join('\n')}`);
  }

  return sections.join('\n');
}

// ── Chat Engine Config ──

export interface ChatEngineConfig {
  aiEndpoint?: string;
  apiKey?: string;
  anthropicApiKey?: string;
  model?: string;
  userPatterns?: string;
  authToken?: string;
  userId?: string;
  /** If true, use smart multi-provider routing (Claude for writing, GPT for tools) */
  useSmartRouter?: boolean;
  settings?: {
    requireApprovalForEmail?: boolean;
    requireApprovalForCalendar?: boolean;
    communicationStyle?: string;
    emailTone?: string;
    agentMode?: boolean;
  };
}

// ── Tools requiring approval by default ──

const APPROVAL_REQUIRED_TOOLS = new Set([
  'email_send',
  'email_reply', // only when send=true (checked inline)
  'calendar_create_event',
  'calendar_update_event',
  'calendar_cancel_event',
  'document_write',
  'file_share',
]);

// ── Chat Engine ──

export class ChatEngine {
  private ai: AIInstance;
  private config: ChatEngineConfig;

  constructor(config: ChatEngineConfig) {
    this.config = config;

    // Use smart multi-provider router if both keys are available or explicitly requested
    const hasAnthropic = !!(config.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY);
    const hasOpenAI = !!(config.apiKey ?? process.env.OPENAI_API_KEY);
    const useSmartRouter = config.useSmartRouter !== false && hasAnthropic && hasOpenAI;

    if (useSmartRouter) {
      // Smart router: Claude for writing/analysis, GPT-4o for tool use
      this.ai = createSmartRouterFromEnv() as unknown as AIInstance;
    } else {
      // Fallback: single provider (OpenAI-compatible)
      this.ai = createAI({
        provider: 'openai',
        apiKey: config.apiKey ?? process.env.OPENAI_API_KEY ?? '',
        baseUrl: config.aiEndpoint?.replace('/chat/completions', '') ?? 'https://api.openai.com/v1',
        model: config.model ?? process.env.AI_MODEL ?? 'gpt-4o',
      });
    }
  }

  /**
   * Process a chat message with multi-round tool use.
   */
  async processMessage(
    convId: string,
    userMessage: string,
    history: ChatMessage[],
    context: ConversationContext,
    onStream?: (chunk: string) => void,
    onThinking?: (text: string) => void,
    onToolCall?: (toolCall: ToolCallResult) => void,
    onPendingApproval?: (toolId: string, toolName: string, args: Record<string, unknown>) => void,
    approvedToolIds?: Set<string>,
  ): Promise<{
    message: ChatMessage;
    toolCalls: ToolCallResult[];
    contextUpdates: Partial<ConversationContext>;
  }> {
    // 1. Detect intent for system prompt optimization
    const intent = detectIntent(userMessage);
    const intentPrompt = getIntentPrompt(intent);

    // 2. Build system prompt with full context
    const baseSystemPrompt = buildSystemPrompt(context, this.config.userPatterns, this.config.settings);

    // Inject stored user facts into the system prompt for personalization
    let userFactsSection = '';
    try {
      const { dbGetPreferences } = await import('./db.js');
      const prefs = dbGetPreferences(this.config.userId ?? 'default');
      const userMemories: string[] = [];
      for (const [k, v] of Object.entries(prefs)) {
        if (k.startsWith('user_memory:')) {
          const parts = k.split(':');
          const shortKey = parts.slice(2).join(':');
          userMemories.push(`- ${shortKey}: ${v}`);
        }
      }
      if (userMemories.length > 0) {
        userFactsSection = `\n\nUSER FACTS YOU'VE REMEMBERED:\n${userMemories.join('\n')}\n(Use these to personalize every response. Never ask about these again.)`;
      }
    } catch { /* skip if DB unavailable */ }

    const systemPrompt = (intentPrompt
      ? `${baseSystemPrompt}\n\n${intentPrompt}`
      : baseSystemPrompt) + userFactsSection;

    // 3. Compress history if too long (prevent context window overflow)
    const compressedHistory = this.compressHistory(history);

    // 4. Build messages array for @anvil/ai
    const historyMessages: Message[] = compressedHistory
      .filter(m => m.role === 'user' || m.role === 'assistant' || m.role === 'system')
      .map(m => {
        if (m.role === 'system') return { role: 'system' as const, content: m.content };
        if (m.role === 'assistant') return { role: 'assistant' as const, content: m.content };
        return { role: 'user' as const, content: m.content };
      });

    const aiMessages: Message[] = [
      ...historyMessages,
      { role: 'user' as const, content: userMessage },
    ];

    // 5. Set up tool executor
    const executor = getToolExecutor({
      authToken: this.config.authToken,
      userId: this.config.userId,
    });

    // 6. Multi-round tool use loop (max 6 rounds)
    const allToolCalls: ToolCallResult[] = [];
    const MAX_ROUNDS = 6;
    let finalText = '';
    let pendingApprovalFired = false;

    // Track partial tool call deltas during streaming
    const toolCallBuffer = new Map<string, { name: string; arguments: string }>();

    for (let round = 0; round < MAX_ROUNDS; round++) {
      let roundText = '';
      const roundToolCalls: Array<{ id: string; name: string; arguments: string }> = [];

      // Stream this round
      const streamCallback = (chunk: StreamChunk) => {
        if (chunk.delta && !chunk.toolCallDeltas?.length) {
          roundText += chunk.delta;
          onStream?.(chunk.delta);
        }

        // Extended thinking/reasoning (o1, Claude 3.7+)
        if (chunk.thinkingDelta) {
          onThinking?.(chunk.thinkingDelta);
        }

        // Accumulate tool call deltas
        if (chunk.toolCallDeltas) {
          for (const tc of chunk.toolCallDeltas) {
            const key = tc.id || `tc_${roundToolCalls.length}`;
            const buf = toolCallBuffer.get(key) ?? { name: '', arguments: '' };
            if (tc.name) buf.name += tc.name;
            if (tc.arguments) buf.arguments += tc.arguments;
            toolCallBuffer.set(key, buf);
          }
        }
      };

      const result = await this.ai.stream(
        aiMessages,
        streamCallback,
        {
          systemPrompt,
          tools: ANVIL_TOOLS,
          maxTokens: 2048,
          temperature: 0.3,
          // Smart router task hint: first round with tools → openai, subsequent → use intent
          ...(round === 0 && ANVIL_TOOLS.length > 0
            ? { task: (intent.category === 'email_search' || intent.category === 'email_reply' || intent.category === 'email_compose') ? 'email_draft'
                : intent.category === 'document_summarize' ? 'summarize'
                : intent.category === 'file_search' || intent.isMultiStep ? 'tool_use'
                : 'chat' }
            : { task: 'tool_use' as const }),
        } as Parameters<typeof this.ai.stream>[2]
      );

      // Merge buffered tool calls with result
      const finalToolCalls = result.toolCalls ?? [];
      toolCallBuffer.clear();

      if (finalToolCalls.length > 0) {
        // Has tool calls — execute them
        aiMessages.push({
          role: 'assistant' as const,
          content: roundText || '',
          toolCalls: finalToolCalls,
        });

        for (const tc of finalToolCalls) {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(tc.arguments ?? '{}');
          } catch {
            args = {};
          }

          // Approval gate: skip if agent mode is active (__agent_mode__ in approvedToolIds)
          const isAgentMode = approvedToolIds?.has('__agent_mode__') ||
            this.config.settings?.agentMode === true;

          // Approval gate for high-risk tools
          // email_reply only requires approval when send=true (draft mode is safe)
          // calendar_update/cancel always require approval
          const isEmailReplyDraftOnly = tc.name === 'email_reply' && args.send !== true;
          const requiresApproval = APPROVAL_REQUIRED_TOOLS.has(tc.name) &&
            !isEmailReplyDraftOnly &&
            this.config.settings?.requireApprovalForEmail !== false &&
            !isAgentMode &&
            !approvedToolIds?.has(tc.id);

          if (requiresApproval && !pendingApprovalFired) {
            pendingApprovalFired = true;
            const callResult: ToolCallResult = {
              id: tc.id,
              tool: tc.name,
              args,
              result: JSON.stringify({ pending: true, message: 'Waiting for user approval.' }),
              status: 'running',
            };
            allToolCalls.push(callResult);
            onToolCall?.(callResult);
            onPendingApproval?.(tc.id, tc.name, args);

            // Feed synthetic pending result so AI can respond gracefully
            aiMessages.push({
              role: 'tool' as const,
              toolCallId: tc.id,
              content: 'Action paused — waiting for user confirmation before proceeding.',
            });
            accumulateContext(convId, tc.name, args, callResult.result);
            continue;
          }

          // Execute the tool
          const toolResult = await executor.executeTool(tc.name, args);

          const callResult: ToolCallResult = {
            id: tc.id,
            tool: tc.name,
            args,
            result: toolResult.result,
            status: toolResult.status,
            duration: toolResult.duration,
          };

          allToolCalls.push(callResult);
          onToolCall?.(callResult);

          // Feed tool result back to AI
          aiMessages.push({
            role: 'tool' as const,
            toolCallId: tc.id,
            content: toolResult.result,
          });

          accumulateContext(convId, tc.name, args, toolResult.result);
        }
      } else {
        // No tool calls — this is the final response
        finalText = roundText || result.text;
        break;
      }
    }

    if (!finalText) {
      finalText = allToolCalls.length > 0
        ? 'I\'ve completed the requested actions. Let me know if you need anything else.'
        : 'I\'m not sure how to help with that. Could you be more specific?';
    }

    const assistantMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: finalText,
      timestamp: Date.now(),
      toolCalls: allToolCalls,
    };

    return {
      message: assistantMsg,
      toolCalls: allToolCalls,
      contextUpdates: getContextUpdates(convId),
    };
  }

  /**
   * Compress history to prevent context window overflow.
   * Keeps the first 3 messages (for context) + last 15 messages.
   * Middle messages are summarized into a synthetic system message.
   */
  private compressHistory(history: ChatMessage[]): ChatMessage[] {
    const MAX_MESSAGES = 20;
    if (history.length <= MAX_MESSAGES) return history;

    const first = history.slice(0, 3);
    const last = history.slice(-12);
    const middle = history.slice(3, -12);

    const summaryLines = middle.map(m =>
      `${m.role === 'user' ? 'User' : 'AI'}: ${m.content.slice(0, 80)}${m.content.length > 80 ? '…' : ''}`
    );

    const summaryMsg: ChatMessage = {
      id: 'summary',
      role: 'system',
      content: `[Earlier conversation summary — ${middle.length} messages]\n${summaryLines.join('\n')}`,
      timestamp: middle[0]?.timestamp ?? Date.now(),
    };

    return [...first, summaryMsg, ...last];
  }

  /**
   * Quick one-shot generation for internal use (attention digest, draft, etc).
   */
  async quickGenerate(systemPrompt: string, userPrompt: string): Promise<string> {
    const result = await this.ai.generate(
      [{ role: 'user', content: userPrompt }],
      { systemPrompt, temperature: 0.2, maxTokens: 1024 },
    );
    return result.text;
  }
}

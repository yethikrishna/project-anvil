/**
 * AI Chat Engine — orchestrates conversation with tool use.
 *
 * Architecture:
 * 1. System prompt with dynamic context from user patterns
 * 2. Multi-round tool use loop (up to 5 rounds)
 * 3. Streaming response with tool call visualization
 * 4. Agent runtime for autonomous multi-step actions
 * 5. Context accumulation across conversations
 * 6. Intent-aware system prompt optimization
 *
 * Integrates @anvil/ai for:
 * - Tool definitions (ANVIL_TOOLS)
 * - Agent runtime for autonomous actions
 * - RAG pipeline for knowledge retrieval
 */

import type { Message } from '@anvil/ai';
import { ANVIL_TOOLS } from '@anvil/ai';
import { getToolExecutor } from './tool-executor';
import { detectIntent, getIntentPrompt } from './intent-router';
import type { ChatMessage, ToolCallResult, ConversationContext } from './types';
import { extractContextFromToolCall } from './memory';

// Server-side context accumulator (no IndexedDB — purely in-memory for the current request)
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

  // Communication style adaptation
  const styleMap: Record<string, string> = {
    concise: 'Be extremely concise. 1-3 sentences per response unless more detail is specifically needed.',
    detailed: 'Provide thorough, detailed explanations. Include context, reasoning, and examples.',
    technical: 'Use precise technical language. Include code, API details, and technical specifics when relevant.',
    casual: 'Be conversational and relaxed. Use contractions and informal language.',
  };
  const styleInstruction = styleMap[settings?.communicationStyle ?? 'concise'] ?? styleMap.concise;

  const emailToneInstruction = settings?.emailTone
    ? `When drafting emails, use a ${settings.emailTone} tone by default.`
    : 'When drafting emails, use a professional tone by default.';

  sections.push(`You are Anvil AI, an intelligent executive assistant embedded in the Anvil productivity suite.

CORE PERSONALITY:
- ${styleInstruction}
- When you can ACT, act. Use tools instead of describing what you would do.
- Always confirm before sending emails or creating calendar events (say "I'll send/reply" and wait).
- If you need more info, ask specific questions — not vague "please provide" requests.
- Use markdown for structured responses. Use tables for comparisons.
- Show tool results inline when they're useful to the user.
- ${emailToneInstruction}

CAPABILITIES (use tools for these):
📧 Mail:
- email_search: Search emails by subject, sender, content, date
- email_send: Send emails (always confirm first)
- email_read_thread: Read full email thread
- email_save_draft: Save draft reply

📁 Drive:
- file_search: Search Drive files by name or content
- file_read: Read file contents
- file_share: Create shareable link

📝 Docs:
- document_write: Create or edit documents

📅 Calendar:
- calendar_create_event: Create events, send invites (always confirm first)
- calendar_check_availability: Find free time slots

🌐 Web:
- web_search: Search the internet

MULTI-STEP ACTIONS — chain tools when needed:
- "Find Q3 report → summarize → email to team": file_search → file_read → email_send
- "Check schedule → find free time → book meeting": calendar_check_availability → calendar_create_event
- "Read thread → draft reply → save draft": email_read_thread → email_save_draft

Execute tools and report results progressively. Don't describe — do.`);

  // Dynamic context sections
  if (context.files.length > 0) {
    const recent = context.files.slice(-8);
    sections.push(`RECENTLY REFERENCED FILES:\n${recent.map(f => `- ${f.name} (${f.type})`).join('\n')}`);
  }

  if (context.people.length > 0) {
    sections.push(`PEOPLE IN THIS CONVERSATION:\n${context.people.join(', ')}`);
  }

  if (context.topics.length > 0) {
    const uniqueTopics = [...new Set(context.topics)].slice(-8);
    sections.push(`TOPICS DISCUSSED:\n${uniqueTopics.join(', ')}`);
  }

  if (context.preferences.length > 0) {
    sections.push(`USER PREFERENCES:\n${context.preferences.map(p => `- ${p}`).join('\n')}`);
  }

  if (userPatterns) {
    sections.push(`USER PATTERNS:\n${userPatterns}`);
  }

  // Recent actions context
  const recentActions = context.actions.slice(-5);
  if (recentActions.length > 0) {
    sections.push(`RECENT ACTIONS TAKEN:\n${recentActions
      .map(a => `- ${a.tool}: ${a.action} (${a.success ? 'success' : 'failed'})`)
      .join('\n')}`);
  }

  const approvalRules: string[] = [];
  if (settings?.requireApprovalForEmail !== false) {
    approvalRules.push('Always confirm with the user before calling email_send — preview the draft and say "Shall I send this?"');
  }
  if (settings?.requireApprovalForCalendar !== false) {
    approvalRules.push('Always confirm with the user before calling calendar_create_event — show the proposed time and say "Shall I create this event?"');
  }

  sections.push(`IMPORTANT:
- Always prefer using tools over speculating
- Show concise results, not raw API dumps
- If a search returns no results, say so and suggest alternatives
${approvalRules.map(r => `- ${r}`).join('\n')}`);

  return sections.join('\n\n');
}

// ── Chat Engine ──

export interface ChatEngineConfig {
  aiEndpoint: string;
  apiKey?: string;
  model?: string;
  authToken?: string;
  userId?: string;
  userPatterns?: string;
  settings?: {
    requireApprovalForEmail?: boolean;
    requireApprovalForCalendar?: boolean;
    communicationStyle?: string;
    emailTone?: string;
  };
}

export class ChatEngine {
  private config: ChatEngineConfig;

  constructor(config: ChatEngineConfig) {
    this.config = config;
  }

  /**
   * Process a user message through the AI with tool use loop.
   */
  async processMessage(
    convId: string,
    userContent: string,
    existingMessages: ChatMessage[],
    context: ConversationContext,
    onStream?: (chunk: string) => void,
    onToolCall?: (toolCall: ToolCallResult) => void,
  ): Promise<{ message: ChatMessage; toolCalls: ToolCallResult[]; contextUpdates: Partial<ConversationContext> }> {
    // 1. Detect intent for prompt optimization
    const intent = detectIntent(userContent);
    const intentExtra = getIntentPrompt(intent);

    // 3. Build AI messages with system prompt
    const systemPrompt = buildSystemPrompt(context, this.config.userPatterns, this.config.settings)
      + (intentExtra ? `\n\nINTENT GUIDANCE:\n${intentExtra}` : '');

    const aiMessages: Message[] = [
      { role: 'system', content: systemPrompt },
      ...existingMessages.slice(-20).map(m => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
      })),
      { role: 'user', content: userContent },
    ];

    const allToolCalls: ToolCallResult[] = [];
    let finalText = '';
    let maxRounds = 5;

    // 4. Tool use loop
    while (maxRounds-- > 0) {
      const response = await this.callAI(aiMessages, onStream);

      if (response.toolCalls && response.toolCalls.length > 0) {
        // Add assistant message with tool calls to conversation
        aiMessages.push({
          role: 'assistant',
          content: response.text || null,
          tool_calls: response.toolCalls.map(tc => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.name, arguments: tc.arguments },
          })),
        } as any);

        // Execute each tool call
        for (const tc of response.toolCalls) {
          let args: Record<string, unknown>;
          try {
            args = JSON.parse(tc.arguments || '{}');
          } catch {
            args = {};
          }

          const toolResult = await getToolExecutor({
            authToken: this.config.authToken,
            userId: this.config.userId,
          }).executeTool(tc.name, args);

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
            role: 'tool' as any,
            tool_call_id: tc.id,
            content: toolResult.result,
          } as any);

          // Accumulate context updates (server-side, in-memory for this request)
          accumulateContext(convId, tc.name, args, toolResult.result);
        }
      } else {
        finalText = response.text;
        break;
      }
    }

    if (!finalText) {
      finalText = allToolCalls.length > 0
        ? 'I\'ve completed the requested actions. Let me know if you need anything else.'
        : 'I\'m not sure how to help with that. Could you be more specific about what you need?';
    }

    // 5. Build assistant message (client-side persistence handles saving)
    const assistantMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: finalText,
      timestamp: Date.now(),
      toolCalls: allToolCalls,
    };

    const contextUpdates = getContextUpdates(convId);
    return { message: assistantMsg, toolCalls: allToolCalls, contextUpdates };
  }

  /**
   * Call AI API (OpenAI-compatible) with streaming support.
   */
  private async callAI(
    messages: Message[],
    onStream?: (chunk: string) => void,
  ): Promise<{
    text: string;
    toolCalls?: Array<{ id: string; name: string; arguments: string }>;
  }> {
    const body = {
      model: this.config.model ?? 'gpt-4o',
      messages,
      tools: ANVIL_TOOLS.map(t => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      })),
      tool_choice: 'auto',
      stream: !!onStream,
    };

    const res = await fetch(this.config.aiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`AI API error: ${res.status} — ${errorText}`);
    }

    if (onStream && body.stream) {
      return this.parseStreamResponse(res, onStream);
    }

    const data = await res.json();
    const choice = data.choices?.[0];

    return {
      text: choice?.message?.content ?? '',
      toolCalls: choice?.message?.tool_calls?.map((tc: any) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: tc.function.arguments,
      })),
    };
  }

  private async parseStreamResponse(
    res: Response,
    onChunk: (text: string) => void,
  ): Promise<{
    text: string;
    toolCalls?: Array<{ id: string; name: string; arguments: string }>;
  }> {
    const reader = res.body?.getReader();
    if (!reader) throw new Error('No stream body');

    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';
    const toolCalls: Map<number, { id: string; name: string; arguments: string }> = new Map();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        const jsonStr = trimmed.slice(6);
        if (jsonStr === '[DONE]') continue;

        try {
          const parsed = JSON.parse(jsonStr);
          const delta = parsed.choices?.[0]?.delta;

          if (delta?.content) {
            fullText += delta.content;
            onChunk(delta.content);
          }

          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              const existing = toolCalls.get(idx) ?? { id: '', name: '', arguments: '' };
              if (tc.id) existing.id = tc.id;
              if (tc.function?.name) existing.name = tc.function.name;
              if (tc.function?.arguments) existing.arguments += tc.function.arguments;
              toolCalls.set(idx, existing);
            }
          }
        } catch {
          // Skip malformed chunks
        }
      }
    }

    return {
      text: fullText,
      toolCalls: toolCalls.size > 0 ? Array.from(toolCalls.values()) : undefined,
    };
  }

  /**
   * Quick generate — one-shot AI call for internal use (attention digest, draft reply, etc).
   */
  async quickGenerate(systemPrompt: string, userPrompt: string): Promise<string> {
    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const response = await this.callAI(messages);
    return response.text;
  }
}

/**
 * AI Chat Engine — orchestrates conversation with tool use.
 *
 * Architecture:
 * 1. System prompt with dynamic context from user patterns
 * 2. Multi-round tool use loop (up to 5 rounds)
 * 3. Streaming response with tool call visualization
 * 4. Agent runtime for autonomous multi-step actions
 * 5. Context accumulation across conversations
 *
 * Integrates @anvil/ai for:
 * - Tool definitions (ANVIL_TOOLS)
 * - Agent runtime for autonomous actions
 * - RAG pipeline for knowledge retrieval
 */

import type { Message } from '@anvil/ai';
import { ANVIL_TOOLS } from '@anvil/ai';
import { getToolExecutor } from './tool-executor';
import type { ChatMessage, ToolCallResult, ConversationContext } from './types';
import { addMessage, updateContext, extractContextFromToolCall } from './memory';

// ── System Prompt Builder ──

function buildSystemPrompt(context: ConversationContext, userPatterns?: string): string {
  const sections: string[] = [];

  sections.push(`You are Anvil AI, an intelligent assistant embedded in the Anvil productivity suite.

CORE BEHAVIORS:
- Be direct and concise. No fluff, no filler, no "Great question!" or "I'd be happy to help!"
- When you can ACT, act. Use tools to search emails, find files, create events, send messages.
- Always confirm before sending emails or making calendar events.
- If you need more info, ask specifically — don't give vague "please provide" responses.
- Use markdown formatting for structured responses.
- Show tool results, not descriptions of what you *would* do.

CAPABILITIES:
- email_search: Search emails by subject, sender, or content
- email_send: Send emails (requires confirmation)
- email_read_thread: Read full email thread
- email_save_draft: Save a draft reply
- file_search: Search Drive files by name or content
- file_read: Read file contents from Drive
- file_share: Create a shareable link for a file
- document_write: Create or edit documents in Docs
- calendar_create_event: Create calendar events and send invites
- calendar_check_availability: Find free time slots
- web_search: Search the web for current information

MULTI-STEP ACTIONS:
You can chain multiple tools in one response. Examples:
- "Find the Q3 report → summarize → email to team" (file_search → file_read → email_send)
- "Check my schedule → find free time → book meeting" (calendar_check_availability → calendar_create_event)
- "Read email thread → draft reply → save to drafts" (email_read_thread → email_save_draft)

When executing multi-step actions, run the tools and report results progressively.`);

  // Dynamic context sections
  if (context.files.length > 0) {
    const recent = context.files.slice(-10);
    sections.push(`RECENTLY REFERENCED FILES:\n${recent.map(f => `- ${f.name} (${f.type})`).join('\n')}`);
  }

  if (context.people.length > 0) {
    sections.push(`PEOPLE IN THIS CONVERSATION:\n${context.people.join(', ')}`);
  }

  if (context.topics.length > 0) {
    const uniqueTopics = [...new Set(context.topics)].slice(-10);
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

  sections.push(`IMPORTANT: Always use tools when you can help by doing, not just talking. The user's time is valuable.`);

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
  ): Promise<{ message: ChatMessage; toolCalls: ToolCallResult[] }> {
    // 1. Save user message
    await addMessage(convId, { role: 'user', content: userContent });

    // 2. Build AI messages with system prompt
    const systemPrompt = buildSystemPrompt(context, this.config.userPatterns);

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

    // 3. Tool use loop
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

          // Update conversation context
          const ctxUpdate = extractContextFromToolCall(tc.name, args, toolResult.result);
          await updateContext(convId, (ctx) => ({
            ...ctx,
            files: [...ctx.files, ...(ctxUpdate.files ?? [])].slice(-20),
            people: [...new Set([...ctx.people, ...(ctxUpdate.people ?? [])])].slice(-20),
            topics: [...new Set([...ctx.topics, ...(ctxUpdate.topics ?? [])])].slice(-20),
            preferences: [...new Set([...ctx.preferences, ...(ctxUpdate.preferences ?? [])])].slice(-15),
            actions: [
              ...ctx.actions,
              {
                tool: tc.name,
                action: tc.name,
                timestamp: Date.now(),
                success: toolResult.status === 'success',
              },
            ].slice(-50),
          }));
        }
      } else {
        finalText = response.text;
        break;
      }
    }

    if (!finalText) {
      finalText = allToolCalls.length > 0
        ? 'I\'ve completed the requested actions. Let me know if you need anything else.'
        : 'I\'m not sure how to help with that. Could you be more specific?';
    }

    // 4. Save assistant message
    const assistantMsg = await addMessage(convId, {
      role: 'assistant',
      content: finalText,
      toolCalls: allToolCalls,
    });

    return { message: assistantMsg, toolCalls: allToolCalls };
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

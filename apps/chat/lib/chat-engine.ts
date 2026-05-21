/**
 * AI Chat Engine — orchestrates conversation with tool use.
 *
 * Flow:
 * 1. User sends message
 * 2. Engine adds conversation context + system prompt
 * 3. Calls AI with available tools
 * 4. If AI requests tool use → execute → feed result back
 * 5. Repeat until AI gives final text response
 * 6. Persist to memory
 */

import type {
  Message, ToolDefinition, ToolExecutor as AIToolExecutor,
} from '@anvil/ai';
import {
  ANVIL_TOOLS, FILE_SEARCH_TOOL, FILE_READ_TOOL, DOCUMENT_WRITE_TOOL,
  EMAIL_SEARCH_TOOL, EMAIL_SEND_TOOL, WEB_SEARCH_TOOL, CALENDAR_CREATE_TOOL,
} from '@anvil/ai';
import { getToolExecutor } from './tool-executor';
import type { ChatMessage, ToolCallResult, ConversationContext } from './types';
import { addMessage, updateMessage, updateContext, extractContextFromToolCall } from './memory';

// ── System Prompt ──

function buildSystemPrompt(context: ConversationContext): string {
  const fileContext = context.files.length > 0
    ? `\nRecently referenced files: ${context.files.map(f => f.name).join(', ')}`
    : '';
  const peopleContext = context.people.length > 0
    ? `\nPeople mentioned: ${context.people.join(', ')}`
    : '';
  const prefContext = context.preferences.length > 0
    ? `\nKnown preferences: ${context.preferences.join('; ')}`
    : '';

  return `You are Anvil AI, an intelligent assistant embedded in the Anvil productivity suite. You help users across Mail, Drive, Calendar, and Docs with real actions — not just talk.

CORE BEHAVIORS:
- Be direct and concise. No fluff, no filler.
- When you can ACT, act. Use tools to search emails, find files, create events, send messages.
- Always confirm before sending emails or making calendar events.
- If you need more info, ask specifically — don't give vague "please provide" responses.
- Use markdown formatting for structured responses.

CAPABILITIES:
- Search and read emails (Gmail)
- Send emails and save drafts
- Search Drive files by name or content
- Read file contents from Drive
- Create and edit documents in Docs
- Create calendar events and check availability
- Search the web for current information
- Chain multiple actions together (e.g., find doc → summarize → email to team)

CURRENT CONTEXT:${fileContext}${peopleContext}${prefContext}

IMPORTANT: When using tools, execute them and report results. Don't describe what you *would* do — do it.`;
}

// ── Tool name → executor mapping ──

const TOOL_MAP: Record<string, ToolDefinition> = {};
for (const tool of ANVIL_TOOLS) {
  TOOL_MAP[tool.name] = tool;
}

// ── Chat Engine ──

export interface ChatEngineConfig {
  aiEndpoint: string;
  apiKey?: string;
  model?: string;
  authToken?: string;
}

export class ChatEngine {
  private config: ChatEngineConfig;

  constructor(config: ChatEngineConfig) {
    this.config = config;
  }

  /**
   * Process a user message through the AI with tool use loop.
   * Returns the final assistant message and all tool calls made.
   */
  async processMessage(
    convId: string,
    userContent: string,
    existingMessages: ChatMessage[],
    context: ConversationContext,
    onStream?: (chunk: string) => void,
    onToolCall?: (toolCall: ToolCallResult) => void
  ): Promise<{ message: ChatMessage; toolCalls: ToolCallResult[] }> {
    // 1. Add user message to conversation
    await addMessage(convId, { role: 'user', content: userContent });

    // 2. Build message history for AI
    const aiMessages: Message[] = [
      { role: 'system', content: buildSystemPrompt(context) },
      ...existingMessages.map(m => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
      })),
      { role: 'user', content: userContent },
    ];

    const allToolCalls: ToolCallResult[] = [];
    let finalText = '';
    let maxRounds = 5; // Prevent infinite tool loops

    // 3. Tool use loop
    while (maxRounds-- > 0) {
      const response = await this.callAI(aiMessages, onStream);

      if (response.toolCalls && response.toolCalls.length > 0) {
        // AI wants to use tools
        for (const tc of response.toolCalls) {
          const args = JSON.parse(tc.arguments || '{}');

          // Notify UI about tool call
          const toolResult = await getToolExecutor({ authToken: this.config.authToken })
            .executeTool(tc.name, args);
          toolResult.id = tc.id;

          allToolCalls.push(toolResult);
          onToolCall?.(toolResult);

          // Feed tool result back to AI
          aiMessages.push({
            role: 'assistant',
            content: response.text,
          });
          aiMessages.push({
            role: 'tool' as any,
            toolCallId: tc.id,
            content: toolResult.result,
          } as any);

          // Update conversation context
          const ctxUpdate = extractContextFromToolCall(tc.name, args, toolResult.result);
          await updateContext(convId, (ctx) => ({
            ...ctx,
            files: [...ctx.files, ...(ctxUpdate.files ?? [])].slice(-20),
            people: [...new Set([...ctx.people, ...(ctxUpdate.people ?? [])])].slice(-20),
            topics: [...new Set([...ctx.topics, ...(ctxUpdate.topics ?? [])])].slice(-20),
            actions: [
              ...ctx.actions,
              { tool: tc.name, action: tc.name, timestamp: Date.now(), success: toolResult.status === 'success' },
            ].slice(-50),
          }));
        }
      } else {
        // AI gave final text response
        finalText = response.text;
        break;
      }
    }

    if (!finalText) {
      finalText = 'I completed the requested actions. Let me know if you need anything else.';
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
   * Direct call to AI API (OpenAI-compatible).
   */
  private async callAI(
    messages: Message[],
    onStream?: (chunk: string) => void
  ): Promise<{ text: string; toolCalls?: Array<{ id: string; name: string; arguments: string }> }> {
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
      throw new Error(`AI API error: ${res.status} ${await res.text()}`);
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
    onChunk: (text: string) => void
  ): Promise<{ text: string; toolCalls?: Array<{ id: string; name: string; arguments: string }> }> {
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
              const existing = toolCalls.get(idx) ?? { id: tc.id ?? '', name: '', arguments: '' };
              if (tc.id) existing.id = tc.id;
              if (tc.function?.name) existing.name = tc.function.name;
              if (tc.function?.arguments) existing.arguments += tc.function.arguments;
              toolCalls.set(idx, existing);
            }
          }
        } catch {
          // skip malformed chunks
        }
      }
    }

    return {
      text: fullText,
      toolCalls: toolCalls.size > 0 ? Array.from(toolCalls.values()) : undefined,
    };
  }

  /**
   * Quick generate — for one-shot commands (attention digest, draft reply, etc).
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

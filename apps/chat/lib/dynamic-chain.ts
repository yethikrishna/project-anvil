/**
 * AI-Driven Dynamic Tool Chaining
 *
 * Unlike static workflow orchestration (tool-orchestrator.ts which uses
 * predefined step lists), this engine lets the AI:
 * 1. See the user's goal
 * 2. Execute a tool
 * 3. See the result
 * 4. Decide the NEXT tool to run (or stop)
 * 5. Repeat up to maxSteps
 *
 * This enables truly autonomous multi-step reasoning, e.g.:
 * "Summarize the Q4 report and email it to my team"
 * → AI: search for "Q4 report" in Drive
 * → AI sees 3 results → picks the most recent one
 * → AI: read file content
 * → AI sees content → generates summary
 * → AI: save summary as new Doc
 * → AI: email doc link to the team
 * → AI: done
 *
 * Uses @anvil/ai for tool definitions and the configured LLM.
 */

import { ANVIL_TOOLS } from '@anvil/ai';
import type { ToolDefinition } from '@anvil/ai';
import { getToolExecutor } from './tool-executor';
import type { ToolCallResult } from './types';

// ── Types ──

export interface ChainStep {
  tool: string;
  args: Record<string, unknown>;
  result: ToolCallResult;
  reasoning?: string;
}

export interface ChainResult {
  success: boolean;
  steps: ChainStep[];
  answer: string;
  totalDurationMs: number;
  stoppedReason: 'completed' | 'max_steps' | 'error' | 'no_tool';
}

export interface ChainConfig {
  maxSteps?: number;
  userId?: string;
  authToken?: string;
  onStep?: (step: ChainStep, stepIndex: number) => void;
}

// ── Dynamic Chain Engine ──

export class DynamicToolChain {
  private tools: ToolDefinition[] = ANVIL_TOOLS;
  private endpoint: string;
  private apiKey: string;
  private model: string;

  constructor() {
    this.endpoint = process.env.OPENAI_API_URL ?? 'https://api.openai.com/v1/chat/completions';
    this.apiKey = process.env.OPENAI_API_KEY ?? '';
    this.model = process.env.AI_MODEL ?? 'gpt-4o';
  }

  /**
   * Execute a goal by letting the AI plan and execute tool calls dynamically.
   * The AI sees each result and decides what to do next.
   */
  async run(goal: string, config: ChainConfig = {}): Promise<ChainResult> {
    const maxSteps = config.maxSteps ?? 8;
    const executor = getToolExecutor({
      userId: config.userId,
      authToken: config.authToken,
    });

    const steps: ChainStep[] = [];
    const startTime = Date.now();

    // Build conversation history for the AI
    const messages: Array<{ role: string; content: string | unknown[]; tool_call_id?: string; name?: string }> = [
      {
        role: 'system',
        content: `You are Anvil AI, an autonomous assistant that completes multi-step tasks.

Your goal: Complete the user's request by using the available tools.

Rules:
- Use tools to gather information before acting
- Read files before summarizing them
- Check availability before scheduling
- Confirm actions (send email, create events) by including "ACTION_READY: [description]" in your final response
- When you have everything needed to respond, stop calling tools and give the final answer
- Be concise in your reasoning; focus on the task

When done, give a clear summary of what was accomplished.`,
      },
      {
        role: 'user',
        content: goal,
      },
    ];

    let stoppedReason: ChainResult['stoppedReason'] = 'completed';

    for (let stepIdx = 0; stepIdx < maxSteps; stepIdx++) {
      // Ask the AI what to do next
      const response = await this.callAI(messages);

      if (!response) {
        stoppedReason = 'error';
        break;
      }

      const { content, tool_calls, finish_reason } = response;

      // No more tool calls — AI is done
      if (!tool_calls || tool_calls.length === 0) {
        // Add final answer to messages
        if (content) {
          messages.push({ role: 'assistant', content });
        }
        stoppedReason = finish_reason === 'stop' ? 'completed' : 'no_tool';
        break;
      }

      // Add AI's message with tool calls
      messages.push({
        role: 'assistant',
        content: content ?? null,
        ...(tool_calls ? { tool_calls } : {}),
      } as typeof messages[0]);

      // Execute each tool call
      for (const tc of tool_calls) {
        const toolName = tc.function?.name;
        let toolArgs: Record<string, unknown> = {};

        try {
          toolArgs = JSON.parse(tc.function?.arguments ?? '{}');
        } catch {
          toolArgs = {};
        }

        const result = await executor.executeTool(toolName, toolArgs);

        const step: ChainStep = {
          tool: toolName,
          args: toolArgs,
          result,
          reasoning: content ?? undefined,
        };
        steps.push(step);
        config.onStep?.(step, stepIdx);

        // Add tool result to conversation
        messages.push({
          role: 'tool',
          content: result.result.slice(0, 8000), // Truncate very long results
          tool_call_id: tc.id,
          name: toolName,
        } as typeof messages[0]);

        if (result.status === 'error') {
          // Continue — let AI recover from tool errors
        }
      }

      if (stepIdx >= maxSteps - 1) {
        stoppedReason = 'max_steps';
      }
    }

    // Get final answer from last assistant message
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
    const answer = typeof lastAssistant?.content === 'string'
      ? lastAssistant.content
      : steps.length > 0
        ? `Completed ${steps.length} step(s): ${steps.map(s => s.tool).join(' → ')}`
        : 'No steps executed.';

    return {
      success: stoppedReason === 'completed' || stoppedReason === 'no_tool',
      steps,
      answer,
      totalDurationMs: Date.now() - startTime,
      stoppedReason,
    };
  }

  /**
   * Plan a chain without executing — returns the proposed steps.
   * Useful for showing the user what will happen before doing it.
   */
  async plan(goal: string): Promise<Array<{ tool: string; reason: string }>> {
    const toolList = this.tools
      .map(t => `- ${t.name}: ${t.description}`)
      .join('\n');

    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are a planning assistant. Given a goal, list the exact sequence of tool calls needed.',
          },
          {
            role: 'user',
            content: `Goal: ${goal}\n\nAvailable tools:\n${toolList}\n\nReturn a JSON array of steps: [{"tool": "tool_name", "reason": "why this step"}]. Return ONLY the JSON array.`,
          },
        ],
        temperature: 0.2,
        max_tokens: 500,
      }),
    });

    if (!res.ok) return [];

    try {
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content ?? '[]';
      const match = text.match(/\[[\s\S]*\]/);
      return match ? JSON.parse(match[0]) : [];
    } catch {
      return [];
    }
  }

  // ── Internal ──

  private async callAI(messages: unknown[]): Promise<{
    content: string | null;
    tool_calls: Array<{
      id: string;
      function: { name: string; arguments: string };
    }> | null;
    finish_reason: string;
  } | null> {
    if (!this.apiKey) return null;

    try {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          tools: this.tools.map(t => ({
            type: 'function',
            function: {
              name: t.name,
              description: t.description,
              parameters: t.parameters,
            },
          })),
          tool_choice: 'auto',
          temperature: 0.3,
          max_tokens: 2000,
        }),
      });

      if (!res.ok) return null;

      const data = await res.json();
      const choice = data.choices?.[0];

      return {
        content: choice?.message?.content ?? null,
        tool_calls: choice?.message?.tool_calls ?? null,
        finish_reason: choice?.finish_reason ?? 'stop',
      };
    } catch {
      return null;
    }
  }
}

// ── Singleton ──

let chainInstance: DynamicToolChain | null = null;

export function getDynamicChain(): DynamicToolChain {
  if (!chainInstance) chainInstance = new DynamicToolChain();
  return chainInstance;
}

/**
 * @anvil/ai/tools — Tool Registration Framework
 *
 * Extensible tool registry for AI function calling. Each tool has:
 * - JSON Schema definition (for AI context)
 * - Executor function (actual implementation)
 * - Metadata (category, risk level, permissions)
 * - Input validation via Zod
 */

import { z } from 'zod';
import type { ToolDefinition, ToolCall } from '../types.js';

// ── Types ──────────────────────────────────────────────

export type ToolCategory = 'mail' | 'drive' | 'calendar' | 'docs' | 'web' | 'system' | 'custom';
export type ToolRisk = 'low' | 'medium' | 'high' | 'destructive';
export type ToolStatus = 'registered' | 'loading' | 'ready' | 'error';

export interface ToolContext {
  /** Authenticated user ID */
  userId: string;
  /** Auth token for API calls */
  authToken?: string;
  /** Request-specific metadata */
  metadata?: Record<string, unknown>;
}

export interface ToolResult {
  /** Whether the tool call succeeded */
  success: boolean;
  /** Result data (string or structured) */
  data: string;
  /** Error message if failed */
  error?: string;
  /** Execution duration in ms */
  durationMs: number;
  /** Warnings (non-fatal issues) */
  warnings?: string[];
}

export interface RegisteredTool {
  /** Unique tool name */
  name: string;
  /** Tool definition for AI context */
  definition: ToolDefinition;
  /** Category */
  category: ToolCategory;
  /** Risk level */
  risk: ToolRisk;
  /** Human-readable description */
  description: string;
  /** Zod schema for input validation */
  inputSchema?: z.ZodType;
  /** Execute the tool */
  execute: (params: any, context: ToolContext) => Promise<ToolResult>;
  /** Verify the user has permission to use this tool */
  authorize?: (context: ToolContext) => boolean;
  /** Dry run (validate params without executing) */
  dryRun?: (params: any, context: ToolContext) => Promise<{ valid: boolean; warnings?: string[] }>;
  /** Status (set by registry on registration) */
  status?: ToolStatus;
}

export interface ToolCallRequest {
  /** Tool name */
  name: string;
  /** Arguments (parsed from JSON) */
  args: Record<string, unknown>;
  /** Execution context */
  context: ToolContext;
  /** Call ID from the AI */
  callId?: string;
}

export interface ToolExecutionResult {
  callId: string;
  toolName: string;
  result: ToolResult;
  params: Record<string, unknown>;
}

// ── Tool Registry ──────────────────────────────────────

export class ToolRegistry {
  private tools: Map<string, RegisteredTool> = new Map();
  private executionLog: Array<{
    toolName: string;
    timestamp: number;
    success: boolean;
    durationMs: number;
    userId: string;
  }> = [];
  private maxLogSize: number;

  constructor(options?: { maxLogSize?: number }) {
    this.maxLogSize = options?.maxLogSize ?? 10000;
  }

  /**
   * Register a tool.
   */
  register(tool: RegisteredTool): void {
    if (this.tools.has(tool.name)) {
      console.warn(`Tool "${tool.name}" is already registered — overwriting`);
    }
    this.tools.set(tool.name, {
      ...tool,
      status: 'ready',
    } as RegisteredTool);
  }

  /**
   * Unregister a tool by name.
   */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * Get a registered tool.
   */
  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  /**
   * List all registered tools.
   */
  list(): Array<{ name: string; category: ToolCategory; risk: ToolRisk; description: string }> {
    return Array.from(this.tools.values()).map(t => ({
      name: t.name,
      category: t.category,
      risk: t.risk,
      description: t.description,
    }));
  }

  /**
   * List tools by category.
   */
  listByCategory(category: ToolCategory): RegisteredTool[] {
    return Array.from(this.tools.values()).filter(t => t.category === category);
  }

  /**
   * Get all tool definitions for AI context.
   */
  getDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(t => t.definition);
  }

  /**
   * Get tool definitions filtered by categories.
   */
  getDefinitionsByCategories(categories: ToolCategory[]): ToolDefinition[] {
    return Array.from(this.tools.values())
      .filter(t => categories.includes(t.category))
      .map(t => t.definition);
  }

  /**
   * Execute a tool call.
   */
  async execute(request: ToolCallRequest): Promise<ToolExecutionResult> {
    const tool = this.tools.get(request.name);

    if (!tool) {
      return {
        callId: request.callId ?? '',
        toolName: request.name,
        params: request.args,
        result: {
          success: false,
          data: '',
          error: `Unknown tool: ${request.name}`,
          durationMs: 0,
        },
      };
    }

    // Authorization check
    if (tool.authorize && !tool.authorize(request.context)) {
      return {
        callId: request.callId ?? '',
        toolName: request.name,
        params: request.args,
        result: {
          success: false,
          data: '',
          error: 'Unauthorized: you do not have permission to use this tool',
          durationMs: 0,
        },
      };
    }

    // Input validation
    if (tool.inputSchema) {
      const parseResult = tool.inputSchema.safeParse(request.args);
      if (!parseResult.success) {
        return {
          callId: request.callId ?? '',
          toolName: request.name,
          params: request.args,
          result: {
            success: false,
            data: '',
            error: `Invalid parameters: ${parseResult.error.message}`,
            durationMs: 0,
          },
        };
      }
    }

    // Execute
    const startTime = Date.now();
    try {
      const result = await tool.execute(request.args, request.context);
      result.durationMs = Date.now() - startTime;

      this.logExecution(request.name, result.success, result.durationMs, request.context.userId);

      return {
        callId: request.callId ?? '',
        toolName: request.name,
        params: request.args,
        result,
      };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      this.logExecution(request.name, false, durationMs, request.context.userId);

      return {
        callId: request.callId ?? '',
        toolName: request.name,
        params: request.args,
        result: {
          success: false,
          data: '',
          error: err instanceof Error ? err.message : String(err),
          durationMs,
        },
      };
    }
  }

  /**
   * Execute multiple tool calls in sequence.
   */
  async executeChain(
    requests: ToolCallRequest[],
    onProgress?: (index: number, result: ToolExecutionResult) => void,
  ): Promise<ToolExecutionResult[]> {
    const results: ToolExecutionResult[] = [];

    for (let i = 0; i < requests.length; i++) {
      const result = await this.execute(requests[i]);
      results.push(result);
      onProgress?.(i, result);

      if (!result.result.success) break; // Stop chain on error
    }

    return results;
  }

  /**
   * Execute multiple tool calls in parallel.
   */
  async executeParallel(
    requests: ToolCallRequest[],
  ): Promise<ToolExecutionResult[]> {
    return Promise.all(requests.map(r => this.execute(r)));
  }

  /**
   * Dry-run a tool call (validate without executing).
   */
  async dryRun(request: ToolCallRequest): Promise<{ valid: boolean; warnings?: string[] }> {
    const tool = this.tools.get(request.name);
    if (!tool) return { valid: false, warnings: [`Unknown tool: ${request.name}`] };

    if (tool.dryRun) {
      return tool.dryRun(request.args, request.context);
    }

    // Basic validation
    if (tool.inputSchema) {
      const result = tool.inputSchema.safeParse(request.args);
      return {
        valid: result.success,
        warnings: result.success ? undefined : [result.error.message],
      };
    }

    return { valid: true };
  }

  /**
   * Get execution statistics.
   */
  getStats(): {
    totalTools: number;
    totalExecutions: number;
    successRate: number;
    byTool: Record<string, { count: number; successRate: number; avgDurationMs: number }>;
  } {
    const byTool: Record<string, { count: number; successes: number; totalMs: number }> = {};

    for (const entry of this.executionLog) {
      if (!byTool[entry.toolName]) {
        byTool[entry.toolName] = { count: 0, successes: 0, totalMs: 0 };
      }
      byTool[entry.toolName].count++;
      if (entry.success) byTool[entry.toolName].successes++;
      byTool[entry.toolName].totalMs += entry.durationMs;
    }

    const totalExecutions = this.executionLog.length;
    const totalSuccesses = this.executionLog.filter(e => e.success).length;

    return {
      totalTools: this.tools.size,
      totalExecutions,
      successRate: totalExecutions > 0 ? totalSuccesses / totalExecutions : 0,
      byTool: Object.fromEntries(
        Object.entries(byTool).map(([name, stats]) => [
          name,
          {
            count: stats.count,
            successRate: stats.count > 0 ? stats.successes / stats.count : 0,
            avgDurationMs: stats.count > 0 ? Math.round(stats.totalMs / stats.count) : 0,
          },
        ]),
      ),
    };
  }

  // ── Private ─────────────────────────────────────

  private logExecution(toolName: string, success: boolean, durationMs: number, userId: string): void {
    this.executionLog.push({ toolName, timestamp: Date.now(), success, durationMs, userId });
    if (this.executionLog.length > this.maxLogSize) {
      this.executionLog = this.executionLog.slice(-this.maxLogSize);
    }
  }
}

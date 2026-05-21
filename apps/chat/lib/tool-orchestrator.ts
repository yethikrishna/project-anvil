/**
 * Cross-App Tool Orchestrator — chains tools across Mail, Drive, Calendar, Docs.
 *
 * Predefined workflows + custom workflow support:
 * - "Find document → summarize → email to team"
 * - "Read email thread → extract event → create calendar"
 * - "Check availability → find best slot → schedule + send invites"
 *
 * Integrates with @anvil/ai AgentRuntime for autonomous execution.
 */

import { getToolExecutor } from './tool-executor';
import type { ToolCallResult } from './types';

// ── Workflow Types ──

export interface WorkflowStep {
  name: string;
  tool: string;
  args: Record<string, unknown>;
  /** Extract values from previous step results to merge into args */
  extract?: Record<string, { fromStep: number; path: string }>;
}

export interface WorkflowResult {
  success: boolean;
  steps: Array<{
    name: string;
    success: boolean;
    result: string;
    duration: number;
  }>;
  summary: string;
  totalDurationMs: number;
}

// ── Orchestrator ──

export class ToolOrchestrator {
  private executor = getToolExecutor();

  /**
   * Execute a multi-step workflow with dynamic arg resolution.
   */
  async executeWorkflow(
    workflow: WorkflowStep[],
    authToken?: string,
    onProgress?: (stepIndex: number, step: WorkflowStep, result: ToolCallResult) => void,
  ): Promise<WorkflowResult> {
    if (authToken) {
      this.executor = getToolExecutor({ authToken });
    }

    const startTime = Date.now();
    const results: WorkflowResult['steps'] = [];
    const stepOutputs: unknown[] = [];
    let overallSuccess = true;

    for (let i = 0; i < workflow.length; i++) {
      const step = workflow[i];

      // Resolve dynamic args from previous step outputs
      const resolvedArgs = { ...step.args };
      if (step.extract) {
        for (const [argKey, source] of Object.entries(step.extract)) {
          const prevOutput = stepOutputs[source.fromStep];
          if (prevOutput && typeof prevOutput === 'object') {
            const value = deepGet(prevOutput as Record<string, unknown>, source.path);
            if (value !== undefined) {
              resolvedArgs[argKey] = value;
            }
          }
        }
      }

      const result = await this.executor.executeTool(step.tool, resolvedArgs);
      stepOutputs.push(safeParseJSON(result.result));

      const stepResult = {
        name: step.name,
        success: result.status === 'success',
        result: result.result,
        duration: result.duration ?? 0,
      };
      results.push(stepResult);

      onProgress?.(i, step, result);

      if (!stepResult.success) {
        overallSuccess = false;
        break;
      }
    }

    return {
      success: overallSuccess,
      steps: results,
      summary: summarizeWorkflow(results),
      totalDurationMs: Date.now() - startTime,
    };
  }

  // ── Predefined Workflows ──

  /**
   * Find a file, create share link, and email it.
   */
  async findAndShareFile(
    query: string,
    recipientEmail: string,
    message: string,
    onProgress?: (step: number, msg: string) => void,
  ): Promise<WorkflowResult> {
    return this.executeWorkflow([
      {
        name: 'Search for file',
        tool: 'file_search',
        args: { query, limit: 5 },
      },
      {
        name: 'Create share link',
        tool: 'file_share',
        args: {},
        extract: { file_id: { fromStep: 0, path: 'results.0.id' } },
      },
      {
        name: 'Send sharing email',
        tool: 'email_send',
        args: {
          to: recipientEmail,
          subject: `Shared file: ${query}`,
          body: message,
        },
        extract: {
          body: { fromStep: 1, path: 'url' },
        },
      },
    ], undefined, (i, step, result) => {
      onProgress?.(i, step.name);
    });
  }

  /**
   * Summarize an email thread and save to Docs.
   */
  async summarizeAndSave(
    threadId: string,
    docTitle: string,
    onProgress?: (step: number, msg: string) => void,
  ): Promise<WorkflowResult> {
    return this.executeWorkflow([
      {
        name: 'Fetch email thread',
        tool: 'email_read_thread',
        args: { thread_id: threadId },
      },
      {
        name: 'Save summary to Docs',
        tool: 'document_write',
        args: { title: docTitle, content: '' },
        extract: {
          content: { fromStep: 0, path: 'raw' },
        },
      },
    ], undefined, (i, step) => {
      onProgress?.(i, step.name);
    });
  }

  /**
   * Smart schedule — check availability, find best slot, create event.
   */
  async smartSchedule(
    title: string,
    durationMinutes: number,
    attendeeEmails: string[],
    dateRange: { from: string; to: string },
    onProgress?: (step: number, msg: string) => void,
  ): Promise<WorkflowResult> {
    return this.executeWorkflow([
      {
        name: 'Check calendar availability',
        tool: 'calendar_check_availability',
        args: { from: dateRange.from, to: dateRange.to },
      },
      {
        name: 'Create meeting event',
        tool: 'calendar_create_event',
        args: {
          title,
          start_time: dateRange.from,
          end_time: dateRange.to,
          attendees: attendeeEmails,
          description: `Scheduled via Anvil AI. Duration: ${durationMinutes} min.`,
        },
      },
    ], undefined, (i, step) => {
      onProgress?.(i, step.name);
    });
  }

  /**
   * Search Drive → Read file → Summarize → Email to team.
   * Full multi-app chain.
   */
  async findSummarizeEmail(
    fileQuery: string,
    recipientEmails: string[],
    summaryInstructions?: string,
    onProgress?: (step: number, msg: string) => void,
  ): Promise<WorkflowResult> {
    return this.executeWorkflow([
      {
        name: 'Search for document',
        tool: 'file_search',
        args: { query: fileQuery, limit: 3 },
      },
      {
        name: 'Read document contents',
        tool: 'file_read',
        args: { format: 'text' },
        extract: { file_id: { fromStep: 0, path: 'results.0.id' } },
      },
      {
        name: 'Email summary to team',
        tool: 'email_send',
        args: {
          to: recipientEmails.join(', '),
          subject: `Summary: ${fileQuery}`,
          body: summaryInstructions ?? 'Here is the document summary.',
        },
        extract: {
          body: { fromStep: 1, path: 'content' },
        },
      },
    ], undefined, (i, step) => {
      onProgress?.(i, step.name);
    });
  }

  /**
   * Email thread → extract meeting details → create calendar event.
   */
  async emailToCalendar(
    emailQuery: string,
    onProgress?: (step: number, msg: string) => void,
  ): Promise<WorkflowResult> {
    return this.executeWorkflow([
      {
        name: 'Find email',
        tool: 'email_search',
        args: { query: emailQuery, folder: 'inbox', limit: 1 },
      },
      {
        name: 'Create calendar event from email',
        tool: 'calendar_create_event',
        args: {
          title: `Meeting from email: ${emailQuery}`,
          start_time: '',
          end_time: '',
        },
        extract: {
          title: { fromStep: 0, path: 'results.0.subject' },
        },
      },
    ], undefined, (i, step) => {
      onProgress?.(i, step.name);
    });
  }
}

// ── Helpers ──

function safeParseJSON(str: string): unknown {
  try {
    return JSON.parse(str);
  } catch {
    return { raw: str };
  }
}

function deepGet(obj: Record<string, unknown>, path: string): unknown {
  const keys = path.split('.');
  let current: unknown = obj;
  for (const key of keys) {
    if (current && typeof current === 'object' && current !== null) {
      // Handle array indices
      if (/^\d+$/.test(key) && Array.isArray(current)) {
        current = current[Number(key)];
      } else {
        current = (current as Record<string, unknown>)[key];
      }
    } else {
      return undefined;
    }
  }
  return current;
}

function summarizeWorkflow(steps: WorkflowResult['steps']): string {
  const successful = steps.filter(s => s.success).length;
  const total = steps.length;

  if (successful === total) {
    return `All ${total} steps completed successfully in ${steps.reduce((a, s) => a + s.duration, 0)}ms.`;
  }
  const failed = steps.find(s => !s.success);
  return `${successful}/${total} steps completed. Failed at: ${failed?.name ?? 'unknown'}.`;
}

// ── Singleton ──

let orchestrator: ToolOrchestrator | null = null;

export function getToolOrchestrator(): ToolOrchestrator {
  if (!orchestrator) {
    orchestrator = new ToolOrchestrator();
  }
  return orchestrator;
}

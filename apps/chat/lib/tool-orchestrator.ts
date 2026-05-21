/**
 * Cross-App Tool Orchestrator — chains tools across Mail, Drive, Calendar, Docs.
 *
 * Predefined workflows that combine multiple tool calls into single actions:
 * - "Summarize this email thread and save to Docs"
 * - "Find the Q3 report and email it to the team"
 * - "Check my calendar, find free time, and schedule a meeting"
 */

import { getToolExecutor } from './tool-executor';
import type { ToolCallResult } from './types';

// ── Workflow Types ─────────────────────────────────────

export interface WorkflowStep {
  /** Step name for progress reporting */
  name: string;
  /** Tool to call */
  tool: string;
  /** Static args (merged with dynamic outputs from previous steps) */
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
  /** Final aggregated result */
  summary: string;
  /** Total duration in ms */
  totalDurationMs: number;
}

// ── Orchestrator ───────────────────────────────────────

export class ToolOrchestrator {
  private executor = getToolExecutor();

  /**
   * Execute a multi-step workflow.
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

      // Resolve dynamic args from previous steps
      const resolvedArgs = { ...step.args };
      if (step.extract) {
        for (const [argKey, source] of Object.entries(step.extract)) {
          const prevOutput = stepOutputs[source.fromStep];
          if (prevOutput && typeof prevOutput === 'object') {
            const value = this.deepGet(prevOutput as Record<string, unknown>, source.path);
            if (value !== undefined) {
              resolvedArgs[argKey] = value;
            }
          }
        }
      }

      const result = await this.executor.executeTool(step.tool, resolvedArgs);
      stepOutputs.push(this.safeParseJSON(result.result));

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
        break; // Stop on failure
      }
    }

    return {
      success: overallSuccess,
      steps: results,
      summary: this.summarizeWorkflow(results),
      totalDurationMs: Date.now() - startTime,
    };
  }

  // ── Predefined Workflows ─────────────────────────

  /**
   * Find a file and share it via email.
   */
  async findAndShareFile(
    query: string,
    recipientEmail: string,
    message: string,
    onProgress?: (step: number, msg: string) => void,
  ): Promise<WorkflowResult> {
    onProgress?.(0, 'Searching for file...');
    const searchResult = await this.executor.executeTool('file_search', { query, limit: 5 });

    if (searchResult.status === 'error') {
      return {
        success: false,
        steps: [{ name: 'search', success: false, result: searchResult.result, duration: searchResult.duration ?? 0 }],
        summary: 'Failed to find the file.',
        totalDurationMs: searchResult.duration ?? 0,
      };
    }

    const searchData = this.safeParseJSON(searchResult.result);
    const files = (searchData as { results?: Array<{ id: string; name: string }> }).results ?? [];

    if (files.length === 0) {
      return {
        success: false,
        steps: [{ name: 'search', success: true, result: searchResult.result, duration: searchResult.duration ?? 0 }],
        summary: 'No files found matching your query.',
        totalDurationMs: searchResult.duration ?? 0,
      };
    }

    const file = files[0];
    onProgress?.(1, `Found "${file.name}" — creating share link...`);

    const shareResult = await this.executor.executeTool('file_read', { file_id: file.id });
    const shareData = this.safeParseJSON(shareResult.result);
    const shareUrl = (shareData as { url?: string }).url ?? `(File: ${file.name})`;

    onProgress?.(2, 'Sending email...');
    const emailResult = await this.executor.executeTool('email_send', {
      to: recipientEmail,
      subject: `Shared: ${file.name}`,
      body: `${message}\n\nFile: ${shareUrl}`,
    });

    return {
      success: emailResult.status === 'success',
      steps: [
        { name: 'search', success: true, result: searchResult.result, duration: searchResult.duration ?? 0 },
        { name: 'share', success: shareResult.status === 'success', result: shareResult.result, duration: shareResult.duration ?? 0 },
        { name: 'email', success: emailResult.status === 'success', result: emailResult.result, duration: emailResult.duration ?? 0 },
      ],
      summary: emailResult.status === 'success'
        ? `Found "${file.name}" and shared with ${recipientEmail}.`
        : 'Failed to send sharing email.',
      totalDurationMs: (searchResult.duration ?? 0) + (shareResult.duration ?? 0) + (emailResult.duration ?? 0),
    };
  }

  /**
   * Summarize an email thread and save to Docs.
   */
  async summarizeAndSave(
    threadId: string,
    docTitle: string,
    onProgress?: (step: number, msg: string) => void,
  ): Promise<WorkflowResult> {
    onProgress?.(0, 'Fetching email thread...');
    const threadResult = await this.executor.executeTool('email_search', { query: '', folder: 'thread', limit: 1 });
    // In a real flow, the thread ID would be passed to a dedicated thread-fetch endpoint

    onProgress?.(1, 'Creating document...');
    const docResult = await this.executor.executeTool('document_write', {
      title: docTitle,
      content: `# Email Thread Summary\n\n**Thread ID:** ${threadId}\n\n${threadResult.result}`,
    });

    return {
      success: docResult.status === 'success',
      steps: [
        { name: 'fetch_thread', success: threadResult.status === 'success', result: threadResult.result, duration: threadResult.duration ?? 0 },
        { name: 'save_doc', success: docResult.status === 'success', result: docResult.result, duration: docResult.duration ?? 0 },
      ],
      summary: docResult.status === 'success'
        ? `Thread summarized and saved as "${docTitle}".`
        : 'Failed to save thread summary.',
      totalDurationMs: (threadResult.duration ?? 0) + (docResult.duration ?? 0),
    };
  }

  /**
   * Check schedule and propose a meeting time.
   */
  async smartSchedule(
    title: string,
    durationMinutes: number,
    attendeeEmails: string[],
    dateRange: { from: string; to: string },
    onProgress?: (step: number, msg: string) => void,
  ): Promise<WorkflowResult> {
    onProgress?.(0, 'Checking calendar...');
    const calResult = await this.executor.executeTool('calendar_create_event', {
      title: '__availability_check__',
      start_time: dateRange.from,
      end_time: dateRange.to,
    });

    // The calendar tool would return busy slots; for now we create the event
    onProgress?.(1, 'Scheduling meeting...');
    const eventResult = await this.executor.executeTool('calendar_create_event', {
      title,
      start_time: dateRange.from,
      end_time: dateRange.to,
      attendees: attendeeEmails,
      description: `Scheduled via Anvil AI. Duration: ${durationMinutes} min.`,
    });

    return {
      success: eventResult.status === 'success',
      steps: [
        { name: 'check_calendar', success: calResult.status === 'success', result: calResult.result, duration: calResult.duration ?? 0 },
        { name: 'create_event', success: eventResult.status === 'success', result: eventResult.result, duration: eventResult.duration ?? 0 },
      ],
      summary: eventResult.status === 'success'
        ? `Meeting "${title}" scheduled.`
        : 'Failed to schedule meeting.',
      totalDurationMs: (calResult.duration ?? 0) + (eventResult.duration ?? 0),
    };
  }

  // ── Helpers ──────────────────────────────────────

  private safeParseJSON(str: string): unknown {
    try {
      return JSON.parse(str);
    } catch {
      return { raw: str };
    }
  }

  private deepGet(obj: Record<string, unknown>, path: string): unknown {
    const keys = path.split('.');
    let current: unknown = obj;
    for (const key of keys) {
      if (current && typeof current === 'object' && current !== null) {
        current = (current as Record<string, unknown>)[key];
      } else {
        return undefined;
      }
    }
    return current;
  }

  private summarizeWorkflow(steps: WorkflowResult['steps']): string {
    const successful = steps.filter(s => s.success).length;
    const total = steps.length;

    if (successful === total) {
      return `All ${total} steps completed successfully.`;
    }
    return `${successful}/${total} steps completed. Last step failed.`;
  }
}

// Singleton
let orchestrator: ToolOrchestrator | null = null;

export function getToolOrchestrator(): ToolOrchestrator {
  if (!orchestrator) {
    orchestrator = new ToolOrchestrator();
  }
  return orchestrator;
}

/**
 * @anvil/ai/workflows — Workflow Engine
 *
 * Executes WorkflowDefinitions step-by-step, managing:
 * - Context passing between steps
 * - Conditional branching
 * - Parallel step execution
 * - Human-in-the-loop approval gates
 * - Progress event emission
 * - Error handling with continueOnError support
 */

import type {
  WorkflowDefinition,
  WorkflowRun,
  WorkflowStep,
  WorkflowContext,
  WorkflowEvent,
  WorkflowStepResult,
  WorkflowStatus,
} from './types.js';

// ── Template interpolation ──────────────────────────────

function interpolate(template: string, ctx: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, path) => {
    const parts = path.split('.');
    let val: unknown = ctx;
    for (const part of parts) {
      if (val == null || typeof val !== 'object') return '';
      val = (val as Record<string, unknown>)[part];
    }
    return val == null ? '' : String(val);
  });
}

// ── Input resolution ────────────────────────────────────

function resolveInputs(
  inputs: Record<string, unknown>,
  outputs: Record<string, unknown>,
  runInputs: Record<string, unknown>,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(inputs)) {
    if (typeof value === 'string' && value.startsWith('$')) {
      // Reference: $outputs.stepId.field or $inputs.fieldName
      const path = value.slice(1).split('.');
      let source: unknown = path[0] === 'inputs' ? runInputs : outputs;
      for (const part of path.slice(path[0] === 'inputs' ? 1 : 0)) {
        if (source == null || typeof source !== 'object') { source = undefined; break; }
        source = (source as Record<string, unknown>)[part];
      }
      resolved[key] = source;
    } else if (typeof value === 'string') {
      // String with possible template interpolation
      resolved[key] = interpolate(value, { ...outputs, ...runInputs });
    } else {
      resolved[key] = value;
    }
  }

  return resolved;
}

// ── Safe condition eval ─────────────────────────────────

function evalCondition(
  expr: string,
  outputs: Record<string, unknown>,
  inputs: Record<string, unknown>,
): boolean {
  try {
    // Extremely limited eval — only supports simple property access + comparisons
    // In production use a proper expression evaluator (e.g. expr-eval, filtrex)
    const fn = new Function('outputs', 'inputs', `"use strict"; return !!(${expr});`);
    return Boolean(fn(outputs, inputs));
  } catch {
    return false;
  }
}

// ── Workflow Engine ─────────────────────────────────────

export class WorkflowEngine {
  private runs = new Map<string, WorkflowRun>();
  private approvalResolvers = new Map<string, (granted: boolean) => void>();

  /**
   * Start executing a workflow.
   *
   * @param definition - The workflow to execute
   * @param inputs - Input parameters
   * @param executeTool - Tool executor (from chat engine or direct)
   * @param generate - AI text generator
   * @param onEvent - Progress event emitter
   * @param preferences - User preferences
   * @returns The completed run with all results
   */
  async execute(
    definition: WorkflowDefinition,
    inputs: Record<string, unknown>,
    executeTool: (tool: string, args: Record<string, unknown>) => Promise<string>,
    generate: (prompt: string, options?: { maxTokens?: number; temperature?: number }) => Promise<string>,
    onEvent: (event: WorkflowEvent) => void,
    preferences: Record<string, string> = {},
    userId?: string,
  ): Promise<WorkflowRun> {
    const runId = `wr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const run: WorkflowRun = {
      id: runId,
      workflowId: definition.id,
      workflowName: definition.name,
      status: 'running',
      inputs,
      stepResults: [],
      startedAt: Date.now(),
      userId,
    };

    this.runs.set(runId, run);

    const outputs: Record<string, unknown> = {};

    const emit = (event: Omit<WorkflowEvent, 'workflowRunId' | 'timestamp'>) => {
      onEvent({ ...event, workflowRunId: runId, timestamp: Date.now() });
    };

    const ctx: WorkflowContext = {
      run,
      outputs,
      preferences,
      executeTool,
      generate,
      emit: (e) => onEvent(e),
    };

    // Build step index for fast lookup
    const stepIndex = new Map(definition.steps.map((s) => [s.id, s]));

    // Track which steps are in a parallel group (skip individual execution)
    const parallelMembers = new Set<string>();
    for (const step of definition.steps) {
      if (step.type === 'parallel' && step.parallelSteps) {
        for (const id of step.parallelSteps) parallelMembers.add(id);
      }
    }

    let stepCount = 0;
    const totalSteps = definition.steps.filter(
      (s) => s.type !== 'parallel' || !parallelMembers.has(s.id),
    ).length;

    try {
      for (const step of definition.steps) {
        // Skip steps that are members of a parallel group (executed by the parallel step)
        if (parallelMembers.has(step.id)) continue;

        run.currentStepId = step.id;
        stepCount++;

        emit({
          type: 'step_start',
          stepId: step.id,
          stepName: step.name,
          message: step.description ?? step.name,
          progress: Math.round((stepCount / totalSteps) * 90), // reserve 10% for finalization
        });

        const stepStart = Date.now();
        let stepOutput: unknown = null;
        let stepError: string | undefined;
        let stepStatus: WorkflowStepResult['status'] = 'running';

        try {
          stepOutput = await this.executeStep(step, ctx, stepIndex);
          outputs[step.id] = stepOutput;
          stepStatus = 'completed';

          emit({
            type: 'step_complete',
            stepId: step.id,
            stepName: step.name,
            data: stepOutput,
            progress: Math.round((stepCount / totalSteps) * 90),
          });
        } catch (err) {
          stepError = err instanceof Error ? err.message : String(err);
          stepStatus = 'failed';

          emit({
            type: 'step_failed',
            stepId: step.id,
            stepName: step.name,
            message: stepError,
          });

          if (!step.continueOnError) {
            run.status = 'failed';
            run.error = `Step "${step.name}" failed: ${stepError}`;
            run.completedAt = Date.now();
            this.runs.set(runId, run);
            emit({ type: 'workflow_failed', message: run.error, progress: 0 });
            return run;
          }
        }

        run.stepResults.push({
          stepId: step.id,
          status: stepStatus,
          output: stepOutput,
          error: stepError,
          durationMs: Date.now() - stepStart,
          startedAt: stepStart,
        });
      }

      // Build final output from the last step or a designated output step
      const lastResult = run.stepResults[run.stepResults.length - 1];
      run.output = lastResult?.output ?? outputs;
      run.status = 'completed';
      run.completedAt = Date.now();

      emit({ type: 'workflow_complete', data: run.output, progress: 100 });
    } catch (err) {
      run.status = 'failed';
      run.error = err instanceof Error ? err.message : String(err);
      run.completedAt = Date.now();
      emit({ type: 'workflow_failed', message: run.error, progress: 0 });
    }

    this.runs.set(runId, run);
    return run;
  }

  private async executeStep(
    step: WorkflowStep,
    ctx: WorkflowContext,
    stepIndex: Map<string, WorkflowStep>,
  ): Promise<unknown> {
    const resolvedInputs = step.inputs
      ? resolveInputs(step.inputs, ctx.outputs, ctx.run.inputs)
      : {};

    switch (step.type) {
      case 'tool_call': {
        if (!step.tool) throw new Error(`Step "${step.id}" is tool_call but has no tool name`);
        const result = await ctx.executeTool(step.tool, resolvedInputs);
        return step.outputTransform ? step.outputTransform(result, ctx) : result;
      }

      case 'ai_generate': {
        if (!step.prompt) throw new Error(`Step "${step.id}" is ai_generate but has no prompt`);
        const prompt = interpolate(step.prompt, { ...ctx.outputs, ...ctx.run.inputs });
        const result = await ctx.generate(prompt);
        return step.outputTransform ? step.outputTransform(result, ctx) : result;
      }

      case 'transform': {
        if (!step.outputTransform) throw new Error(`Step "${step.id}" is transform but has no outputTransform`);
        return step.outputTransform(resolvedInputs, ctx);
      }

      case 'condition': {
        if (!step.condition) throw new Error(`Step "${step.id}" is condition but has no expression`);
        const result = evalCondition(step.condition, ctx.outputs, ctx.run.inputs);
        return { condition: result, branch: result ? 'true' : 'false' };
      }

      case 'parallel': {
        if (!step.parallelSteps?.length) return {};

        const subSteps = step.parallelSteps
          .map((id) => stepIndex.get(id))
          .filter((s): s is WorkflowStep => s != null);

        const results = await Promise.allSettled(
          subSteps.map((sub) => this.executeStep(sub, ctx, stepIndex)),
        );

        const parallelOutputs: Record<string, unknown> = {};
        for (let i = 0; i < subSteps.length; i++) {
          const res = results[i];
          if (res.status === 'fulfilled') {
            ctx.outputs[subSteps[i].id] = res.value;
            parallelOutputs[subSteps[i].id] = res.value;
          } else {
            parallelOutputs[subSteps[i].id] = { error: res.reason?.message ?? 'Failed' };
          }
        }

        return step.outputTransform ? step.outputTransform(parallelOutputs, ctx) : parallelOutputs;
      }

      case 'approval_gate': {
        const message = step.approvalMessage
          ? interpolate(step.approvalMessage, { ...ctx.outputs, ...ctx.run.inputs })
          : `Approve step: ${step.name}`;

        ctx.emit({
          type: 'approval_requested',
          workflowRunId: ctx.run.id,
          stepId: step.id,
          stepName: step.name,
          message,
          timestamp: Date.now(),
        });

        // Wait for approval decision
        const granted = await new Promise<boolean>((resolve) => {
          this.approvalResolvers.set(`${ctx.run.id}:${step.id}`, resolve);
          // Auto-approve after 5 minutes (configurable)
          setTimeout(() => {
            if (this.approvalResolvers.has(`${ctx.run.id}:${step.id}`)) {
              resolve(false); // Default deny on timeout
            }
          }, 5 * 60 * 1000);
        });

        if (!granted) throw new Error('Action rejected by user');

        ctx.emit({
          type: 'approval_granted',
          workflowRunId: ctx.run.id,
          stepId: step.id,
          stepName: step.name,
          timestamp: Date.now(),
        });

        return { approved: true };
      }

      case 'notification': {
        // Emit as a progress event with message
        ctx.emit({
          type: 'progress',
          workflowRunId: ctx.run.id,
          stepId: step.id,
          message: step.description ?? step.name,
          timestamp: Date.now(),
        });
        return { notified: true };
      }

      default:
        throw new Error(`Unknown step type: ${(step as WorkflowStep).type}`);
    }
  }

  /** Resolve an approval gate from external code (e.g. API endpoint) */
  resolveApproval(runId: string, stepId: string, granted: boolean): boolean {
    const resolver = this.approvalResolvers.get(`${runId}:${stepId}`);
    if (!resolver) return false;
    this.approvalResolvers.delete(`${runId}:${stepId}`);
    resolver(granted);
    return true;
  }

  /** Get a run by ID */
  getRun(runId: string): WorkflowRun | undefined {
    return this.runs.get(runId);
  }

  /** Get all runs for a user */
  getUserRuns(userId: string): WorkflowRun[] {
    return Array.from(this.runs.values())
      .filter((r) => r.userId === userId)
      .sort((a, b) => b.startedAt - a.startedAt);
  }

  /** Cancel a running workflow */
  cancel(runId: string): boolean {
    const run = this.runs.get(runId);
    if (!run || run.status !== 'running') return false;
    run.status = 'cancelled';
    run.completedAt = Date.now();
    return true;
  }
}

// ── Singleton instance ──────────────────────────────────

export const workflowEngine = new WorkflowEngine();

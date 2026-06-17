/**
 * @anvil/ai/workflows — Composable AI Workflow Engine
 *
 * Workflows are predefined multi-step AI pipelines that:
 * 1. Accept structured inputs
 * 2. Execute steps sequentially or in parallel
 * 3. Pass outputs between steps as context
 * 4. Emit progress events for real-time UI
 * 5. Support conditional branching
 * 6. Produce typed, structured outputs
 *
 * Example workflows:
 * - Inbox Zero: categorize → prioritize → bulk archive → draft replies
 * - Weekly Summary: fetch mail + calendar + docs → synthesize → publish
 * - Deal Room: find emails + docs about deal → summarize → create briefing doc
 */

export type WorkflowStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type StepStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped';

export type StepType =
  | 'tool_call'      // Execute an Anvil tool
  | 'ai_generate'    // Generate text with AI
  | 'transform'      // Pure JS transformation
  | 'condition'      // Branch based on data
  | 'parallel'       // Run multiple steps in parallel
  | 'approval_gate'  // Pause for human approval
  | 'notification';  // Send notification to user

export interface WorkflowStep {
  id: string;
  name: string;
  description?: string;
  type: StepType;

  /** Input mapping: { paramName: 'output.from.previous.step' | literal } */
  inputs?: Record<string, unknown>;

  /** For tool_call: tool name */
  tool?: string;

  /** For ai_generate: prompt template (use {{variable}} for interpolation) */
  prompt?: string;

  /** For condition: JS expression to evaluate */
  condition?: string;

  /** For parallel: list of sub-step IDs to run */
  parallelSteps?: string[];

  /** For approval_gate: message to show user */
  approvalMessage?: string;

  /** Whether to continue if this step fails */
  continueOnError?: boolean;

  /** Transform output before passing to next step */
  outputTransform?: (output: unknown, context: WorkflowContext) => unknown;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  /** Icon name (from lucide-react) */
  icon?: string;
  /** Steps in execution order */
  steps: WorkflowStep[];
  /** Input schema for this workflow */
  inputSchema?: Record<string, WorkflowInputField>;
  /** Tags for discovery */
  tags?: string[];
  /** Estimated duration in seconds */
  estimatedDuration?: number;
}

export interface WorkflowInputField {
  type: 'string' | 'number' | 'boolean' | 'array';
  description: string;
  required?: boolean;
  default?: unknown;
}

export interface WorkflowStepResult {
  stepId: string;
  status: StepStatus;
  output: unknown;
  error?: string;
  durationMs: number;
  startedAt: number;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  workflowName: string;
  status: WorkflowStatus;
  inputs: Record<string, unknown>;
  stepResults: WorkflowStepResult[];
  currentStepId?: string;
  output?: unknown;
  error?: string;
  startedAt: number;
  completedAt?: number;
  userId?: string;
}

export interface WorkflowContext {
  run: WorkflowRun;
  /** Accumulated outputs from all previous steps */
  outputs: Record<string, unknown>;
  /** Resolved user preferences */
  preferences: Record<string, string>;
  /** Tool executor */
  executeTool: (tool: string, args: Record<string, unknown>) => Promise<string>;
  /** AI generator */
  generate: (prompt: string, options?: { maxTokens?: number; temperature?: number }) => Promise<string>;
  /** Emit progress event */
  emit: (event: WorkflowEvent) => void;
}

export interface WorkflowEvent {
  type:
    | 'step_start'
    | 'step_complete'
    | 'step_failed'
    | 'step_skipped'
    | 'approval_requested'
    | 'approval_granted'
    | 'approval_denied'
    | 'workflow_complete'
    | 'workflow_failed'
    | 'progress';
  workflowRunId: string;
  stepId?: string;
  stepName?: string;
  message?: string;
  data?: unknown;
  progress?: number; // 0-100
  timestamp: number;
}

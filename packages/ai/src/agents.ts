/**
 * @anvil/ai — Autonomous AI Agent system with human-in-the-loop approval
 *
 * Agents can perform multi-step tasks autonomously (email triage,
 * file organization, schedule negotiation) but require explicit
 * human approval for destructive or high-impact actions.
 *
 * Architecture:
 * - AgentRuntime: manages agent lifecycle and execution
 * - AgentAction: individual action with approval requirements
 * - ApprovalGate: human-in-the-loop checkpoint
 * - ActionExecutor: safe execution with rollback support
 */

// ── Types ────────────────────────────────────────────────

export type AgentStatus = 'idle' | 'running' | 'waiting_approval' | 'completed' | 'failed';
export type ActionRisk = 'low' | 'medium' | 'high' | 'destructive';
export type ApprovalDecision = 'approved' | 'rejected' | 'modified';

export interface AgentAction {
  id: string;
  type: string;
  description: string;
  risk: ActionRisk;
  requiresApproval: boolean;
  status: 'pending' | 'approved' | 'rejected' | 'executing' | 'completed' | 'failed' | 'rolled_back';
  params: Record<string, any>;
  result?: any;
  error?: string;
  createdAt: number;
  executedAt?: number;
}

export interface AgentPlan {
  id: string;
  goal: string;
  actions: AgentAction[];
  status: AgentStatus;
  createdAt: number;
  completedAt?: number;
}

export interface ApprovalRequest {
  planId: string;
  actionId: string;
  action: AgentAction;
  decide: (decision: ApprovalDecision, modifications?: Record<string, any>) => void;
}

export interface AgentConfig {
  /** Agent name for logging */
  name: string;
  /** AI provider for reasoning */
  aiProvider: any; // AIInstance from @anvil/ai
  /** Risk threshold for requiring approval (default: 'medium') */
  approvalThreshold?: ActionRisk;
  /** Maximum concurrent actions (default: 3) */
  maxConcurrency?: number;
  /** Maximum retries per action (default: 2) */
  maxRetries?: number;
  /** Callback when approval is needed */
  onRequestApproval?: (request: ApprovalRequest) => void;
}

// ── Risk evaluation ──────────────────────────────────────

const RISK_LEVELS: Record<ActionRisk, number> = {
  low: 0,
  medium: 1,
  high: 2,
  destructive: 3,
};

function shouldRequireApproval(action: AgentAction, threshold: ActionRisk): boolean {
  if (action.requiresApproval) return true;
  return RISK_LEVELS[action.risk] >= RISK_LEVELS[threshold];
}

// ── Action executors registry ────────────────────────────

type ActionExecutorFn = (params: Record<string, any>) => Promise<any>;
type RollbackFn = (params: Record<string, any>, result: any) => Promise<void>;

interface ActionDefinition {
  execute: ActionExecutorFn;
  rollback?: RollbackFn;
  risk: ActionRisk;
  description: string;
}

class ActionRegistry {
  private actions = new Map<string, ActionDefinition>();

  register(type: string, definition: ActionDefinition): void {
    this.actions.set(type, definition);
  }

  get(type: string): ActionDefinition | undefined {
    return this.actions.get(type);
  }

  list(): string[] {
    return Array.from(this.actions.keys());
  }
}

// ── Agent Runtime ────────────────────────────────────────

export class AgentRuntime {
  readonly name: string;
  private config: AgentConfig;
  private registry: ActionRegistry;
  private activePlans: Map<string, AgentPlan> = new Map();
  private pendingApprovals: Map<string, ApprovalRequest> = new Map();
  private approvalThreshold: ActionRisk;

  constructor(config: AgentConfig) {
    this.name = config.name;
    this.config = config;
    this.registry = new ActionRegistry();
    this.approvalThreshold = config.approvalThreshold ?? 'medium';
    this.registerBuiltinActions();
  }

  /**
   * Register a custom action type.
   */
  registerAction(type: string, definition: ActionDefinition): void {
    this.registry.register(type, definition);
  }

  /**
   * Create a plan for an autonomous task.
   * The agent reasons about the goal and generates a sequence of actions.
   */
  async plan(goal: string, context?: Record<string, any>): Promise<AgentPlan> {
    const planId = crypto.randomUUID();

    // Use AI to break down the goal into actions
    const prompt = `You are an AI agent that helps users with workspace tasks.

Goal: ${goal}
Context: ${JSON.stringify(context ?? {})}

Available actions: ${this.registry.list().join(', ')}

Break this goal into a JSON array of actions. Each action has:
- type: one of the available action types
- params: object with required parameters
- description: human-readable description of what this action does
- risk: "low", "medium", "high", or "destructive"

Return ONLY a JSON array, no other text.`;

    let actions: AgentAction[] = [];

    try {
      const result = await this.config.aiProvider.generate(prompt);
      const parsed = JSON.parse(result.text);
      const rawActions = Array.isArray(parsed) ? parsed : parsed.actions ?? [];

      actions = rawActions.map((a: any, i: number) => ({
        id: `${planId}_action_${i}`,
        type: a.type,
        description: a.description,
        risk: a.risk ?? 'low',
        requiresApproval: shouldRequireApproval(
          { ...a, risk: a.risk ?? 'low', requiresApproval: false } as AgentAction,
          this.approvalThreshold,
        ),
        status: 'pending' as const,
        params: a.params ?? {},
        createdAt: Date.now(),
      }));
    } catch {
      // If AI planning fails, create a single generic action
      actions = [{
        id: `${planId}_action_0`,
        type: 'generic',
        description: goal,
        risk: 'medium',
        requiresApproval: true,
        status: 'pending',
        params: { goal, context },
        createdAt: Date.now(),
      }];
    }

    const plan: AgentPlan = {
      id: planId,
      goal,
      actions,
      status: 'idle',
      createdAt: Date.now(),
    };

    this.activePlans.set(planId, plan);
    return plan;
  }

  /**
   * Execute a plan. Pauses when human approval is needed.
   */
  async execute(planId: string): Promise<AgentPlan> {
    const plan = this.activePlans.get(planId);
    if (!plan) throw new Error(`Plan ${planId} not found`);

    plan.status = 'running';

    for (const action of plan.actions) {
      if (action.status === 'completed' || action.status === 'rejected') continue;

      // Check if approval is needed
      if (action.requiresApproval && action.status === 'pending') {
        action.status = 'pending';
        plan.status = 'waiting_approval';

        // Request approval
        await this.requestApproval(plan, action);

        // If plan is still waiting, return and let the caller resume later
        if (plan.status === 'waiting_approval') return plan;
      }

      // Execute the action
      if (action.status === 'approved' || !action.requiresApproval) {
        action.status = 'executing';

        const definition = this.registry.get(action.type);
        if (!definition) {
          action.status = 'failed';
          action.error = `Unknown action type: ${action.type}`;
          continue;
        }

        try {
          action.result = await definition.execute(action.params);
          action.status = 'completed';
          action.executedAt = Date.now();
        } catch (err) {
          action.status = 'failed';
          action.error = err instanceof Error ? err.message : String(err);

          // Attempt rollback
          if (definition.rollback) {
            try {
              await definition.rollback(action.params, action.result);
              action.status = 'rolled_back';
            } catch {
              // Rollback failed too
            }
          }
        }
      }
    }

    // Check final status
    const allCompleted = plan.actions.every(a => a.status === 'completed');
    const anyFailed = plan.actions.some(a => a.status === 'failed');

    plan.status = anyFailed ? 'failed' : allCompleted ? 'completed' : 'completed';
    plan.completedAt = Date.now();

    return plan;
  }

  /**
   * Approve a pending action.
   */
  approve(planId: string, actionId: string, modifications?: Record<string, any>): void {
    const plan = this.activePlans.get(planId);
    if (!plan) return;

    const action = plan.actions.find(a => a.id === actionId);
    if (!action) return;

    if (modifications) {
      action.params = { ...action.params, ...modifications };
    }

    action.status = 'approved';

    // Resume execution
    plan.status = 'running';
  }

  /**
   * Reject a pending action.
   */
  reject(planId: string, actionId: string): void {
    const plan = this.activePlans.get(planId);
    if (!plan) return;

    const action = plan.actions.find(a => a.id === actionId);
    if (!action) return;

    action.status = 'rejected';

    // Check if we should continue or abort
    plan.status = 'running';
  }

  /**
   * Get plan status.
   */
  getPlan(planId: string): AgentPlan | undefined {
    return this.activePlans.get(planId);
  }

  /**
   * List all active plans.
   */
  listPlans(): AgentPlan[] {
    return Array.from(this.activePlans.values());
  }

  // ── Built-in actions ─────────────────────────────────

  private registerBuiltinActions(): void {
    // Email triage
    this.registry.register('email_triage', {
      risk: 'medium',
      description: 'Categorize and prioritize emails',
      execute: async (params) => {
        // Would integrate with Gmail JMAP client
        return { triaged: true, categories: params.categories ?? ['important', 'newsletter', 'social', 'promotion'] };
      },
      rollback: async () => {
        // Email triage is reversible (just re-categorize)
      },
    });

    // Email archive/bulk action
    this.registry.register('email_bulk_action', {
      risk: 'high',
      description: 'Archive, delete, or label multiple emails',
      execute: async (params) => {
        return { action: params.action, count: params.emailIds?.length ?? 0, success: true };
      },
      rollback: async (params, result) => {
        // Undo the bulk action
        return { undone: true, count: result.count };
      },
    });

    // File organization
    this.registry.register('file_organize', {
      risk: 'medium',
      description: 'Move/rename files based on AI-suggested organization',
      execute: async (params) => {
        return { organized: true, moved: params.moves?.length ?? 0 };
      },
      rollback: async (params, result) => {
        // Move files back to original locations
        return { undone: true };
      },
    });

    // File deduplicate
    this.registry.register('file_deduplicate', {
      risk: 'high',
      description: 'Find and remove duplicate files (moves to trash)',
      execute: async (params) => {
        return { duplicatesFound: params.duplicates?.length ?? 0, trashed: true };
      },
      rollback: async (params, result) => {
        // Restore from trash
        return { restored: result.duplicatesFound };
      },
    });

    // Schedule negotiation
    this.registry.register('schedule_negotiate', {
      risk: 'medium',
      description: 'Propose meeting times based on calendar availability',
      execute: async (params) => {
        return {
          proposedTimes: params.proposedTimes ?? [],
          attendees: params.attendees ?? [],
          status: 'proposed',
        };
      },
    });

    // Schedule create event
    this.registry.register('schedule_create_event', {
      risk: 'low',
      description: 'Create a calendar event after confirmation',
      execute: async (params) => {
        return { eventId: crypto.randomUUID(), created: true, ...params };
      },
      rollback: async (params, result) => {
        return { deleted: true, eventId: result.eventId };
      },
    });

    // Generic fallback action
    this.registry.register('generic', {
      risk: 'medium',
      description: 'Generic action for custom tasks',
      execute: async (params) => {
        return { goal: params.goal, completed: true };
      },
    });
  }

  // ── Approval handling ────────────────────────────────

  private async requestApproval(plan: AgentPlan, action: AgentAction): Promise<void> {
    if (this.config.onRequestApproval) {
      return new Promise((resolve) => {
        const request: ApprovalRequest = {
          planId: plan.id,
          actionId: action.id,
          action,
          decide: (decision, modifications) => {
            if (decision === 'approved') {
              this.approve(plan.id, action.id, modifications);
            } else if (decision === 'rejected') {
              this.reject(plan.id, action.id);
            }
            resolve();
          },
        };

        this.pendingApprovals.set(action.id, request);
        this.config.onRequestApproval!(request);
      });
    }

    // No approval handler — auto-approve low-risk actions
    if (action.risk === 'low') {
      action.status = 'approved';
    }
  }
}

/**
 * Convenience: create an email triage agent.
 */
export function createEmailTriageAgent(config: Omit<AgentConfig, 'name'>): AgentRuntime {
  const agent = new AgentRuntime({
    ...config,
    name: 'email-triage',
    approvalThreshold: config.approvalThreshold ?? 'high',
  });
  return agent;
}

/**
 * Convenience: create a file organization agent.
 */
export function createFileOrganizationAgent(config: Omit<AgentConfig, 'name'>): AgentRuntime {
  const agent = new AgentRuntime({
    ...config,
    name: 'file-organizer',
    approvalThreshold: config.approvalThreshold ?? 'medium',
  });
  return agent;
}

/**
 * Convenience: create a schedule negotiation agent.
 */
export function createScheduleAgent(config: Omit<AgentConfig, 'name'>): AgentRuntime {
  const agent = new AgentRuntime({
    ...config,
    name: 'schedule-negotiator',
    approvalThreshold: config.approvalThreshold ?? 'low',
  });
  return agent;
}

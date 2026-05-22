/**
 * #14 — PrivacyCompose Framework
 *
 * Cross-module privacy budget composition and tracking.
 * When multiple privacy modules (DP, PSI, PIR, etc.) operate on the same data,
 * their privacy losses compose. Naive sum is overly pessimistic; Rényi DP
 * composition provides tighter bounds.
 *
 * Novel: Automatic cross-module ε-accounting with Rényi DP,
 * module adapters for plug-and-play composition, and
 * cross-module loss computation that's tighter than naive summation.
 */

import { crypto } from '../crypto-util.js';

// ── Types ──

export interface ModuleAdapter {
  /** Module identifier */
  id: string;
  /** Module type */
  type: 'dp' | 'psi' | 'pir' | 'smpc' | 'orcrdt' | 'steg' | 'zk' | 'custom';
  /** Per-query epsilon cost */
  epsilonPerQuery: number;
  /** Per-query delta cost */
  deltaPerQuery: number;
  /** Number of queries this module has made */
  queryCount: number;
  /** Rényi DP alpha parameter (for tighter composition) */
  renyiAlpha: number;
  /** Rényi DP epsilon at alpha (RDP cost per query) */
  renyiEpsilon: number;
}

export interface ComposedBudget {
  /** Total composed epsilon (Rényi → (ε,δ)-DP conversion) */
  composedEpsilon: number;
  /** Total composed delta */
  composedDelta: number;
  /** Tighter bound using Rényi DP composition */
  renyiComposedEpsilon: number;
  /** Naive sum (for comparison) */
  naiveSumEpsilon: number;
  /** Savings from composition theorem vs naive sum */
  savings: number;
  /** Per-module breakdown */
  breakdown: Array<{
    moduleId: string;
    epsilon: number;
    delta: number;
    queryCount: number;
  }>;
}

export interface CrossModuleLoss {
  /** Whether the same data flows through multiple modules */
  hasOverlap: boolean;
  /** Effective epsilon after cross-module composition */
  effectiveEpsilon: number;
  /** Which modules share data */
  overlappingModules: string[];
  /** Whether the composition is safe */
  isSafe: boolean;
  /** Maximum safe queries remaining */
  remainingQueries: number;
}

// ── PrivacyCompose ──

export class PrivacyCompose {
  private modules: Map<string, ModuleAdapter> = new Map();
  private dataFlowGraph: Map<string, Set<string>> = new Map(); // dataId -> moduleIds
  private totalBudget: { epsilon: number; delta: number };

  constructor(totalEpsilon = 10, totalDelta = 1e-5) {
    this.totalBudget = { epsilon: totalEpsilon, delta: totalDelta };
  }

  /**
   * Register a privacy module for composition tracking.
   */
  registerModule(adapter: ModuleAdapter): void {
    this.modules.set(adapter.id, { ...adapter });
  }

  /**
   * Remove a module from tracking.
   */
  unregisterModule(moduleId: string): boolean {
    // Clean up data flow graph
    for (const [, modules] of this.dataFlowGraph) {
      modules.delete(moduleId);
    }
    return this.modules.delete(moduleId);
  }

  /**
   * Record that a data item flows through a module.
   * This enables cross-module loss computation.
   */
  recordDataFlow(dataId: string, moduleId: string): void {
    if (!this.dataFlowGraph.has(dataId)) {
      this.dataFlowGraph.set(dataId, new Set());
    }
    this.dataFlowGraph.get(dataId)!.add(moduleId);
  }

  /**
   * Compute the composed privacy budget across all modules.
   * Uses Rényi DP composition for tighter bounds.
   */
  computeComposedBudget(): ComposedBudget {
    let naiveSumEpsilon = 0;
    let naiveSumDelta = 0;
    let renyiSum = 0;
    let maxAlpha = 2; // Default α for Rényi DP

    const breakdown: ComposedBudget['breakdown'] = [];

    for (const [id, adapter] of this.modules) {
      const moduleEps = adapter.epsilonPerQuery * adapter.queryCount;
      const moduleDelta = adapter.deltaPerQuery * adapter.queryCount;

      naiveSumEpsilon += moduleEps;
      naiveSumDelta += moduleDelta;

      // Rényi DP composition: sum of RDP costs
      // RDP(α) per query is adapter.renyiEpsilon
      renyiSum += adapter.renyiEpsilon * adapter.queryCount;

      if (adapter.renyiAlpha > maxAlpha) {
        maxAlpha = adapter.renyiAlpha;
      }

      breakdown.push({
        moduleId: id,
        epsilon: moduleEps,
        delta: moduleDelta,
        queryCount: adapter.queryCount,
      });
    }

    // Convert Rényi DP → (ε, δ)-DP: ε = RDP(α) + ln(1/δ) / (α - 1)
    const renyiComposedEpsilon =
      renyiSum + Math.log(1 / this.totalBudget.delta) / (maxAlpha - 1);

    // Savings from composition
    const savings = naiveSumEpsilon > 0
      ? 1 - renyiComposedEpsilon / naiveSumEpsilon
      : 0;

    return {
      composedEpsilon: renyiComposedEpsilon,
      composedDelta: naiveSumDelta,
      renyiComposedEpsilon,
      naiveSumEpsilon,
      savings: Math.max(0, savings),
      breakdown,
    };
  }

  /**
   * Compute cross-module privacy loss for data that flows through
   * multiple modules. Identifies where composition is tightest.
   */
  computeCrossModuleLoss(dataId: string): CrossModuleLoss {
    const modules = this.dataFlowGraph.get(dataId);
    if (!modules || modules.size <= 1) {
      return {
        hasOverlap: false,
        effectiveEpsilon: 0,
        overlappingModules: modules ? Array.from(modules) : [],
        isSafe: true,
        remainingQueries: Infinity,
      };
    }

    // Sum privacy costs for all modules touching this data
    let effectiveEpsilon = 0;
    const overlappingModules: string[] = [];

    for (const moduleId of modules) {
      const adapter = this.modules.get(moduleId);
      if (adapter) {
        effectiveEpsilon += adapter.epsilonPerQuery * adapter.queryCount;
        overlappingModules.push(moduleId);
      }
    }

    // Apply Rényi DP composition for tighter bound
    let renyiSum = 0;
    let maxAlpha = 2;
    for (const moduleId of modules) {
      const adapter = this.modules.get(moduleId);
      if (adapter) {
        renyiSum += adapter.renyiEpsilon * adapter.queryCount;
        if (adapter.renyiAlpha > maxAlpha) maxAlpha = adapter.renyiAlpha;
      }
    }
    effectiveEpsilon = renyiSum + Math.log(1 / this.totalBudget.delta) / (maxAlpha - 1);

    const isSafe = effectiveEpsilon <= this.totalBudget.epsilon;
    const avgEpsPerQuery = overlappingModules.length > 0
      ? effectiveEpsilon / overlappingModules.reduce((sum, id) => {
          const a = this.modules.get(id);
          return sum + (a?.queryCount || 1);
        }, 0)
      : 1;
    const remainingQueries = Math.floor(
      (this.totalBudget.epsilon - effectiveEpsilon) / avgEpsPerQuery
    );

    return {
      hasOverlap: true,
      effectiveEpsilon,
      overlappingModules,
      isSafe,
      remainingQueries: Math.max(0, remainingQueries),
    };
  }

  /**
   * Check if a new query can be safely executed.
   */
  canExecuteQuery(moduleId: string, additionalQueries = 1): boolean {
    const adapter = this.modules.get(moduleId);
    if (!adapter) return false;

    const budget = this.computeComposedBudget();
    const additionalEps = adapter.epsilonPerQuery * additionalQueries;
    return budget.composedEpsilon + additionalEps <= this.totalBudget.epsilon;
  }

  /**
   * Execute a query (spend budget) and update tracking.
   */
  executeQuery(moduleId: string, dataIds: string[] = []): ComposedBudget {
    const adapter = this.modules.get(moduleId);
    if (!adapter) throw new Error(`Module ${moduleId} not registered`);

    if (!this.canExecuteQuery(moduleId)) {
      throw new Error('Privacy budget exhausted for this operation');
    }

    // Increment query count
    adapter.queryCount++;

    // Record data flows
    for (const dataId of dataIds) {
      this.recordDataFlow(dataId, moduleId);
    }

    return this.computeComposedBudget();
  }

  /**
   * Get the global budget status.
   */
  getStatus(): {
    totalBudget: { epsilon: number; delta: number };
    composed: ComposedBudget;
    modulesRegistered: number;
  } {
    return {
      totalBudget: this.totalBudget,
      composed: this.computeComposedBudget(),
      modulesRegistered: this.modules.size,
    };
  }
}

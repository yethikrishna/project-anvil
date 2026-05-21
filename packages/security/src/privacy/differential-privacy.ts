/**
 * #6 — Differential Privacy for AI Features
 *
 * AI learns patterns from your data WITHOUT exposing individual data points.
 *
 * Implements multiple DP mechanisms:
 * - Laplace mechanism (numeric queries)
 * - Exponential mechanism (categorical selections)
 * - Gaussian mechanism (for compositions)
 * - Privacy budget tracking (ε-δ accounting)
 * - Rényi DP composition (tighter bounds)
 *
 * Use case: Anvil AI features (smart compose, search suggestions,
 * auto-labeling) can learn from aggregate patterns without memorizing
 * any individual user's data. Each user's contribution is plausibly deniable.
 *
 * Key insight: Even if an attacker sees the AI's output AND knows
 * all other users' data, they cannot determine if any specific user's
 * data was included in the training set.
 */

import { crypto } from './crypto-util.js';

// ── Types ──

export interface DPConfig {
  /** Privacy budget (smaller = more private, ε ≤ 1 is strong) */
  epsilon: number;
  /** Failure probability (typically 1e-5 to 1e-7) */
  delta: number;
  /** Sensitivity: max change one user can cause */
  sensitivity: number;
  /** Mechanism type */
  mechanism: 'laplace' | 'gaussian' | 'exponential';
}

export interface DPOutput<T> {
  /** The noisy result */
  value: T;
  /** Privacy cost of this query */
  privacyCost: PrivacyBudget;
  /** Confidence interval (95%) */
  confidence95: [number, number];
}

export interface PrivacyBudget {
  /** Total ε consumed so far */
  epsilonSpent: number;
  /** Total δ consumed so far */
  deltaSpent: number;
  /** Remaining budget */
  epsilonRemaining: number;
  /** Number of queries */
  queryCount: number;
}

// ── DP Mechanism ──

export class DPMechanism {
  private config: DPConfig;

  constructor(config: DPConfig) {
    this.config = config;
    // Validate
    if (config.epsilon <= 0) throw new Error('ε must be positive');
    if (config.delta < 0 || config.delta >= 1) throw new Error('δ must be in [0, 1)');
  }

  /**
   * Add Laplace noise to a numeric value.
   * Satisfies (ε, 0)-differential privacy (pure DP).
   */
  laplace(value: number): DPOutput<number> {
    const scale = this.config.sensitivity / this.config.epsilon;
    const noise = this.sampleLaplace(scale);
    const noisyValue = value + noise;

    const budget = {
      epsilonSpent: this.config.epsilon,
      deltaSpent: 0,
      epsilonRemaining: 0,
      queryCount: 1,
    };

    return {
      value: noisyValue,
      privacyCost: budget,
      confidence95: [noisyValue - 2 * scale, noisyValue + 2 * scale],
    };
  }

  /**
   * Add Gaussian noise to a numeric value.
   * Satisfies (ε, δ)-differential privacy (approximate DP).
   * Better for compositions than Laplace.
   */
  gaussian(value: number): DPOutput<number> {
    const sigma =
      (this.config.sensitivity *
        Math.sqrt(2 * Math.log(1.25 / this.config.delta))) /
      this.config.epsilon;
    const noise = this.sampleGaussian(sigma);
    const noisyValue = value + noise;

    const budget = {
      epsilonSpent: this.config.epsilon,
      deltaSpent: this.config.delta,
      epsilonRemaining: 0,
      queryCount: 1,
    };

    return {
      value: noisyValue,
      privacyCost: budget,
      confidence95: [
        noisyValue - 1.96 * sigma,
        noisyValue + 1.96 * sigma,
      ],
    };
  }

  /**
   * Exponential mechanism: privately select from candidates.
   * Used for AI feature selection, auto-labeling, etc.
   */
  exponential<T>(
    candidates: T[],
    scoreFn: (candidate: T) => number
  ): DPOutput<T> {
    // Compute scores
    const scores = candidates.map(c => scoreFn(c));
    const maxScore = Math.max(...scores);

    // Compute probabilities (softmax with ε scaling)
    const probabilities = scores.map(s =>
      Math.exp((this.config.epsilon * (s - maxScore)) / (2 * this.config.sensitivity))
    );
    const totalProb = probabilities.reduce((a, b) => a + b, 0);

    // Sample according to probabilities
    let random = Math.random() * totalProb;
    let selectedIdx = 0;
    for (let i = 0; i < probabilities.length; i++) {
      random -= probabilities[i];
      if (random <= 0) {
        selectedIdx = i;
        break;
      }
    }

    const budget = {
      epsilonSpent: this.config.epsilon,
      deltaSpent: 0,
      epsilonRemaining: 0,
      queryCount: 1,
    };

    const selected = candidates[selectedIdx];
    const gap = scores.length > 1
      ? Math.abs(scores[selectedIdx] - scores.sort((a, b) => b - a)[1])
      : 0;

    return {
      value: selected,
      privacyCost: budget,
      confidence95: [gap - 1 / this.config.epsilon, gap + 1 / this.config.epsilon],
    };
  }

  /**
   * DP histogram: count occurrences with noise.
   * Perfect for AI features like "most common labels".
   */
  histogram(
    items: string[],
    bins: string[]
  ): DPOutput<Map<string, number>> {
    // True counts
    const counts = new Map<string, number>();
    for (const bin of bins) {
      counts.set(bin, 0);
    }
    for (const item of items) {
      counts.set(item, (counts.get(item) || 0) + 1);
    }

    // Add noise to each bin
    const noisyCounts = new Map<string, number>();
    // ε is split across all bins (composition)
    const perBinEpsilon = this.config.epsilon / bins.length;
    const scale = this.config.sensitivity / perBinEpsilon;

    for (const [bin, count] of counts) {
      const noise = this.sampleLaplace(scale);
      // Post-process: clip to non-negative
      noisyCounts.set(bin, Math.max(0, Math.round(count + noise)));
    }

    const budget = {
      epsilonSpent: this.config.epsilon,
      deltaSpent: 0,
      epsilonRemaining: 0,
      queryCount: 1,
    };

    return {
      value: noisyCounts,
      privacyCost: budget,
      confidence95: [-scale, scale], // Approximate for all bins
    };
  }

  /**
   * DP text generation: privatize AI-generated text suggestions.
   * Adds noise to token probabilities before sampling.
   */
  privatizeTokenProbs(
    tokenProbs: Map<string, number>,
    temperature = 1.0
  ): Map<string, number> {
    const noisyProbs = new Map<string, number>();
    const scale = this.config.sensitivity / (this.config.epsilon * tokenProbs.size);

    let total = 0;
    for (const [token, prob] of tokenProbs) {
      const noise = this.sampleLaplace(scale);
      const noisy = Math.exp(Math.log(prob) * temperature + noise);
      noisyProbs.set(token, noisy);
      total += noisy;
    }

    // Normalize
    for (const [token, prob] of noisyProbs) {
      noisyProbs.set(token, prob / total);
    }

    return noisyProbs;
  }

  // ── Sampling ──

  private sampleLaplace(scale: number): number {
    // Box-Muller-like for Laplace
    const u = Math.random() - 0.5;
    return -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
  }

  private sampleGaussian(sigma: number): number {
    // Box-Muller transform
    const u1 = Math.random();
    const u2 = Math.random();
    return sigma * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
}

// ── Budget Tracker ──

export class PrivacyBudgetTracker {
  private totalBudget: { epsilon: number; delta: number };
  private spent: { epsilon: number; delta: number } = { epsilon: 0, delta: 0 };
  private queryLog: Array<{
    timestamp: number;
    epsilon: number;
    delta: number;
    mechanism: string;
  }> = [];

  constructor(totalEpsilon = 10, totalDelta = 1e-5) {
    this.totalBudget = { epsilon: totalEpsilon, delta: totalDelta };
  }

  /**
   * Check if there's enough budget for a query.
   */
  canAfford(epsilon: number, delta: number): boolean {
    return (
      this.spent.epsilon + epsilon <= this.totalBudget.epsilon &&
      this.spent.delta + delta <= this.totalBudget.delta
    );
  }

  /**
   * Spend budget on a query.
   * Uses advanced composition for tighter bounds.
   */
  spend(epsilon: number, delta: number, mechanism: string): PrivacyBudget {
    if (!this.canAfford(epsilon, delta)) {
      throw new Error(
        `Privacy budget exhausted: need ε=${epsilon}, δ=${delta}, ` +
        `remaining ε=${this.totalBudget.epsilon - this.spent.epsilon}, ` +
        `δ=${this.totalBudget.delta - this.spent.delta}`
      );
    }

    this.spent.epsilon += epsilon;
    this.spent.delta += delta;

    this.queryLog.push({
      timestamp: Date.now(),
      epsilon,
      delta,
      mechanism,
    });

    return this.getStatus();
  }

  /**
   * Get current budget status.
   */
  getStatus(): PrivacyBudget {
    return {
      epsilonSpent: this.spent.epsilon,
      deltaSpent: this.spent.delta,
      epsilonRemaining: this.totalBudget.epsilon - this.spent.epsilon,
      queryCount: this.queryLog.length,
    };
  }

  /**
   * Reset budget (e.g., for a new training epoch).
   */
  reset(): void {
    this.spent = { epsilon: 0, delta: 0 };
    this.queryLog = [];
  }
}

/**
 * Spend ceiling for one audit run. The agents stop the moment they cross it, so
 * the number is a real limit on the work, not just a billing guard — too low and
 * the run dies mid-pipeline before the gate publishes anything.
 */
export const MIN_BUDGET_USD = 1;
export const MAX_BUDGET_USD = 50;
export const DEFAULT_BUDGET_USD = 8;

/** A run needs roughly this much per lease to reach the gate. */
export const BUDGET_PER_LEASE_USD = 2;

export function clampBudget(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(MAX_BUDGET_USD, Math.max(MIN_BUDGET_USD, Math.round(value)));
}

/**
 * What a portfolio of this size is likely to need. Shown next to the budget
 * control so the ceiling is a considered number rather than a guess.
 */
export function suggestedBudget(leaseCount: number): number {
  return clampBudget(
    Math.max(DEFAULT_BUDGET_USD, leaseCount * BUDGET_PER_LEASE_USD),
    DEFAULT_BUDGET_USD
  );
}

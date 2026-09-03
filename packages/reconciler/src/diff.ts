/**
 * Desired vs Actual Diff Engine.
 *
 * Pure function: compares desired state from the Resolver against actual materialized
 * assignments in PostgreSQL to produce the minimal convergent diff.
 *
 * Principles:
 * P4 — Idempotency: computing and applying the diff twice produces zero changes on second pass.
 * P8 — Explainability: snapshots are preserved and attached to diff items.
 */

import type {
  DesiredAssignment,
  Decision,
  PolicyAssignment,
  PolicyCategoryId,
  PolicyId,
  ExplanationSnapshot,
  MatchedRuleSnapshot,
} from "@warp/domain";

/**
 * Actual materialized assignment loaded from database.
 */
export interface ActualAssignment {
  id: string;
  employeeId: string;
  policyId: string;
  policyName?: string;
  categoryId: string;
  categoryKey?: string;
  categoryName?: string;
  cardinality?: "ONE" | "MANY";
  sourceRuleId: string;
  sourceRuleVersion: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  explanationSnapshot: ExplanationSnapshot;
}

/**
 * Result of computing the diff between desired and actual state.
 */
export interface DiffResult {
  toAdd: Array<DesiredAssignment & { explanationSnapshot: ExplanationSnapshot }>;
  toRevoke: ActualAssignment[];
  toUpdate: Array<{
    actual: ActualAssignment;
    desired: DesiredAssignment;
    explanationSnapshot: ExplanationSnapshot;
  }>;
  unchanged: Array<{ actual: ActualAssignment; desired: DesiredAssignment }>;
  hasChanges: boolean;
  summary: {
    added: number;
    revoked: number;
    updated: number;
    unchanged: number;
  };
}

/**
 * Build an ExplanationSnapshot from a category's Decision.
 */
export function buildExplanationSnapshot(
  decision: Decision | undefined,
  evaluatedAt: string,
  targetPolicyId?: string,
): ExplanationSnapshot {
  if (!decision) {
    return {
      evaluatedAt,
      matchedRules: [],
      winner: null,
      reason: "Direct assignment",
    };
  }

  const matchedRules: MatchedRuleSnapshot[] = decision.candidates.map((c) => ({
    ruleId: c.ruleId,
    version: c.ruleVersion,
    priority: c.priority,
    matchedConditions: c.matchedConditions,
    outcome: c.outcome,
  }));

  // If a specific policy is targeted in a MANY category, find its matching candidate
  let winnerCandidate = decision.winner;
  if (targetPolicyId && decision.candidates.length > 0) {
    const candidateForPolicy = decision.candidates.find(
      (c) => c.policyId === targetPolicyId && c.outcome === "WINNER",
    );
    if (candidateForPolicy) {
      winnerCandidate = candidateForPolicy;
    }
  }

  const winner: MatchedRuleSnapshot | null = winnerCandidate
    ? {
        ruleId: winnerCandidate.ruleId,
        version: winnerCandidate.ruleVersion,
        priority: winnerCandidate.priority,
        matchedConditions: winnerCandidate.matchedConditions,
        outcome: winnerCandidate.outcome,
      }
    : null;

  return {
    evaluatedAt,
    matchedRules,
    winner,
    reason: decision.reason,
  };
}

/**
 * Compute the diff between desired policy state and actual database state.
 */
export function computeDiff(
  desiredAssignments: DesiredAssignment[],
  actualAssignments: ActualAssignment[],
  decisions: Decision[],
  at: string,
): DiffResult {
  const toAdd: DiffResult["toAdd"] = [];
  const toRevoke: DiffResult["toRevoke"] = [];
  const toUpdate: DiffResult["toUpdate"] = [];
  const unchanged: DiffResult["unchanged"] = [];

  // Map decisions by categoryId and categoryKey for rapid lookup
  const decisionMap = new Map<string, Decision>();
  for (const d of decisions) {
    decisionMap.set(d.categoryId, d);
    decisionMap.set(d.categoryKey, d);
  }

  // Group desired assignments by categoryId
  const desiredByCategory = new Map<string, DesiredAssignment[]>();
  for (const d of desiredAssignments) {
    if (!desiredByCategory.has(d.categoryId)) {
      desiredByCategory.set(d.categoryId, []);
    }
    desiredByCategory.get(d.categoryId)!.push(d);
  }

  // Group actual assignments by categoryId
  const actualByCategory = new Map<string, ActualAssignment[]>();
  for (const a of actualAssignments) {
    if (!actualByCategory.has(a.categoryId)) {
      actualByCategory.set(a.categoryId, []);
    }
    actualByCategory.get(a.categoryId)!.push(a);
  }

  // Collect all category IDs present in either desired or actual
  const allCategoryIds = new Set([
    ...Array.from(desiredByCategory.keys()),
    ...Array.from(actualByCategory.keys()),
  ]);

  for (const catId of allCategoryIds) {
    const desiredList = desiredByCategory.get(catId) ?? [];
    const actualList = actualByCategory.get(catId) ?? [];
    const decision = decisionMap.get(catId);

    // Map actuals by policyId
    const actualByPolicy = new Map<string, ActualAssignment>();
    for (const a of actualList) {
      actualByPolicy.set(a.policyId, a);
    }

    // Map desired by policyId
    const desiredByPolicy = new Map<string, DesiredAssignment>();
    for (const d of desiredList) {
      desiredByPolicy.set(d.policyId, d);
    }

    // 1. Check for actual assignments that are no longer desired -> toRevoke
    for (const actual of actualList) {
      if (!desiredByPolicy.has(actual.policyId)) {
        toRevoke.push(actual);
      }
    }

    // 2. Check for desired assignments -> toAdd, toUpdate, or unchanged
    for (const desired of desiredList) {
      const actual = actualByPolicy.get(desired.policyId);
      const snapshot = buildExplanationSnapshot(decision, at, desired.policyId);

      if (!actual) {
        // Not currently assigned -> toAdd
        toAdd.push({
          ...desired,
          explanationSnapshot: snapshot,
        });
      } else {
        // Policy is already assigned. Check if rule version or ruleId changed
        const versionChanged =
          actual.sourceRuleId !== desired.sourceRuleId ||
          actual.sourceRuleVersion !== desired.sourceRuleVersion;

        if (versionChanged) {
          toUpdate.push({
            actual,
            desired,
            explanationSnapshot: snapshot,
          });
        } else {
          unchanged.push({ actual, desired });
        }
      }
    }
  }

  const hasChanges = toAdd.length > 0 || toRevoke.length > 0 || toUpdate.length > 0;

  return {
    toAdd,
    toRevoke,
    toUpdate,
    unchanged,
    hasChanges,
    summary: {
      added: toAdd.length,
      revoked: toRevoke.length,
      updated: toUpdate.length,
      unchanged: unchanged.length,
    },
  };
}

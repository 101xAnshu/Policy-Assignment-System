/**
 * Unit tests for the Pure Diff Engine.
 * Build Spec §21.
 *
 * Invariants:
 * - Adding new desired policies produces toAdd.
 * - Obsolete actual policies produce toRevoke.
 * - Version/rule changes produce toUpdate.
 * - Identical states produce unchanged with hasChanges: false.
 */

import { describe, it, expect } from "vitest";
import { computeDiff, buildExplanationSnapshot } from "@warp/reconciler";
import type { DesiredAssignment, Decision } from "@warp/domain";
import type { ActualAssignment } from "@warp/reconciler";

describe("computeDiff", () => {
  const sampleDecision: Decision = {
    categoryId: "cat-vac" as any,
    categoryKey: "vacation",
    status: "ASSIGNED",
    candidates: [
      {
        ruleId: "r-ca-vac" as any,
        ruleVersion: 1,
        policyId: "p-ca-vac" as any,
        policyName: "CA Vacation",
        priority: 50,
        matchedConditions: ["state = California"],
        outcome: "WINNER",
      },
    ],
    winner: {
      ruleId: "r-ca-vac" as any,
      ruleVersion: 1,
      policyId: "p-ca-vac" as any,
      policyName: "CA Vacation",
      priority: 50,
      matchedConditions: ["state = California"],
      outcome: "WINNER",
    },
    reason: "Priority 50 won",
  };

  it("produces toAdd when actual state is empty", () => {
    const desired: DesiredAssignment[] = [
      {
        employeeId: "e-001" as any,
        policyId: "p-ca-vac" as any,
        categoryId: "cat-vac" as any,
        sourceRuleId: "r-ca-vac" as any,
        sourceRuleVersion: 1,
        effectiveFrom: "2024-08-28",
      },
    ];

    const actual: ActualAssignment[] = [];
    const diff = computeDiff(desired, actual, [sampleDecision], "2024-08-28");

    expect(diff.hasChanges).toBe(true);
    expect(diff.toAdd).toHaveLength(1);
    expect(diff.toRevoke).toHaveLength(0);
    expect(diff.toUpdate).toHaveLength(0);
    expect(diff.unchanged).toHaveLength(0);
    expect(diff.toAdd[0].policyId).toBe("p-ca-vac");
    expect(diff.toAdd[0].explanationSnapshot.reason).toBe("Priority 50 won");
  });

  it("produces unchanged and hasChanges: false when desired matches actual identically", () => {
    const desired: DesiredAssignment[] = [
      {
        employeeId: "e-001" as any,
        policyId: "p-ca-vac" as any,
        categoryId: "cat-vac" as any,
        sourceRuleId: "r-ca-vac" as any,
        sourceRuleVersion: 1,
        effectiveFrom: "2024-08-28",
      },
    ];

    const actual: ActualAssignment[] = [
      {
        id: "a-001",
        employeeId: "e-001",
        policyId: "p-ca-vac",
        categoryId: "cat-vac",
        sourceRuleId: "r-ca-vac",
        sourceRuleVersion: 1,
        effectiveFrom: "2024-08-28",
        effectiveTo: null,
        explanationSnapshot: {
          evaluatedAt: "2024-08-28",
          matchedRules: [],
          winner: null,
          reason: "Initial",
        },
      },
    ];

    const diff = computeDiff(desired, actual, [sampleDecision], "2024-08-28");

    expect(diff.hasChanges).toBe(false);
    expect(diff.toAdd).toHaveLength(0);
    expect(diff.toRevoke).toHaveLength(0);
    expect(diff.toUpdate).toHaveLength(0);
    expect(diff.unchanged).toHaveLength(1);
  });

  it("produces toRevoke when an actual policy is no longer desired", () => {
    const desired: DesiredAssignment[] = [];

    const actual: ActualAssignment[] = [
      {
        id: "a-001",
        employeeId: "e-001",
        policyId: "p-old-policy",
        categoryId: "cat-vac",
        sourceRuleId: "r-old",
        sourceRuleVersion: 1,
        effectiveFrom: "2024-01-01",
        effectiveTo: null,
        explanationSnapshot: {
          evaluatedAt: "2024-01-01",
          matchedRules: [],
          winner: null,
          reason: "Old",
        },
      },
    ];

    const diff = computeDiff(desired, actual, [], "2024-08-28");

    expect(diff.hasChanges).toBe(true);
    expect(diff.toRevoke).toHaveLength(1);
    expect(diff.toRevoke[0].policyId).toBe("p-old-policy");
  });

  it("handles ONE category policy swap (revoke old, add new)", () => {
    // CA Vacation replaced by Extended Vacation
    const desired: DesiredAssignment[] = [
      {
        employeeId: "e-001" as any,
        policyId: "p-ext-vac" as any,
        categoryId: "cat-vac" as any,
        sourceRuleId: "r-ext-vac" as any,
        sourceRuleVersion: 1,
        effectiveFrom: "2026-08-28",
      },
    ];

    const actual: ActualAssignment[] = [
      {
        id: "a-001",
        employeeId: "e-001",
        policyId: "p-ca-vac",
        categoryId: "cat-vac",
        sourceRuleId: "r-ca-vac",
        sourceRuleVersion: 1,
        effectiveFrom: "2024-08-28",
        effectiveTo: null,
        explanationSnapshot: {
          evaluatedAt: "2024-08-28",
          matchedRules: [],
          winner: null,
          reason: "Initial",
        },
      },
    ];

    const diff = computeDiff(desired, actual, [sampleDecision], "2026-08-28");

    expect(diff.hasChanges).toBe(true);
    expect(diff.toRevoke).toHaveLength(1);
    expect(diff.toRevoke[0].policyId).toBe("p-ca-vac");
    expect(diff.toAdd).toHaveLength(1);
    expect(diff.toAdd[0].policyId).toBe("p-ext-vac");
  });

  it("produces toUpdate when rule version changes on the same policy", () => {
    const desired: DesiredAssignment[] = [
      {
        employeeId: "e-001" as any,
        policyId: "p-ca-vac" as any,
        categoryId: "cat-vac" as any,
        sourceRuleId: "r-ca-vac" as any,
        sourceRuleVersion: 2, // Version bumped from 1 to 2
        effectiveFrom: "2025-01-01",
      },
    ];

    const actual: ActualAssignment[] = [
      {
        id: "a-001",
        employeeId: "e-001",
        policyId: "p-ca-vac",
        categoryId: "cat-vac",
        sourceRuleId: "r-ca-vac",
        sourceRuleVersion: 1,
        effectiveFrom: "2024-08-28",
        effectiveTo: null,
        explanationSnapshot: {
          evaluatedAt: "2024-08-28",
          matchedRules: [],
          winner: null,
          reason: "V1",
        },
      },
    ];

    const diff = computeDiff(desired, actual, [sampleDecision], "2025-01-01");

    expect(diff.hasChanges).toBe(true);
    expect(diff.toUpdate).toHaveLength(1);
    expect(diff.toUpdate[0].actual.sourceRuleVersion).toBe(1);
    expect(diff.toUpdate[0].desired.sourceRuleVersion).toBe(2);
  });
});

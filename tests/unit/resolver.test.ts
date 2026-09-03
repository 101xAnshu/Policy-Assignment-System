/**
 * Unit tests for the Deterministic Resolver.
 *
 * Invariants tested:
 * - Determinism: Shuffled rule input order produces identical results.
 * - Conflict resolution: Higher priority wins in ONE category.
 * - Ambiguity: Equal priority rules assigning conflicting policies flag AMBIGUOUS.
 * - Deduplication: Equal priority rules assigning the same policy produce a single assignment.
 * - Cardinality: MANY category assigns all matching policies.
 * - Temporal validity: Half-open intervals [effectiveFrom, effectiveTo).
 * - Reference Equivalence: resolve == referenceResolver.
 */

import { describe, it, expect } from "vitest";
import { resolve, referenceResolver, isRuleActiveAt } from "@warp/resolver";
import type { EvaluatableRule } from "@warp/resolver";
import type { EmployeeContext } from "@warp/domain";

// ─── Test Fixtures ───────────────────────────────────────────────────────────

const sarahContext: EmployeeContext = {
  id: "e-sarah" as any,
  companyId: "c-acme" as any,
  country: "US",
  state: "California",
  department: "Engineering",
  employmentType: "FULL_TIME",
  isManager: true,
  hireDate: "2024-08-28",
  groupIds: ["g-managers" as any],
};

const sampleRules: EvaluatableRule[] = [
  // ONE Category: Vacation
  {
    ruleId: "r-std-vac" as any,
    ruleVersionId: "rv-std-vac" as any,
    version: 1,
    policyId: "p-std-vac" as any,
    policyName: "Standard Vacation",
    categoryId: "cat-vac" as any,
    categoryKey: "vacation",
    categoryName: "Vacation",
    cardinality: "ONE",
    predicate: { type: "EQUALS", field: "employmentType", value: "FULL_TIME" },
    priority: 10,
    effectiveFrom: "2024-01-01",
    effectiveTo: null,
  },
  {
    ruleId: "r-ca-vac" as any,
    ruleVersionId: "rv-ca-vac" as any,
    version: 1,
    policyId: "p-ca-vac" as any,
    policyName: "California Vacation",
    categoryId: "cat-vac" as any,
    categoryKey: "vacation",
    categoryName: "Vacation",
    cardinality: "ONE",
    predicate: {
      type: "ALL",
      children: [
        { type: "EQUALS", field: "state", value: "California" },
        { type: "EQUALS", field: "employmentType", value: "FULL_TIME" },
      ],
    },
    priority: 50,
    effectiveFrom: "2024-01-01",
    effectiveTo: null,
  },
  {
    ruleId: "r-ext-vac" as any,
    ruleVersionId: "rv-ext-vac" as any,
    version: 1,
    policyId: "p-ext-vac" as any,
    policyName: "Extended Vacation",
    categoryId: "cat-vac" as any,
    categoryKey: "vacation",
    categoryName: "Vacation",
    cardinality: "ONE",
    predicate: {
      type: "ALL",
      children: [
        { type: "TENURE_AT_LEAST", durationMonths: 24 },
        { type: "EQUALS", field: "employmentType", value: "FULL_TIME" },
      ],
    },
    priority: 60,
    effectiveFrom: "2024-01-01",
    effectiveTo: null,
  },
  // ONE Category: Sick Leave
  {
    ruleId: "r-std-sick" as any,
    ruleVersionId: "rv-std-sick" as any,
    version: 1,
    policyId: "p-std-sick" as any,
    policyName: "Standard Sick",
    categoryId: "cat-sick" as any,
    categoryKey: "sick_leave",
    categoryName: "Sick Leave",
    cardinality: "ONE",
    predicate: { type: "ALL", children: [] },
    priority: 50,
    effectiveFrom: "2024-01-01",
    effectiveTo: null,
  },
  // MANY Category: Application Access
  {
    ruleId: "r-slack" as any,
    ruleVersionId: "rv-slack" as any,
    version: 1,
    policyId: "p-slack" as any,
    policyName: "Slack",
    categoryId: "cat-apps" as any,
    categoryKey: "app_access",
    categoryName: "Application Access",
    cardinality: "MANY",
    predicate: { type: "ALL", children: [] },
    priority: 50,
    effectiveFrom: "2024-01-01",
    effectiveTo: null,
  },
  {
    ruleId: "r-github" as any,
    ruleVersionId: "rv-github" as any,
    version: 1,
    policyId: "p-github" as any,
    policyName: "GitHub",
    categoryId: "cat-apps" as any,
    categoryKey: "app_access",
    categoryName: "Application Access",
    cardinality: "MANY",
    predicate: { type: "EQUALS", field: "department", value: "Engineering" },
    priority: 50,
    effectiveFrom: "2024-01-01",
    effectiveTo: null,
  },
];

// ─── Deterministic Resolution Tests ──────────────────────────────────────────

describe("Deterministic Resolver", () => {
  it("resolves CA Vacation (50) over Standard Vacation (10) for Sarah on hire date", () => {
    const result = resolve(sarahContext, sampleRules, "2024-08-28");

    // Sarah matches Standard Vacation (10) and CA Vacation (50). CA Vacation wins!
    const vacAssignment = result.assignments.find(
      (a) => a.categoryId === ("cat-vac" as any),
    );
    expect(vacAssignment).toBeDefined();
    expect(vacAssignment?.policyId).toBe("p-ca-vac");
    expect(vacAssignment?.sourceRuleId).toBe("r-ca-vac");

    // Decision explanation
    const vacDecision = result.decisions.find((d) => d.categoryKey === "vacation");
    expect(vacDecision?.status).toBe("ASSIGNED");
    expect(vacDecision?.winner?.policyId).toBe("p-ca-vac");
    expect(vacDecision?.candidates).toHaveLength(2);

    const winner = vacDecision?.candidates.find((c) => c.policyId === "p-ca-vac");
    expect(winner?.outcome).toBe("WINNER");

    const overridden = vacDecision?.candidates.find((c) => c.policyId === "p-std-vac");
    expect(overridden?.outcome).toBe("OVERRIDDEN");
  });

  it("resolves Extended Vacation (60) for Sarah on 2026-08-28 after hitting 2-year tenure threshold", () => {
    const result = resolve(sarahContext, sampleRules, "2026-08-28");

    const vacAssignment = result.assignments.find(
      (a) => a.categoryId === ("cat-vac" as any),
    );
    expect(vacAssignment).toBeDefined();
    expect(vacAssignment?.policyId).toBe("p-ext-vac");
    expect(vacAssignment?.sourceRuleId).toBe("r-ext-vac");

    const vacDecision = result.decisions.find((d) => d.categoryKey === "vacation");
    expect(vacDecision?.candidates).toHaveLength(3);
    expect(vacDecision?.winner?.policyId).toBe("p-ext-vac");
  });

  it("resolves all matching policies in MANY categories", () => {
    const result = resolve(sarahContext, sampleRules, "2024-08-28");

    const appAssignments = result.assignments.filter(
      (a) => a.categoryId === ("cat-apps" as any),
    );
    expect(appAssignments).toHaveLength(2);
    expect(appAssignments.map((a) => a.policyId)).toEqual(
      expect.arrayContaining(["p-slack", "p-github"]),
    );
  });

  it("deduplicates multiple matching rules pointing to the same policy in MANY category", () => {
    const rulesWithDuplicate: EvaluatableRule[] = [
      ...sampleRules,
      {
        ruleId: "r-slack-override" as any,
        ruleVersionId: "rv-slack-override" as any,
        version: 1,
        policyId: "p-slack" as any,
        policyName: "Slack",
        categoryId: "cat-apps" as any,
        categoryKey: "app_access",
        categoryName: "Application Access",
        cardinality: "MANY",
        predicate: { type: "EQUALS", field: "department", value: "Engineering" },
        priority: 70,
        effectiveFrom: "2024-01-01",
        effectiveTo: null,
      },
    ];

    const result = resolve(sarahContext, rulesWithDuplicate, "2024-08-28");

    const slackAssignments = result.assignments.filter(
      (a) => a.policyId === ("p-slack" as any),
    );
    // Should be deduplicated to exactly 1 Slack assignment
    expect(slackAssignments).toHaveLength(1);
  });

  it("flags AMBIGUOUS in ONE category when equal-priority rules assign different policies", () => {
    const ambiguousRules: EvaluatableRule[] = [
      {
        ruleId: "r-vac-a" as any,
        ruleVersionId: "rv-vac-a" as any,
        version: 1,
        policyId: "p-vac-a" as any,
        policyName: "Vacation Plan A",
        categoryId: "cat-vac" as any,
        categoryKey: "vacation",
        categoryName: "Vacation",
        cardinality: "ONE",
        predicate: { type: "EQUALS", field: "country", value: "US" },
        priority: 50, // equal priority
        effectiveFrom: "2024-01-01",
        effectiveTo: null,
      },
      {
        ruleId: "r-vac-b" as any,
        ruleVersionId: "rv-vac-b" as any,
        version: 1,
        policyId: "p-vac-b" as any,
        policyName: "Vacation Plan B",
        categoryId: "cat-vac" as any,
        categoryKey: "vacation",
        categoryName: "Vacation",
        cardinality: "ONE",
        predicate: { type: "EQUALS", field: "department", value: "Engineering" },
        priority: 50, // equal priority
        effectiveFrom: "2024-01-01",
        effectiveTo: null,
      },
    ];

    const result = resolve(sarahContext, ambiguousRules, "2024-08-28");

    const vacAssignment = result.assignments.find(
      (a) => a.categoryId === ("cat-vac" as any),
    );
    // No silent arbitrary winner should be chosen
    expect(vacAssignment).toBeUndefined();

    const vacDecision = result.decisions.find((d) => d.categoryKey === "vacation");
    expect(vacDecision?.status).toBe("AMBIGUOUS");
    expect(vacDecision?.winner).toBeNull();
    expect(vacDecision?.candidates.every((c) => c.outcome === "TIED")).toBe(true);
    expect(vacDecision?.reason).toContain("Conflict");
  });

  it("is strictly deterministic across 50 random input permutations", () => {
    const baseResult = resolve(sarahContext, sampleRules, "2024-08-28");

    for (let i = 0; i < 50; i++) {
      // Shuffle rules randomly
      const shuffled = [...sampleRules].sort(() => Math.random() - 0.5);
      const shuffledResult = resolve(sarahContext, shuffled, "2024-08-28");

      expect(shuffledResult.assignments).toEqual(baseResult.assignments);
      expect(shuffledResult.decisions.map((d) => d.status)).toEqual(
        baseResult.decisions.map((d) => d.status),
      );
    }
  });

  it("matches referenceResolver output exactly", () => {
    const prodResult = resolve(sarahContext, sampleRules, "2024-08-28");
    const refResult = referenceResolver(sarahContext, sampleRules, "2024-08-28");

    expect(prodResult).toEqual(refResult);
  });
});

// ─── Temporal Half-Open Interval Semantics ─────────────────────────────

describe("Temporal Half-Open Intervals [effectiveFrom, effectiveTo)", () => {
  const rule: EvaluatableRule = {
    ruleId: "r-temp" as any,
    ruleVersionId: "rv-temp" as any,
    version: 1,
    policyId: "p-temp" as any,
    policyName: "Temp Policy",
    categoryId: "cat-temp" as any,
    categoryKey: "temp",
    categoryName: "Temp",
    cardinality: "ONE",
    predicate: { type: "ALL", children: [] },
    priority: 10,
    effectiveFrom: "2025-06-01",
    effectiveTo: "2025-09-01",
  };

  it("is inactive before effectiveFrom (2025-05-31)", () => {
    expect(isRuleActiveAt(rule, "2025-05-31")).toBe(false);
  });

  it("is active on exact effectiveFrom boundary (2025-06-01)", () => {
    expect(isRuleActiveAt(rule, "2025-06-01")).toBe(true);
  });

  it("is active inside the interval (2025-07-15)", () => {
    expect(isRuleActiveAt(rule, "2025-07-15")).toBe(true);
  });

  it("is active on the last included day (2025-08-31)", () => {
    expect(isRuleActiveAt(rule, "2025-08-31")).toBe(true);
  });

  it("is inactive on exact effectiveTo boundary (2025-09-01) - half-open interval", () => {
    expect(isRuleActiveAt(rule, "2025-09-01")).toBe(false);
  });

  it("is inactive after effectiveTo (2025-09-02)", () => {
    expect(isRuleActiveAt(rule, "2025-09-02")).toBe(false);
  });
});

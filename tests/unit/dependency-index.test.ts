/**
 * Unit tests for In-Memory Dependency Index.
 *
 * Invariants:
 * - Attribute indexing maps field names to rule IDs and categories.
 * - Group membership indexing maps group IDs to rule IDs and categories.
 * - Temporal indexing maps tenure rules to categories.
 * - Unrelated attributes (e.g. "email", "name") produce zero affected categories.
 */

import { describe, it, expect } from "vitest";
import { buildDependencyIndex } from "@warp/reconciler";
import type { EvaluatableRule } from "@warp/resolver";

const sampleRules: EvaluatableRule[] = [
  // Vacation rules
  {
    ruleId: "r-std-vac" as any,
    ruleVersionId: "rv-1" as any,
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
    ruleVersionId: "rv-2" as any,
    version: 1,
    policyId: "p-ca-vac" as any,
    policyName: "CA Vacation",
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
    ruleVersionId: "rv-3" as any,
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
  // Training rules
  {
    ruleId: "r-ca-train" as any,
    ruleVersionId: "rv-4" as any,
    version: 1,
    policyId: "p-ca-train" as any,
    policyName: "CA Training",
    categoryId: "cat-train" as any,
    categoryKey: "compliance_training",
    categoryName: "Compliance Training",
    cardinality: "MANY",
    predicate: { type: "EQUALS", field: "state", value: "California" },
    priority: 50,
    effectiveFrom: "2024-01-01",
    effectiveTo: null,
  },
  {
    ruleId: "r-mgr-train" as any,
    ruleVersionId: "rv-5" as any,
    version: 1,
    policyId: "p-mgr-train" as any,
    policyName: "Manager Training",
    categoryId: "cat-train" as any,
    categoryKey: "compliance_training",
    categoryName: "Compliance Training",
    cardinality: "MANY",
    predicate: { type: "GROUP_MEMBER", groupId: "g-managers" as any },
    priority: 50,
    effectiveFrom: "2024-01-01",
    effectiveTo: null,
  },
  // App Access rule
  {
    ruleId: "r-github" as any,
    ruleVersionId: "rv-6" as any,
    version: 1,
    policyId: "p-github" as any,
    policyName: "GitHub",
    categoryId: "cat-apps" as any,
    categoryKey: "app_access",
    categoryName: "App Access",
    cardinality: "MANY",
    predicate: { type: "EQUALS", field: "department", value: "Engineering" },
    priority: 50,
    effectiveFrom: "2024-01-01",
    effectiveTo: null,
  },
];

describe("DependencyIndex", () => {
  const index = buildDependencyIndex(sampleRules);

  it("finds affected categories when 'state' attribute changes", () => {
    const affected = index.getAffectedCategoriesForAttributes(["state"]);

    // Rules depending on state: r-ca-vac (cat-vac) and r-ca-train (cat-train)
    expect(affected.size).toBe(2);
    expect(affected.has("cat-vac")).toBe(true);
    expect(affected.has("cat-train")).toBe(true);
    expect(affected.has("cat-apps")).toBe(false); // cat-apps does not depend on state
  });

  it("finds affected categories when 'department' attribute changes", () => {
    const affected = index.getAffectedCategoriesForAttributes(["department"]);

    expect(affected.size).toBe(1);
    expect(affected.has("cat-apps")).toBe(true);
    expect(affected.has("cat-vac")).toBe(false);
  });

  it("returns empty set when non-predicate attributes change (e.g. email, name)", () => {
    const affected = index.getAffectedCategoriesForAttributes(["email", "name"]);
    expect(affected.size).toBe(0);
  });

  it("finds affected categories for group membership changes", () => {
    const affected = index.getAffectedCategoriesForGroup("g-managers");

    expect(affected.size).toBe(1);
    expect(affected.has("cat-train")).toBe(true);
    expect(affected.has("cat-vac")).toBe(false);
  });

  it("finds temporal categories containing tenure predicates", () => {
    const temporal = index.getTemporalCategories();

    expect(temporal.size).toBe(1);
    expect(temporal.has("cat-vac")).toBe(true);
  });

  it("correctly identifies whether an individual rule is affected by field updates", () => {
    expect(index.isRuleAffectedByAttributes("r-ca-vac", ["state"])).toBe(true);
    expect(index.isRuleAffectedByAttributes("r-ca-vac", ["department"])).toBe(false);
    expect(index.isRuleAffectedByAttributes("r-github", ["department"])).toBe(true);
  });
});

/**
 * Property-Based Testing Suite with fast-check.
 * Build Spec §38, §39.
 *
 * Mathematically verifies core invariant properties:
 * 1. Determinism across all arbitrary rule evaluation permutations.
 * 2. Cardinality invariants (cardinality ONE returns <= 1 policy or AMBIGUOUS).
 * 3. Priority invariants (highest priority rule candidate always selected).
 * 4. Production resolver vs Reference resolver exact equivalence.
 * 5. Reconciler pure diff convergence and mathematical idempotency.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { resolve, referenceResolver, type EvaluatableRule } from "@warp/resolver";
import { computeDiff, type ActualAssignment } from "@warp/reconciler";
import type {
  EmployeeContext,
  Predicate,
} from "@warp/domain";

// ─── Consistent Category Definitions ────────────────────────────────────────

const CATEGORY_SCHEMAS = [
  { id: "cat-vac" as any, key: "vacation", name: "Vacation", cardinality: "ONE" as const },
  { id: "cat-equip" as any, key: "equipment", name: "Equipment", cardinality: "MANY" as const },
  { id: "cat-health" as any, key: "health", name: "Health", cardinality: "ONE" as const },
];

// ─── Arbitrary Generators ───────────────────────────────────────────────────

const arbEmployeeContext: fc.Arbitrary<EmployeeContext> = fc.record({
  id: fc.uuid() as any,
  companyId: fc.uuid() as any,
  name: fc.string({ minLength: 1, maxLength: 20 }),
  hireDate: fc.tuple(
    fc.integer({ min: 2020, max: 2024 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 28 }),
  ).map(([y, m, d]) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`),
  state: fc.oneof(fc.constant("California"), fc.constant("New York"), fc.constant("Texas"), fc.constant(null)),
  country: fc.oneof(fc.constant("US"), fc.constant("Canada"), fc.constant("UK")),
  department: fc.oneof(fc.constant("Engineering"), fc.constant("Sales"), fc.constant("HR"), fc.constant("Legal")),
  employmentType: fc.oneof(fc.constant("FULL_TIME" as const), fc.constant("PART_TIME" as const), fc.constant("CONTRACTOR" as const)),
  isManager: fc.boolean(),
  groupIds: fc.array(fc.uuid() as any, { maxLength: 3 }),
});

const arbEvaluatableRule: fc.Arbitrary<EvaluatableRule> = fc.tuple(
  fc.constantFrom(...CATEGORY_SCHEMAS),
  fc.stringMatching(/^r-[0-9a-f]{4}$/) as any,
  fc.stringMatching(/^rv-[0-9a-f]{4}$/) as any,
  fc.stringMatching(/^p-[0-9a-f]{4}$/) as any,
  fc.string({ minLength: 3, maxLength: 15 }),
  fc.oneof(
    fc.constant<Predicate>({ type: "ALL", children: [] }),
    fc.record<Predicate>({
      type: fc.constant("EQUALS"),
      field: fc.oneof(fc.constant("country"), fc.constant("department"), fc.constant("employmentType")),
      value: fc.oneof(fc.constant("US"), fc.constant("Engineering"), fc.constant("FULL_TIME")),
    }),
    fc.record<Predicate>({
      type: fc.constant("IS_MANAGER"),
      value: fc.boolean(),
    }),
  ),
  fc.integer({ min: 10, max: 100 }),
).map(([cat, ruleId, ruleVersionId, policyId, policyName, predicate, priority]) => ({
  ruleId,
  ruleVersionId,
  version: 1,
  policyId,
  policyName,
  categoryId: cat.id,
  categoryKey: cat.key,
  categoryName: cat.name,
  cardinality: cat.cardinality,
  predicate,
  priority,
  effectiveFrom: "2024-01-01",
  effectiveTo: null,
}));

const arbEvaluatableRules = fc.array(arbEvaluatableRule, { minLength: 1, maxLength: 8 });

// ─── Properties ─────────────────────────────────────────────────────────────

describe("Property-Based Invariant Verification (fast-check)", () => {
  it("Property 1: Determinism — Resolving policies is 100% order-invariant and deterministic", () => {
    fc.assert(
      fc.property(
        arbEmployeeContext,
        arbEvaluatableRules,
        (employee, rules) => {
          const at = "2024-08-28";
          const res1 = resolve(employee, rules, at);

          // Reverse/shuffle rule array
          const shuffledRules = [...rules].reverse();
          const res2 = resolve(employee, shuffledRules, at);

          // Category count and assignment output must match exactly
          expect(res1.assignments.length).toBe(res2.assignments.length);
          expect(res1.decisions.length).toBe(res2.decisions.length);

          for (let i = 0; i < res1.assignments.length; i++) {
            expect(res1.assignments[i].policyId).toBe(res2.assignments[i].policyId);
            expect(res1.assignments[i].categoryId).toBe(res2.assignments[i].categoryId);
          }

          for (let i = 0; i < res1.decisions.length; i++) {
            expect(res1.decisions[i].status).toBe(res2.decisions[i].status);
            expect(res1.decisions[i].winner?.policyId).toBe(res2.decisions[i].winner?.policyId);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 2: Cardinality Invariant — Cardinality ONE categories resolve at most 1 assignment unless AMBIGUOUS", () => {
    fc.assert(
      fc.property(
        arbEmployeeContext,
        arbEvaluatableRules,
        (employee, rules) => {
          const at = "2024-08-28";
          const res = resolve(employee, rules, at);

          for (const dec of res.decisions) {
            const catRule = rules.find((r) => r.categoryId === dec.categoryId);
            if (catRule && catRule.cardinality === "ONE") {
              if (dec.status === "ASSIGNED") {
                const catAssignments = res.assignments.filter((a) => a.categoryId === dec.categoryId);
                expect(catAssignments.length).toBe(1);
              } else if (dec.status === "AMBIGUOUS" || dec.status === "EMPTY") {
                const catAssignments = res.assignments.filter((a) => a.categoryId === dec.categoryId);
                expect(catAssignments.length).toBe(0);
              }
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 3: Priority Invariant — For ONE categories, winner is always from the highest priority match", () => {
    fc.assert(
      fc.property(
        arbEmployeeContext,
        arbEvaluatableRules,
        (employee, rules) => {
          const at = "2024-08-28";
          const res = resolve(employee, rules, at);

          for (const dec of res.decisions) {
            const catRule = rules.find((r) => r.categoryId === dec.categoryId);
            if (catRule && catRule.cardinality === "ONE" && dec.status === "ASSIGNED" && dec.winner) {
              const matchedCandidates = dec.candidates.filter((c) => c.outcome === "WINNER" || c.outcome === "OVERRIDDEN");
              const maxCandidatePriority = Math.max(...matchedCandidates.map((c) => c.priority));
              expect(dec.winner.priority).toBe(maxCandidatePriority);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 4: Reference Resolver Equivalence — Production resolve matches referenceResolver exactly", () => {
    fc.assert(
      fc.property(
        arbEmployeeContext,
        arbEvaluatableRules,
        (employee, rules) => {
          const at = "2024-08-28";
          const prod = resolve(employee, rules, at);
          const ref = referenceResolver(employee, rules, at);

          expect(prod.assignments.length).toBe(ref.assignments.length);
          expect(prod.decisions.length).toBe(ref.decisions.length);

          for (let i = 0; i < prod.assignments.length; i++) {
            expect(prod.assignments[i].policyId).toBe(ref.assignments[i].policyId);
            expect(prod.assignments[i].categoryId).toBe(ref.assignments[i].categoryId);
          }

          for (let i = 0; i < prod.decisions.length; i++) {
            expect(prod.decisions[i].status).toBe(ref.decisions[i].status);
            expect(prod.decisions[i].winner?.policyId).toBe(ref.decisions[i].winner?.policyId);
          }
        },
      ),
      { numRuns: 150 },
    );
  });

  it("Property 5: Pure Diff Convergence & Idempotency — Re-diffing converged state produces zero changes", () => {
    fc.assert(
      fc.property(
        arbEmployeeContext,
        arbEvaluatableRules,
        (employee, rules) => {
          const at = "2024-08-28";
          const res = resolve(employee, rules, at);

          // Initial diff against empty
          const diff1 = computeDiff(res.assignments, [], res.decisions, at);
          expect(diff1.toAdd.length).toBe(res.assignments.length);

          // Simulated converged assignments state
          const convergedActual: ActualAssignment[] = diff1.toAdd.map((item, idx) => ({
            id: `asgn-${idx}`,
            employeeId: item.employeeId,
            policyId: item.policyId,
            categoryId: item.categoryId,
            sourceRuleId: item.sourceRuleId,
            sourceRuleVersion: item.sourceRuleVersion,
            effectiveFrom: item.effectiveFrom,
            effectiveTo: null,
            explanationSnapshot: item.explanationSnapshot,
          }));

          // Re-diff on converged state
          const diff2 = computeDiff(res.assignments, convergedActual, res.decisions, at);
          expect(diff2.toAdd.length).toBe(0);
          expect(diff2.toRevoke.length).toBe(0);
          expect(diff2.toUpdate.length).toBe(0);
          expect(diff2.unchanged.length).toBe(res.assignments.length);
          expect(diff2.hasChanges).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});

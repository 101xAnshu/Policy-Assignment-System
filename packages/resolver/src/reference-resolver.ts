/**
 * Independent Reference Resolver.
 * Build Spec §38, §39.
 *
 * A deliberately simple, unoptimized, clean-room brute-force evaluator.
 * It does NOT use the production resolver, does NOT use dependency optimization,
 * and directly tests predicate logic from foundational mathematical definitions.
 *
 * Used as the trusted oracle in property-based testing (§39) and verification (§41)
 * to prove that the production resolver and incremental reconciliation are 100% sound.
 */

import type {
  EmployeeContext,
  ResolutionResult,
  DesiredAssignment,
  Decision,
  CandidateDecision,
  PolicyCategoryId,
  PolicyId,
  AssignmentRuleId,
  Predicate,
} from "@warp/domain";
import type { EvaluatableRule } from "./types";

/**
 * Clean-room date formatter to YYYY-MM-DD.
 */
function toDateString(date: string | Date): string {
  if (typeof date === "string") {
    return date.split("T")[0];
  }
  return date.toISOString().split("T")[0];
}

/**
 * Calculate tenure in full calendar months with inclusive day-of-month math.
 * Build Spec §16: hire 2024-08-28 -> active at 2026-08-28 (24 months).
 */
function computeTenureMonths(hireDateStr: string, evalDateStr: string): number {
  const [hY, hM, hD] = hireDateStr.split("-").map(Number);
  const [eY, eM, eD] = evalDateStr.split("-").map(Number);
  let months = (eY - hY) * 12 + (eM - hM);
  if (eD < hD) {
    months -= 1;
  }
  return months;
}

/**
 * Independent brute-force predicate evaluator.
 */
function evalPredicateBruteForce(
  pred: Predicate,
  employee: EmployeeContext,
  at: string,
): { matches: boolean; conditions: string[] } {
  switch (pred.type) {
    case "ALL": {
      if (pred.children.length === 0) {
        return { matches: true, conditions: ["all employees"] };
      }
      const conditions: string[] = [];
      for (const child of pred.children) {
        const res = evalPredicateBruteForce(child, employee, at);
        if (!res.matches) {
          return { matches: false, conditions: [] };
        }
        conditions.push(...res.conditions);
      }
      return { matches: true, conditions };
    }

    case "EQUALS": {
      const fieldVal = (employee as any)[pred.field];
      const matches = fieldVal === pred.value;
      return {
        matches,
        conditions: matches ? [`${pred.field} = ${pred.value}`] : [],
      };
    }

    case "IS_MANAGER": {
      const matches = employee.isManager === pred.value;
      return {
        matches,
        conditions: matches ? [pred.value ? "is a manager" : "is not a manager"] : [],
      };
    }

    case "GROUP_MEMBER": {
      const matches = employee.groupIds.includes(pred.groupId as any);
      return {
        matches,
        conditions: matches ? [`member of group ${pred.groupId}`] : [],
      };
    }

    case "TENURE_AT_LEAST": {
      const tenure = computeTenureMonths(employee.hireDate, at);
      const matches = tenure >= pred.durationMonths;
      return {
        matches,
        conditions: matches ? [`tenure ≥ ${pred.durationMonths} months`] : [],
      };
    }

    default:
      return { matches: false, conditions: [] };
  }
}

/**
 * Pure brute-force reference resolver.
 * Evaluates every rule against the employee context independently.
 */
export function referenceResolver(
  employee: EmployeeContext,
  allRules: EvaluatableRule[],
  at: string | Date,
): ResolutionResult {
  const atDateStr = toDateString(at);

  // 1. Filter rules active at `at` using interval [effectiveFrom, effectiveTo)
  const activeRules = allRules.filter((r) => {
    if (r.effectiveFrom > atDateStr) return false;
    if (r.effectiveTo !== null && atDateStr >= r.effectiveTo) return false;
    return true;
  });

  // 2. Discover all distinct categories from input rules
  const categories = new Map<
    string,
    {
      key: string;
      name: string;
      cardinality: "ONE" | "MANY";
    }
  >();

  for (const r of allRules) {
    if (!categories.has(r.categoryId)) {
      categories.set(r.categoryId, {
        key: r.categoryKey,
        name: r.categoryName,
        cardinality: r.cardinality,
      });
    }
  }

  // 3. Brute-force match each active rule against employee
  interface Match {
    rule: EvaluatableRule;
    conditions: string[];
  }
  const matchesByCat = new Map<string, Match[]>();

  for (const catId of categories.keys()) {
    matchesByCat.set(catId, []);
  }

  for (const rule of activeRules) {
    const res = evalPredicateBruteForce(rule.predicate, employee, atDateStr);
    if (res.matches) {
      matchesByCat.get(rule.categoryId)!.push({
        rule,
        conditions: res.conditions,
      });
    }
  }

  const assignments: DesiredAssignment[] = [];
  const decisions: Decision[] = [];

  // Sort category IDs for deterministic output
  const sortedCatIds = Array.from(categories.keys()).sort();

  for (const catId of sortedCatIds) {
    const catMeta = categories.get(catId)!;
    const matches = matchesByCat.get(catId) ?? [];

    if (matches.length === 0) {
      decisions.push({
        categoryId: catId as PolicyCategoryId,
        categoryKey: catMeta.key,
        status: "EMPTY",
        candidates: [],
        winner: null,
        reason: "No rules matched employee attributes",
      });
      continue;
    }

    if (catMeta.cardinality === "ONE") {
      // Sort matches by priority DESC, then ruleId ASC
      matches.sort((a, b) => {
        if (b.rule.priority !== a.rule.priority) {
          return b.rule.priority - a.rule.priority;
        }
        return a.rule.ruleId.localeCompare(b.rule.ruleId);
      });

      const topPriority = matches[0].rule.priority;
      const topMatches = matches.filter((m) => m.rule.priority === topPriority);
      const topPolicies = new Set(topMatches.map((m) => m.rule.policyId));

      if (topPolicies.size > 1) {
        // AMBIGUOUS: Multiple top-priority rules assign different policies
        const candidates: CandidateDecision[] = matches.map((m) => ({
          ruleId: m.rule.ruleId as AssignmentRuleId,
          ruleVersion: m.rule.version,
          policyId: m.rule.policyId as PolicyId,
          policyName: m.rule.policyName,
          priority: m.rule.priority,
          matchedConditions: m.conditions,
          outcome: m.rule.priority === topPriority ? "TIED" : "OVERRIDDEN",
        }));

        decisions.push({
          categoryId: catId as PolicyCategoryId,
          categoryKey: catMeta.key,
          status: "AMBIGUOUS",
          candidates,
          winner: null,
          reason: `Conflict: Multiple rules with equal priority (${topPriority}) assign different policies for ${catMeta.name}`,
        });
      } else {
        const topMatch = matches[0];
        const winnerCandidate: CandidateDecision = {
          ruleId: topMatch.rule.ruleId as AssignmentRuleId,
          ruleVersion: topMatch.rule.version,
          policyId: topMatch.rule.policyId as PolicyId,
          policyName: topMatch.rule.policyName,
          priority: topMatch.rule.priority,
          matchedConditions: topMatch.conditions,
          outcome: "WINNER",
        };

        const candidates: CandidateDecision[] = matches.map((m, i) => {
          if (i === 0) return winnerCandidate;
          return {
            ruleId: m.rule.ruleId as AssignmentRuleId,
            ruleVersion: m.rule.version,
            policyId: m.rule.policyId as PolicyId,
            policyName: m.rule.policyName,
            priority: m.rule.priority,
            matchedConditions: m.conditions,
            outcome: "OVERRIDDEN",
          };
        });

        decisions.push({
          categoryId: catId as PolicyCategoryId,
          categoryKey: catMeta.key,
          status: "ASSIGNED",
          candidates,
          winner: winnerCandidate,
          reason:
            matches.length > 1
              ? `Rule '${topMatch.rule.ruleId}' won with highest priority (${topMatch.rule.priority})`
              : `Rule '${topMatch.rule.ruleId}' matched and assigned ${topMatch.rule.policyName}`,
        });

        assignments.push({
          employeeId: employee.id,
          policyId: topMatch.rule.policyId as PolicyId,
          categoryId: catId as PolicyCategoryId,
          sourceRuleId: topMatch.rule.ruleId as AssignmentRuleId,
          sourceRuleVersion: topMatch.rule.version,
          effectiveFrom: atDateStr,
        });
      }
    } else {
      // MANY cardinality
      matches.sort((a, b) => {
        const pCmp = a.rule.policyId.localeCompare(b.rule.policyId);
        if (pCmp !== 0) return pCmp;
        return b.rule.priority - a.rule.priority;
      });

      const seen = new Set<string>();
      const candidates: CandidateDecision[] = [];

      for (const m of matches) {
        const isDup = seen.has(m.rule.policyId);
        seen.add(m.rule.policyId);

        candidates.push({
          ruleId: m.rule.ruleId as AssignmentRuleId,
          ruleVersion: m.rule.version,
          policyId: m.rule.policyId as PolicyId,
          policyName: m.rule.policyName,
          priority: m.rule.priority,
          matchedConditions: m.conditions,
          outcome: "WINNER",
        });

        if (!isDup) {
          assignments.push({
            employeeId: employee.id,
            policyId: m.rule.policyId as PolicyId,
            categoryId: catId as PolicyCategoryId,
            sourceRuleId: m.rule.ruleId as AssignmentRuleId,
            sourceRuleVersion: m.rule.version,
            effectiveFrom: atDateStr,
          });
        }
      }

      decisions.push({
        categoryId: catId as PolicyCategoryId,
        categoryKey: catMeta.key,
        status: "ASSIGNED",
        candidates,
        winner: candidates[0] ?? null,
        reason: `Assigned ${seen.size} policy(ies) in multi-value category ${catMeta.name}`,
      });
    }
  }

  assignments.sort((a, b) => {
    const cCmp = a.categoryId.localeCompare(b.categoryId);
    if (cCmp !== 0) return cCmp;
    return a.policyId.localeCompare(b.policyId);
  });

  return {
    assignments,
    decisions,
  };
}

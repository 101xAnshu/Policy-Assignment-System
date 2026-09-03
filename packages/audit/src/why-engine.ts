/**
 * "Why?" Explainability Engine.
 *
 * Explains exactly WHY an employee has (or does NOT have) a specific policy at a given date $t$.
 *
 * Principles:
 * P8 — Explainability from Resolution: Uses the actual evaluation trail without approximations.
 * Produces structured condition trails and human-readable plain language narratives.
 */

import {
  db,
  policies,
  policyCategories,
  getActiveAssignmentsAt,
} from "@warp/db";
import { eq, and } from "drizzle-orm";
import {
  loadEmployeeContextAt,
  loadActiveRulesAt,
  formatDate,
  resolve,
} from "@warp/resolver";
import { evaluatePredicateDetailed } from "@warp/rule-engine";
import { describePredicate } from "@warp/domain";
import type { Decision, CandidateOutcome } from "@warp/domain";

export interface RuleEvaluationDetail {
  ruleId: string;
  ruleVersionId: string;
  ruleVersion: number;
  policyId: string;
  policyName: string;
  priority: number;
  matched: boolean;
  matchedConditions: string[];
  failedConditions: string[];
  predicateDescription: string;
  outcome: CandidateOutcome | "NO_MATCH";
}

export interface WhyExplanation {
  employeeId: string;
  evaluationDate: string;
  targetPolicy: {
    id: string;
    name: string;
    categoryId: string;
    categoryKey: string;
    categoryName: string;
    cardinality: "ONE" | "MANY";
  };
  isAssigned: boolean;
  status: "ASSIGNED" | "OVERRIDDEN" | "NO_MATCH" | "AMBIGUOUS" | "NOT_IN_DESIRED";
  reason: string;
  currentAssignment: {
    id: string;
    effectiveFrom: string;
    effectiveTo: string | null;
    sourceRuleId: string;
    sourceRuleVersion: number;
    explanationSnapshot: any;
  } | null;
  categoryDecision: Decision | null;
  ruleEvaluations: RuleEvaluationDetail[];
}

/**
 * Explain why an employee has or does not have a policy at a given date.
 */
export async function explainPolicyAssignment(
  employeeId: string,
  policyId: string,
  at: string | Date,
): Promise<WhyExplanation> {
  const atStr = formatDate(at);

  // 1. Load target policy and category details
  const [policyRow] = await db
    .select({
      policyId: policies.id,
      policyName: policies.name,
      categoryId: policyCategories.id,
      categoryKey: policyCategories.key,
      categoryName: policyCategories.name,
      cardinality: policyCategories.cardinality,
    })
    .from(policies)
    .innerJoin(policyCategories, eq(policies.categoryId, policyCategories.id))
    .where(eq(policies.id, policyId));

  if (!policyRow) {
    throw new Error(`Policy ${policyId} not found`);
  }

  // 2. Load employee context at date
  const employee = await loadEmployeeContextAt(employeeId, atStr);
  if (!employee) {
    throw new Error(`Employee ${employeeId} not found at ${atStr}`);
  }

  // 3. Load active rules for employee's company at date
  const allRules = await loadActiveRulesAt(employee.companyId, atStr);
  const categoryRules = allRules.filter((r) => r.categoryId === policyRow.categoryId);

  // 4. Evaluate detailed condition trails for all rules in this category
  const ruleEvaluations: RuleEvaluationDetail[] = [];
  for (const rule of categoryRules) {
    const evalResult = evaluatePredicateDetailed(rule.predicate, employee, atStr);
    ruleEvaluations.push({
      ruleId: rule.ruleId,
      ruleVersionId: rule.ruleVersionId,
      ruleVersion: rule.version,
      policyId: rule.policyId,
      policyName: rule.policyName,
      priority: rule.priority,
      matched: evalResult.matched,
      matchedConditions: evalResult.matchedConditions,
      failedConditions: evalResult.failedConditions,
      predicateDescription: describePredicate(rule.predicate),
      outcome: evalResult.matched ? "WINNER" : "NO_MATCH", // will refine below
    });
  }

  // 5. Run full resolver to get authoritative category decision
  const resolution = resolve(employee, categoryRules, atStr);
  const categoryDecision =
    resolution.decisions.find((d) => d.categoryId === policyRow.categoryId) ?? null;

  // Refine outcome on rule evaluations based on resolver decision
  if (categoryDecision) {
    for (const ruleEval of ruleEvaluations) {
      if (ruleEval.matched) {
        const candidate = categoryDecision.candidates.find(
          (c) => c.ruleId === ruleEval.ruleId,
        );
        if (candidate) {
          ruleEval.outcome = candidate.outcome;
        }
      }
    }
  }

  // 6. Check actual materialized assignment from database
  const actuals = await getActiveAssignmentsAt(employeeId, atStr);
  const currentAssignment = actuals.find((a) => a.policyId === policyId) ?? null;
  const isAssigned = currentAssignment !== null;

  // 7. Determine status and plain-language reason narrative
  let status: WhyExplanation["status"] = "NO_MATCH";
  let reason = "";

  const matchingTargetRules = ruleEvaluations.filter(
    (r) => r.policyId === policyId && r.matched,
  );
  const nonMatchingTargetRules = ruleEvaluations.filter(
    (r) => r.policyId === policyId && !r.matched,
  );

  if (categoryDecision?.status === "AMBIGUOUS") {
    status = "AMBIGUOUS";
    reason = `Policy '${policyRow.policyName}' is in an ambiguous state: multiple rules with equal priority (${categoryDecision.candidates[0]?.priority}) tied with conflicting policies.`;
  } else if (isAssigned) {
    status = "ASSIGNED";
    const winnerEval = ruleEvaluations.find(
      (r) => r.policyId === policyId && r.outcome === "WINNER",
    );
    reason = winnerEval
      ? `Policy '${policyRow.policyName}' is assigned because rule '${winnerEval.ruleId}' matched conditions [${winnerEval.matchedConditions.join(", ")}] and won with priority ${winnerEval.priority}.`
      : `Policy '${policyRow.policyName}' is currently assigned to this employee.`;
  } else if (matchingTargetRules.length > 0) {
    // Rule matched, but was overridden by a higher priority rule for another policy
    status = "OVERRIDDEN";
    const winningPolicy = categoryDecision?.winner;
    reason = `Policy '${policyRow.policyName}' matched employee attributes [${matchingTargetRules[0].matchedConditions.join(", ")}], but was overridden by higher-priority policy '${winningPolicy?.policyName}' (priority ${winningPolicy?.priority} vs ${matchingTargetRules[0].priority}).`;
  } else if (nonMatchingTargetRules.length > 0) {
    status = "NO_MATCH";
    const failed = nonMatchingTargetRules[0].failedConditions;
    reason = `Policy '${policyRow.policyName}' is not assigned because employee attributes failed rule criteria: [${failed.join(", ")}].`;
  } else {
    status = "NOT_IN_DESIRED";
    reason = `No active assignment rules for '${policyRow.policyName}' exist in company at ${atStr}.`;
  }

  return {
    employeeId,
    evaluationDate: atStr,
    targetPolicy: {
      id: policyRow.policyId,
      name: policyRow.policyName,
      categoryId: policyRow.categoryId,
      categoryKey: policyRow.categoryKey,
      categoryName: policyRow.categoryName,
      cardinality: policyRow.cardinality as "ONE" | "MANY",
    },
    isAssigned,
    status,
    reason,
    currentAssignment: currentAssignment
      ? {
          id: currentAssignment.id,
          effectiveFrom: currentAssignment.effectiveFrom,
          effectiveTo: currentAssignment.effectiveTo,
          sourceRuleId: currentAssignment.sourceRuleId,
          sourceRuleVersion: currentAssignment.sourceRuleVersion,
          explanationSnapshot: currentAssignment.explanationSnapshot,
        }
      : null,
    categoryDecision,
    ruleEvaluations,
  };
}

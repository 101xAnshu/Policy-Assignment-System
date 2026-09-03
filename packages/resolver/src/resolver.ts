/**
 * Deterministic Policy Resolver.
 *
 * Given:
 * - employee: EmployeeContext
 * - rules: EvaluatableRule[]
 * - at: string | Date
 *
 * Produces:
 * - ResolutionResult { assignments: DesiredAssignment[], decisions: Decision[] }
 *
 * Principles:
 * P2 — Deterministic and pure: same inputs always produce identical output.
 * P6 — Temporal validity is explicit: half-open [effectiveFrom, effectiveTo) intervals.
 * P8 — Explainability comes directly from resolution decisions.
 */

import type {
  EmployeeContext,
  ResolutionResult,
  DesiredAssignment,
  Decision,
  CandidateDecision,
  PolicyCategoryId,
} from "@warp/domain";
import { evaluatePredicateDetailed } from "@warp/rule-engine";
import type { EvaluatableRule } from "./types";

/**
 * Format a Date or date string to YYYY-MM-DD for consistent comparison.
 */
export function formatDate(date: string | Date): string {
  if (typeof date === "string") {
    return date.split("T")[0];
  }
  return date.toISOString().split("T")[0];
}

/**
 * Check if a rule is temporally active at the given date.
 * effectiveFrom <= at AND (effectiveTo IS NULL OR at < effectiveTo)
 */
export function isRuleActiveAt(rule: EvaluatableRule, at: string): boolean {
  if (rule.effectiveFrom > at) {
    return false;
  }
  if (rule.effectiveTo !== null && at >= rule.effectiveTo) {
    return false;
  }
  return true;
}

/**
 * Core Deterministic Resolver.
 */
export function resolve(
  employee: EmployeeContext,
  rules: EvaluatableRule[],
  at: string | Date,
): ResolutionResult {
  const atDateStr = formatDate(at);

  // 1. Filter rules that are active at `at`
  const activeRules = rules.filter((r) => isRuleActiveAt(r, atDateStr));

  // 2. Evaluate predicates and collect matching candidates grouped by category
  interface MatchRecord {
    rule: EvaluatableRule;
    matchedConditions: string[];
  }

  const categoryMap = new Map<
    PolicyCategoryId,
    {
      categoryKey: string;
      categoryName: string;
      cardinality: "ONE" | "MANY";
      matches: MatchRecord[];
    }
  >();

  // Initialize map with all distinct categories present in rules so empty categories are accounted for
  for (const r of rules) {
    if (!categoryMap.has(r.categoryId)) {
      categoryMap.set(r.categoryId, {
        categoryKey: r.categoryKey,
        categoryName: r.categoryName,
        cardinality: r.cardinality,
        matches: [],
      });
    }
  }

  for (const rule of activeRules) {
    const evalResult = evaluatePredicateDetailed(
      rule.predicate,
      employee,
      atDateStr,
    );

    if (evalResult.matched) {
      const entry = categoryMap.get(rule.categoryId)!;
      entry.matches.push({
        rule,
        matchedConditions: evalResult.matchedConditions,
      });
    }
  }

  const desiredAssignments: DesiredAssignment[] = [];
  const decisions: Decision[] = [];

  // Sort category IDs to ensure deterministic iteration order
  const sortedCategoryIds = Array.from(categoryMap.keys()).sort();

  for (const catId of sortedCategoryIds) {
    const cat = categoryMap.get(catId)!;

    if (cat.matches.length === 0) {
      decisions.push({
        categoryId: catId,
        categoryKey: cat.categoryKey,
        status: "EMPTY",
        candidates: [],
        winner: null,
        reason: "No rules matched employee attributes",
      });
      continue;
    }

    if (cat.cardinality === "ONE") {
      // ─── ONE Category Resolution ─────────────────────────────────────
      // Sort candidates by: priority DESC, then ruleId ASC
      cat.matches.sort((a, b) => {
        if (b.rule.priority !== a.rule.priority) {
          return b.rule.priority - a.rule.priority;
        }
        return a.rule.ruleId.localeCompare(b.rule.ruleId);
      });

      const topMatch = cat.matches[0];
      const highestPriority = topMatch.rule.priority;

      // Find all matches sharing the highest priority
      const topTiedMatches = cat.matches.filter(
        (m) => m.rule.priority === highestPriority,
      );

      // Check if top tied matches assign different policies
      const distinctTopPolicies = new Set(
        topTiedMatches.map((m) => m.rule.policyId),
      );

      if (distinctTopPolicies.size > 1) {
        // AMBIGUITY DETECTED
        // Two or more rules with equal highest priority assign conflicting policies
        const candidates: CandidateDecision[] = cat.matches.map((m) => {
          const isTopTier = m.rule.priority === highestPriority;
          return {
            ruleId: m.rule.ruleId,
            ruleVersion: m.rule.version,
            policyId: m.rule.policyId,
            policyName: m.rule.policyName,
            priority: m.rule.priority,
            matchedConditions: m.matchedConditions,
            outcome: isTopTier ? "TIED" : "OVERRIDDEN",
          };
        });

        decisions.push({
          categoryId: catId,
          categoryKey: cat.categoryKey,
          status: "AMBIGUOUS",
          candidates,
          winner: null,
          reason: `Conflict: Multiple rules with equal priority (${highestPriority}) assign different policies for ${cat.categoryName}`,
        });
      } else {
        // Deterministic single winner (or tied rules assigning the exact same policy)
        const winnerCandidate: CandidateDecision = {
          ruleId: topMatch.rule.ruleId,
          ruleVersion: topMatch.rule.version,
          policyId: topMatch.rule.policyId,
          policyName: topMatch.rule.policyName,
          priority: topMatch.rule.priority,
          matchedConditions: topMatch.matchedConditions,
          outcome: "WINNER",
        };

        const candidates: CandidateDecision[] = cat.matches.map((m, idx) => {
          if (idx === 0) return winnerCandidate;
          return {
            ruleId: m.rule.ruleId,
            ruleVersion: m.rule.version,
            policyId: m.rule.policyId,
            policyName: m.rule.policyName,
            priority: m.rule.priority,
            matchedConditions: m.matchedConditions,
            outcome: "OVERRIDDEN",
          };
        });

        const reason =
          cat.matches.length > 1
            ? `Rule '${topMatch.rule.ruleId}' won with highest priority (${topMatch.rule.priority})`
            : `Rule '${topMatch.rule.ruleId}' matched and assigned ${topMatch.rule.policyName}`;

        decisions.push({
          categoryId: catId,
          categoryKey: cat.categoryKey,
          status: "ASSIGNED",
          candidates,
          winner: winnerCandidate,
          reason,
        });

        desiredAssignments.push({
          employeeId: employee.id,
          policyId: topMatch.rule.policyId,
          categoryId: catId,
          sourceRuleId: topMatch.rule.ruleId,
          sourceRuleVersion: topMatch.rule.version,
          effectiveFrom: atDateStr,
        });
      }
    } else {
      // ─── MANY Category Resolution ────────────────────────────────────
      // All matching policies are assigned; duplicates are deduplicated
      // Sort matches by policyId ASC, then priority DESC
      cat.matches.sort((a, b) => {
        const pCmp = a.rule.policyId.localeCompare(b.rule.policyId);
        if (pCmp !== 0) return pCmp;
        return b.rule.priority - a.rule.priority;
      });

      const seenPolicies = new Set<string>();
      const candidates: CandidateDecision[] = [];

      for (const m of cat.matches) {
        const isDuplicate = seenPolicies.has(m.rule.policyId);
        seenPolicies.add(m.rule.policyId);

        candidates.push({
          ruleId: m.rule.ruleId,
          ruleVersion: m.rule.version,
          policyId: m.rule.policyId,
          policyName: m.rule.policyName,
          priority: m.rule.priority,
          matchedConditions: m.matchedConditions,
          outcome: "WINNER",
        });

        if (!isDuplicate) {
          desiredAssignments.push({
            employeeId: employee.id,
            policyId: m.rule.policyId,
            categoryId: catId,
            sourceRuleId: m.rule.ruleId,
            sourceRuleVersion: m.rule.version,
            effectiveFrom: atDateStr,
          });
        }
      }

      decisions.push({
        categoryId: catId,
        categoryKey: cat.categoryKey,
        status: "ASSIGNED",
        candidates,
        winner: candidates[0] ?? null,
        reason: `Assigned ${seenPolicies.size} policy(ies) in multi-value category ${cat.categoryName}`,
      });
    }
  }

  // Sort desired assignments deterministically by categoryId ASC, policyId ASC
  desiredAssignments.sort((a, b) => {
    const cCmp = a.categoryId.localeCompare(b.categoryId);
    if (cCmp !== 0) return cCmp;
    return a.policyId.localeCompare(b.policyId);
  });

  return {
    assignments: desiredAssignments,
    decisions,
  };
}

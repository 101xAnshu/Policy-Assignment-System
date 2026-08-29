/**
 * Predicate Evaluator for the Policy Assignment System.
 * Build Spec §10, §16.
 *
 * Evaluates a predicate AST against an employee context at a specific evaluation date.
 * Pure function: deterministic, side-effect free.
 */

import type { Predicate, EmployeeContext } from "@warp/domain";

/**
 * Result of detailed predicate evaluation.
 * Used for explanation snapshots and the "Why?" experience.
 */
export interface PredicateEvaluationResult {
  matched: boolean;
  matchedConditions: string[];
  failedConditions: string[];
}

/**
 * Calculate completed months of tenure between hireDate and evaluationDate.
 * Build Spec §16:
 * - Inclusive calculation.
 * - If hireDate = "2024-08-28", on "2026-08-28" the tenure is exactly 24 months.
 */
export function computeTenureMonths(
  hireDateStr: string,
  evaluationDate: string | Date,
): number {
  const hireDate = new Date(hireDateStr);
  const evalDate =
    typeof evaluationDate === "string"
      ? new Date(evaluationDate)
      : evaluationDate;

  if (isNaN(hireDate.getTime()) || isNaN(evalDate.getTime())) {
    return 0;
  }

  if (evalDate < hireDate) {
    return 0;
  }

  let months =
    (evalDate.getUTCFullYear() - hireDate.getUTCFullYear()) * 12 +
    (evalDate.getUTCMonth() - hireDate.getUTCMonth());

  // If the evaluation day of month is before the hire day of month, subtract 1 month
  if (evalDate.getUTCDate() < hireDate.getUTCDate()) {
    months--;
  }

  return Math.max(0, months);
}

/**
 * Evaluate a predicate against an employee context at a specific date.
 * Returns true if the predicate matches, false otherwise.
 */
export function evaluatePredicate(
  predicate: Predicate,
  employee: EmployeeContext,
  at: string | Date,
): boolean {
  return evaluatePredicateDetailed(predicate, employee, at).matched;
}

/**
 * Evaluate a predicate with full condition trail.
 * Returns matched status along with arrays of passed/failed condition descriptions.
 */
export function evaluatePredicateDetailed(
  predicate: Predicate,
  employee: EmployeeContext,
  at: string | Date,
): PredicateEvaluationResult {
  const matchedConditions: string[] = [];
  const failedConditions: string[] = [];

  const matched = evaluateNode(
    predicate,
    employee,
    at,
    matchedConditions,
    failedConditions,
  );

  return {
    matched,
    matchedConditions,
    failedConditions,
  };
}

function evaluateNode(
  node: Predicate,
  employee: EmployeeContext,
  at: string | Date,
  matched: string[],
  failed: string[],
): boolean {
  switch (node.type) {
    case "ALL": {
      // Empty ALL is vacuously true (matches all employees)
      if (node.children.length === 0) {
        matched.push("all employees");
        return true;
      }

      let allPassed = true;
      for (const child of node.children) {
        const childPassed = evaluateNode(child, employee, at, matched, failed);
        if (!childPassed) {
          allPassed = false;
        }
      }
      return allPassed;
    }

    case "EQUALS": {
      const actualVal = employee[node.field];
      const isMatch = actualVal === node.value;
      const desc = `${node.field} = ${node.value}`;

      if (isMatch) {
        matched.push(desc);
      } else {
        failed.push(`${desc} (actual: ${actualVal ?? "null"})`);
      }
      return isMatch;
    }

    case "IS_MANAGER": {
      const isMatch = employee.isManager === node.value;
      const desc = node.value ? "is a manager" : "is not a manager";

      if (isMatch) {
        matched.push(desc);
      } else {
        failed.push(`${desc} (actual: ${employee.isManager ? "manager" : "individual contributor"})`);
      }
      return isMatch;
    }

    case "GROUP_MEMBER": {
      const isMember = employee.groupIds.includes(node.groupId as any);
      const desc = `member of group ${node.groupId}`;

      if (isMember) {
        matched.push(desc);
      } else {
        failed.push(`not a ${desc}`);
      }
      return isMember;
    }

    case "TENURE_AT_LEAST": {
      const tenure = computeTenureMonths(employee.hireDate, at);
      const isMatch = tenure >= node.durationMonths;
      const desc = `tenure ≥ ${node.durationMonths} months`;

      if (isMatch) {
        matched.push(`${desc} (actual: ${tenure} months)`);
      } else {
        failed.push(`${desc} (actual: ${tenure} months)`);
      }
      return isMatch;
    }
  }
}

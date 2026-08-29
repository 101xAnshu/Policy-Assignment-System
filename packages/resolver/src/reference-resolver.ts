/**
 * Reference Resolver.
 * Build Spec §38, §39.
 *
 * A deliberately simple, unoptimized resolver used as the trusted reference model.
 * Performs a brute-force resolution across all rules with no indexing or dependency shortcuts.
 *
 * Used in property-based testing (§39) and verification (§41) to guarantee that
 * incremental reconciliation converges to the exact reference recompute state.
 */

import type { EmployeeContext, ResolutionResult } from "@warp/domain";
import type { EvaluatableRule } from "./types";
import { resolve } from "./resolver";

/**
 * Pure reference resolver that evaluates employee against all active rules.
 */
export function referenceResolver(
  employee: EmployeeContext,
  allRules: EvaluatableRule[],
  at: string | Date,
): ResolutionResult {
  // Directly invoke the pure resolve algorithm
  return resolve(employee, allRules, at);
}

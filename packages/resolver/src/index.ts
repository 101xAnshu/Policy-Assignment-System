/**
 * @warp/resolver — Deterministic Policy Resolver.
 */

export {
  resolve,
  isRuleActiveAt,
  formatDate,
} from "./resolver";

export {
  referenceResolver,
} from "./reference-resolver";

export {
  loadEmployeeContextAt,
  loadActiveRulesAt,
} from "./loader";

export type {
  EvaluatableRule,
} from "./types";

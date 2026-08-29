import type {
  AssignmentRuleId,
  AssignmentRuleVersionId,
  PolicyId,
  PolicyCategoryId,
  Cardinality,
  Predicate,
} from "@warp/domain";

/**
 * An active rule version with its policy and category metadata
 * ready for resolution.
 */
export interface EvaluatableRule {
  ruleId: AssignmentRuleId;
  ruleVersionId: AssignmentRuleVersionId;
  version: number;
  policyId: PolicyId;
  policyName: string;
  categoryId: PolicyCategoryId;
  categoryKey: string;
  categoryName: string;
  cardinality: Cardinality;
  predicate: Predicate;
  priority: number;
  effectiveFrom: string; // ISO date
  effectiveTo: string | null; // ISO date, null = no expiration
}

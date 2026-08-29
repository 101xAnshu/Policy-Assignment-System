/**
 * @warp/domain — Domain types and predicate grammar for the Policy Assignment System.
 *
 * This package contains pure data definitions with no database or framework dependencies.
 * It is the foundational vocabulary shared across all packages.
 */

export type {
  // Branded IDs
  CompanyId,
  EmployeeId,
  EmployeeVersionId,
  PolicyCategoryId,
  PolicyId,
  GroupId,
  AssignmentRuleId,
  AssignmentRuleVersionId,
  PolicyAssignmentId,
  AuditEventId,
  // Enums
  Cardinality,
  RuleStatus,
  EmploymentType,
  DecisionStatus,
  CandidateOutcome,
  // Entities
  Company,
  Employee,
  EmployeeVersion,
  PolicyCategory,
  Policy,
  Group,
  GroupMembership,
  AssignmentRule,
  AssignmentRuleVersion,
  PolicyAssignment,
  ExplanationSnapshot,
  MatchedRuleSnapshot,
  // Resolver output
  ResolutionResult,
  DesiredAssignment,
  Decision,
  CandidateDecision,
  // Reconciliation
  AssignmentDiff,
  // Audit
  AuditEventType,
  AuditEvent,
  // Outbox
  OutboxEventType,
  OutboxEvent,
  // Temporal
  TemporalJob,
  // Context
  EmployeeContext,
} from "./types";

export type {
  Predicate,
  AllPredicate,
  EqualsPredicate,
  IsManagerPredicate,
  GroupMemberPredicate,
  TenureAtLeastPredicate,
  PredicateField,
  EmployeeField,
  DependencySet,
} from "./predicate";

export {
  extractDependencies,
  validatePredicate,
  describePredicate,
} from "./predicate";

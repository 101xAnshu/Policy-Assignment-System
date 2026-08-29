/**
 * Domain types for the Policy Assignment System.
 *
 * These types represent the core entities described in Build Spec §6–§9, §14, §17–§18.
 * They are pure data definitions — no database or framework dependencies.
 *
 * Key design decisions:
 * - IDs are branded strings for type safety (prevents passing an employeeId where a policyId is expected)
 * - Cardinality is on PolicyCategory, not on individual rules (§7)
 * - EmployeeVersion captures valid-time history (§6)
 * - AssignmentRuleVersion is immutable once published (P7)
 * - PolicyAssignment includes explanationSnapshot for stable historical explanations (§18)
 */

// ─── Branded ID types ────────────────────────────────────────────────────────

/** Nominal branding for type-safe IDs */
type Brand<T, B> = T & { readonly __brand: B };

export type CompanyId = Brand<string, "CompanyId">;
export type EmployeeId = Brand<string, "EmployeeId">;
export type EmployeeVersionId = Brand<string, "EmployeeVersionId">;
export type PolicyCategoryId = Brand<string, "PolicyCategoryId">;
export type PolicyId = Brand<string, "PolicyId">;
export type GroupId = Brand<string, "GroupId">;
export type AssignmentRuleId = Brand<string, "AssignmentRuleId">;
export type AssignmentRuleVersionId = Brand<string, "AssignmentRuleVersionId">;
export type PolicyAssignmentId = Brand<string, "PolicyAssignmentId">;
export type AuditEventId = Brand<string, "AuditEventId">;

// ─── Enums ───────────────────────────────────────────────────────────────────

/** Policy category cardinality: ONE = at most one active assignment, MANY = multiple allowed */
export type Cardinality = "ONE" | "MANY";

/** Rule lifecycle status */
export type RuleStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";

/** Employment type */
export type EmploymentType = "FULL_TIME" | "PART_TIME" | "CONTRACTOR";

/** Resolution decision status for a category */
export type DecisionStatus = "ASSIGNED" | "EMPTY" | "AMBIGUOUS";

/** Candidate outcome within a decision */
export type CandidateOutcome = "WINNER" | "OVERRIDDEN" | "TIED";

// ─── Core Entities ───────────────────────────────────────────────────────────

/** Build Spec §6 — Company */
export interface Company {
  id: CompanyId;
  name: string;
}

/**
 * Build Spec §6 — Employee (current state)
 *
 * The current Employee record is the latest state.
 * Historical state is captured in EmployeeVersion.
 */
export interface Employee {
  id: EmployeeId;
  companyId: CompanyId;
  name: string;
  email: string;
  country: string;
  state: string | null;
  department: string;
  employmentType: EmploymentType;
  isManager: boolean;
  hireDate: string; // ISO date string (YYYY-MM-DD)
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Build Spec §6 — EmployeeVersion (valid-time historical state)
 *
 * Each version captures the employee's attributes over a half-open interval [validFrom, validTo).
 * validTo = null means "current / no known end date".
 */
export interface EmployeeVersion {
  id: EmployeeVersionId;
  employeeId: EmployeeId;
  version: number;
  validFrom: string; // ISO date (business-effective date)
  validTo: string | null; // ISO date, null = current
  country: string;
  state: string | null;
  department: string;
  employmentType: EmploymentType;
  isManager: boolean;
  hireDate: string;
  createdAt: Date;
}

// ─── Policy Model ────────────────────────────────────────────────────────────

/**
 * Build Spec §7 — PolicyCategory
 *
 * Cardinality belongs to the category, not to individual rules.
 * ONE = at most one active assignment per employee in this category.
 * MANY = multiple policies can coexist.
 */
export interface PolicyCategory {
  id: PolicyCategoryId;
  companyId: CompanyId;
  key: string; // machine-readable key (e.g., "vacation", "app_access")
  name: string; // human-readable name (e.g., "Vacation", "Application Access")
  cardinality: Cardinality;
}

/** Build Spec §7 — Policy */
export interface Policy {
  id: PolicyId;
  categoryId: PolicyCategoryId;
  name: string;
  description: string | null;
}

// ─── Groups ──────────────────────────────────────────────────────────────────

/** Build Spec §8 — Group */
export interface Group {
  id: GroupId;
  companyId: CompanyId;
  name: string;
}

/**
 * Build Spec §8 — GroupMembership
 *
 * Temporal: [validFrom, validTo) half-open interval.
 * validTo = null means "currently a member".
 */
export interface GroupMembership {
  employeeId: EmployeeId;
  groupId: GroupId;
  validFrom: string;
  validTo: string | null;
}

// ─── Rules ───────────────────────────────────────────────────────────────────

/**
 * Build Spec §9 — AssignmentRule (stable identity)
 *
 * The rule itself holds identity and status.
 * All behavioral properties (predicate, priority, effective dates) live on the version.
 */
export interface AssignmentRule {
  id: AssignmentRuleId;
  companyId: CompanyId;
  policyId: PolicyId;
  categoryId: PolicyCategoryId;
  name: string;
  status: RuleStatus;
  currentVersion: number | null; // null if only draft versions exist
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Build Spec §9 — AssignmentRuleVersion (immutable)
 *
 * Once published, a version is never mutated (P7).
 * Priority belongs to the version because a published rule's behavior must be immutable.
 *
 * effectiveFrom/effectiveTo are half-open: [from, to)
 * effectiveTo = null means "no expiration".
 */
export interface AssignmentRuleVersion {
  id: AssignmentRuleVersionId;
  ruleId: AssignmentRuleId;
  version: number;
  predicate: import("./predicate").Predicate;
  priority: number;
  effectiveFrom: string; // ISO date
  effectiveTo: string | null; // ISO date, null = no expiration
  dependencies: import("./predicate").DependencySet;
  createdAt: Date;
  createdBy: string; // actor identifier
}

// ─── Assignments ─────────────────────────────────────────────────────────────

/**
 * Build Spec §17 — PolicyAssignment (materialized actual state)
 *
 * Assignments are derived state: rules + employee state + time → desired → reconciled → persisted.
 * For ONE categories, overlapping intervals must be prevented transactionally.
 *
 * explanationSnapshot captures the full resolution context at assignment time (§18).
 */
export interface PolicyAssignment {
  id: PolicyAssignmentId;
  employeeId: EmployeeId;
  policyId: PolicyId;
  categoryId: PolicyCategoryId;
  sourceRuleId: AssignmentRuleId;
  sourceRuleVersion: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  explanationSnapshot: ExplanationSnapshot;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Build Spec §18 — ExplanationSnapshot
 *
 * Persisted with each assignment so historical explanations remain stable
 * even if rules are later modified or archived.
 */
export interface ExplanationSnapshot {
  evaluatedAt: string; // ISO date
  matchedRules: MatchedRuleSnapshot[];
  winner: MatchedRuleSnapshot | null;
  reason: string;
}

export interface MatchedRuleSnapshot {
  ruleId: string;
  version: number;
  priority: number;
  matchedConditions: string[];
  outcome: CandidateOutcome;
}

// ─── Resolver Output ─────────────────────────────────────────────────────────

/**
 * Build Spec §14 — ResolutionResult
 *
 * The pure output of resolve(employee, rules, at).
 * Contains both the computed desired assignments and the decision trail.
 */
export interface ResolutionResult {
  assignments: DesiredAssignment[];
  decisions: Decision[];
}

/** Build Spec §14 — DesiredAssignment */
export interface DesiredAssignment {
  employeeId: EmployeeId;
  policyId: PolicyId;
  categoryId: PolicyCategoryId;
  sourceRuleId: AssignmentRuleId;
  sourceRuleVersion: number;
  effectiveFrom: string;
}

/**
 * Build Spec §14 — Decision
 *
 * One decision per policy category per resolution.
 * Captures all candidates, the winner (if any), and the reason.
 */
export interface Decision {
  categoryId: PolicyCategoryId;
  categoryKey: string;
  status: DecisionStatus;
  candidates: CandidateDecision[];
  winner: CandidateDecision | null;
  reason: string;
}

export interface CandidateDecision {
  ruleId: AssignmentRuleId;
  ruleVersion: number;
  policyId: PolicyId;
  policyName: string;
  priority: number;
  matchedConditions: string[];
  outcome: CandidateOutcome;
}

// ─── Reconciliation ──────────────────────────────────────────────────────────

/**
 * Build Spec §19 — AssignmentDiff
 *
 * The diff between desired and actual state.
 * Used by the reconciler to apply minimal changes.
 */
export interface AssignmentDiff {
  add: DesiredAssignment[];
  remove: PolicyAssignment[];
  replace: Array<{ old: PolicyAssignment; new: DesiredAssignment }>;
  unchanged: PolicyAssignment[];
}

// ─── Audit ───────────────────────────────────────────────────────────────────

/**
 * Build Spec §28 — AuditEvent
 *
 * effectiveAt = when the change takes business effect
 * recordedAt = when the system recorded it (wall clock)
 * These are explicitly distinct (§28).
 */
export type AuditEventType =
  | "EMPLOYEE_CREATED"
  | "EMPLOYEE_CHANGED"
  | "RULE_PUBLISHED"
  | "GROUP_MEMBERSHIP_CHANGED"
  | "ASSIGNMENT_ADDED"
  | "ASSIGNMENT_REMOVED"
  | "ASSIGNMENT_REPLACED"
  | "RECONCILIATION_FAILED";

export interface AuditEvent {
  id: AuditEventId;
  companyId: CompanyId;
  entityType: string;
  entityId: string;
  eventType: AuditEventType;
  actor: string;
  effectiveAt: string;
  recordedAt: Date;
  payload: Record<string, unknown>;
}

// ─── Outbox ──────────────────────────────────────────────────────────────────

/** Build Spec §26 — Transactional outbox event */
export type OutboxEventType =
  | "EMPLOYEE_CREATED"
  | "EMPLOYEE_UPDATED"
  | "RULE_PUBLISHED"
  | "GROUP_MEMBERSHIP_CHANGED";

export interface OutboxEvent {
  id: string;
  eventType: OutboxEventType;
  entityType: string;
  entityId: string;
  payload: Record<string, unknown>;
  createdAt: Date;
  processedAt: Date | null;
}

// ─── Temporal Jobs ───────────────────────────────────────────────────────────

/**
 * Build Spec §24 — TemporalJob
 *
 * Scheduled reconciliation triggers (e.g., tenure threshold, future-dated changes).
 * Worker periodically claims due jobs.
 */
export interface TemporalJob {
  id: string;
  employeeId: EmployeeId;
  triggerAt: Date;
  reason: string;
  processedAt: Date | null;
  createdAt: Date;
}

// ─── Employee Context (for resolver) ─────────────────────────────────────────

/**
 * The complete context needed to resolve policies for an employee at a given date.
 * Assembled from employee state + group memberships.
 */
export interface EmployeeContext {
  id: EmployeeId;
  companyId: CompanyId;
  country: string;
  state: string | null;
  department: string;
  employmentType: EmploymentType;
  isManager: boolean;
  hireDate: string;
  groupIds: GroupId[];
}

/**
 * Predicate grammar for the Policy Assignment System.
 *
 * Build Spec §10 — Constrained predicate AST.
 * Build Spec §11 — Dependency extraction.
 *
 * Design decisions:
 * - Only the predicates from the spec are supported: ALL, EQUALS, IS_MANAGER, GROUP_MEMBER, TENURE_AT_LEAST
 * - ALL with zero children is vacuously true (matches all employees)
 * - No generalized expression language, no arbitrary executable rules
 * - Each predicate is serializable, validated, versioned, deterministic, inspectable, explainable
 * - Dependency extraction is deterministic and drives incremental reconciliation
 *
 * The field constraint on EQUALS is deliberate: only the enumerated employee fields
 * can be used, preventing arbitrary field access.
 */

// ─── Predicate Types ─────────────────────────────────────────────────────────

/** Fields that can be used in EQUALS predicates */
export type PredicateField = "country" | "state" | "department" | "employmentType";

/**
 * ALL — logical conjunction of children.
 * An ALL with zero children is vacuously true (matches every employee).
 */
export interface AllPredicate {
  type: "ALL";
  children: Predicate[];
}

/** EQUALS — exact match on a constrained employee field */
export interface EqualsPredicate {
  type: "EQUALS";
  field: PredicateField;
  value: string;
}

/** IS_MANAGER — boolean check on employee.isManager */
export interface IsManagerPredicate {
  type: "IS_MANAGER";
  value: boolean;
}

/** GROUP_MEMBER — employee must be an active member of the specified group */
export interface GroupMemberPredicate {
  type: "GROUP_MEMBER";
  groupId: string;
}

/**
 * TENURE_AT_LEAST — employee's tenure must be >= durationMonths.
 *
 * Build Spec §16: TENURE_AT_LEAST(24 months) is inclusive.
 * If hireDate = 2024-08-28, the condition becomes true at 2026-08-28.
 */
export interface TenureAtLeastPredicate {
  type: "TENURE_AT_LEAST";
  durationMonths: number;
}

/** Discriminated union of all supported predicate types */
export type Predicate =
  | AllPredicate
  | EqualsPredicate
  | IsManagerPredicate
  | GroupMemberPredicate
  | TenureAtLeastPredicate;

// ─── Dependency Extraction ───────────────────────────────────────────────────

/** Employee fields that a rule's predicate depends on */
export type EmployeeField = "country" | "state" | "department" | "employmentType" | "isManager";

/**
 * Build Spec §11 — DependencySet
 *
 * Extracted from a predicate to determine which changes
 * require re-evaluation of a rule.
 *
 * Examples:
 *   state = "CA"                → employeeFields: ["state"]
 *   GROUP_MEMBER("managers")    → groupIds: ["managers"]
 *   TENURE_AT_LEAST(24)         → hasTemporalDependency: true
 */
export interface DependencySet {
  employeeFields: EmployeeField[];
  groupIds: string[];
  hasTemporalDependency: boolean;
}

// ─── Dependency Extraction Function ──────────────────────────────────────────

/**
 * Extract the dependency set from a predicate.
 *
 * This is a pure function: same predicate always produces the same dependencies.
 * Used during rule version creation to persist dependencies for incremental reconciliation.
 */
export function extractDependencies(predicate: Predicate): DependencySet {
  const result: DependencySet = {
    employeeFields: [],
    groupIds: [],
    hasTemporalDependency: false,
  };

  collectDependencies(predicate, result);

  // Deduplicate
  result.employeeFields = [...new Set(result.employeeFields)];
  result.groupIds = [...new Set(result.groupIds)];

  return result;
}

function collectDependencies(predicate: Predicate, result: DependencySet): void {
  switch (predicate.type) {
    case "ALL":
      for (const child of predicate.children) {
        collectDependencies(child, result);
      }
      break;

    case "EQUALS":
      // Map predicate field to EmployeeField
      result.employeeFields.push(predicate.field as EmployeeField);
      break;

    case "IS_MANAGER":
      result.employeeFields.push("isManager");
      break;

    case "GROUP_MEMBER":
      result.groupIds.push(predicate.groupId);
      break;

    case "TENURE_AT_LEAST":
      result.hasTemporalDependency = true;
      break;
  }
}

// ─── Predicate Validation ────────────────────────────────────────────────────

const VALID_PREDICATE_FIELDS: PredicateField[] = [
  "country",
  "state",
  "department",
  "employmentType",
];

/**
 * Validate a predicate structure.
 * Returns an array of validation errors (empty = valid).
 */
export function validatePredicate(predicate: unknown): string[] {
  const errors: string[] = [];
  validatePredicateNode(predicate, errors, "root");
  return errors;
}

function validatePredicateNode(
  node: unknown,
  errors: string[],
  path: string,
): void {
  if (!node || typeof node !== "object") {
    errors.push(`${path}: predicate must be an object`);
    return;
  }

  const pred = node as Record<string, unknown>;

  if (!pred.type || typeof pred.type !== "string") {
    errors.push(`${path}: predicate must have a string 'type' field`);
    return;
  }

  switch (pred.type) {
    case "ALL": {
      if (!Array.isArray(pred.children)) {
        errors.push(`${path}: ALL predicate must have 'children' array`);
        return;
      }
      for (let i = 0; i < pred.children.length; i++) {
        validatePredicateNode(pred.children[i], errors, `${path}.children[${i}]`);
      }
      break;
    }

    case "EQUALS": {
      if (
        typeof pred.field !== "string" ||
        !VALID_PREDICATE_FIELDS.includes(pred.field as PredicateField)
      ) {
        errors.push(
          `${path}: EQUALS predicate 'field' must be one of: ${VALID_PREDICATE_FIELDS.join(", ")}`,
        );
      }
      if (typeof pred.value !== "string") {
        errors.push(`${path}: EQUALS predicate 'value' must be a string`);
      }
      break;
    }

    case "IS_MANAGER": {
      if (typeof pred.value !== "boolean") {
        errors.push(`${path}: IS_MANAGER predicate 'value' must be a boolean`);
      }
      break;
    }

    case "GROUP_MEMBER": {
      if (typeof pred.groupId !== "string" || pred.groupId.length === 0) {
        errors.push(
          `${path}: GROUP_MEMBER predicate 'groupId' must be a non-empty string`,
        );
      }
      break;
    }

    case "TENURE_AT_LEAST": {
      if (
        typeof pred.durationMonths !== "number" ||
        pred.durationMonths <= 0 ||
        !Number.isInteger(pred.durationMonths)
      ) {
        errors.push(
          `${path}: TENURE_AT_LEAST predicate 'durationMonths' must be a positive integer`,
        );
      }
      break;
    }

    default:
      errors.push(`${path}: unknown predicate type '${pred.type}'`);
  }
}

// ─── Human-readable description ──────────────────────────────────────────────

/**
 * Produce a human-readable description of a predicate.
 * Used in the "Why?" experience and audit logs.
 */
export function describePredicate(predicate: Predicate): string {
  switch (predicate.type) {
    case "ALL": {
      if (predicate.children.length === 0) return "all employees";
      return predicate.children.map(describePredicate).join(" AND ");
    }
    case "EQUALS":
      return `${predicate.field} = ${predicate.value}`;
    case "IS_MANAGER":
      return predicate.value ? "is a manager" : "is not a manager";
    case "GROUP_MEMBER":
      return `member of group ${predicate.groupId}`;
    case "TENURE_AT_LEAST":
      return `tenure ≥ ${predicate.durationMonths} months`;
  }
}

import {
  pgTable,
  uuid,
  varchar,
  integer,
  date,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { employees } from "./employees";
import { policies } from "./policies";
import { policyCategories } from "./policies";
import { assignmentRules } from "./rules";

/**
 * Policy assignments table — materialized actual state.
 * Build Spec §17.
 *
 * Assignments are derived state: rules + employee state + time → desired → reconciled → persisted.
 *
 * For ONE categories, the reconciler must prevent overlapping intervals (§17).
 * This is enforced transactionally by the application before committing.
 *
 * explanationSnapshot (§18) captures the full resolution context at assignment time
 * so historical explanations remain stable even if rules are later modified or archived.
 *
 * effectiveFrom/effectiveTo: half-open [from, to) business-effective dates.
 */
export const policyAssignments = pgTable(
  "policy_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id),
    policyId: uuid("policy_id")
      .notNull()
      .references(() => policies.id),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => policyCategories.id),
    sourceRuleId: uuid("source_rule_id")
      .notNull()
      .references(() => assignmentRules.id),
    sourceRuleVersion: integer("source_rule_version").notNull(),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    explanationSnapshot: jsonb("explanation_snapshot").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    idxAssignmentsEmployee: index("idx_assignments_employee").on(table.employeeId),
    idxAssignmentsEmployeeCategory: index("idx_assignments_employee_category").on(table.employeeId, table.categoryId),
    idxAssignmentsPolicy: index("idx_assignments_policy").on(table.policyId),
    idxAssignmentsEffective: index("idx_assignments_effective").on(
      table.employeeId,
      table.effectiveFrom,
      table.effectiveTo,
    ),
  }),
);

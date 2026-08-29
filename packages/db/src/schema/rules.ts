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
import { companies } from "./companies";
import { policies } from "./policies";
import { policyCategories } from "./policies";

/**
 * Assignment rules table — stable identity.
 * Build Spec §9.
 *
 * The rule itself holds identity and status.
 * All behavioral properties live on the version (immutable once published).
 */
export const assignmentRules = pgTable(
  "assignment_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    policyId: uuid("policy_id")
      .notNull()
      .references(() => policies.id),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => policyCategories.id),
    name: varchar("name", { length: 255 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("DRAFT"), // "DRAFT" | "ACTIVE" | "ARCHIVED"
    currentVersion: integer("current_version"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    idxAssignmentRulesCompany: index("idx_assignment_rules_company").on(table.companyId),
    idxAssignmentRulesCategory: index("idx_assignment_rules_category").on(table.categoryId),
    idxAssignmentRulesStatus: index("idx_assignment_rules_status").on(table.status),
  }),
);

/**
 * Assignment rule versions table — immutable.
 * Build Spec §9.
 *
 * Once published, a version is never mutated (P7).
 * Priority belongs to the version because a published rule's behavior must be immutable.
 *
 * effectiveFrom/effectiveTo: half-open [from, to) intervals.
 * effectiveTo = null means "no expiration".
 *
 * predicate: JSONB containing the Predicate AST (§10).
 * dependencies: JSONB containing the DependencySet (§11).
 */
export const assignmentRuleVersions = pgTable(
  "assignment_rule_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ruleId: uuid("rule_id")
      .notNull()
      .references(() => assignmentRules.id),
    version: integer("version").notNull(),
    predicate: jsonb("predicate").notNull(),
    priority: integer("priority").notNull(),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    dependencies: jsonb("dependencies").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: varchar("created_by", { length: 255 }).notNull(),
  },
  (table) => ({
    idxRuleVersionsRule: index("idx_rule_versions_rule").on(table.ruleId),
    idxRuleVersionsEffective: index("idx_rule_versions_effective").on(table.effectiveFrom, table.effectiveTo),
  }),
);

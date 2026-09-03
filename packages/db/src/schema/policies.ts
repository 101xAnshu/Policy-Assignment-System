import { pgTable, uuid, varchar, timestamp } from "drizzle-orm/pg-core";
import { companies } from "./companies";

/**
 * Policy categories table.
 *
 * Cardinality belongs to the category (not to individual rules).
 * ONE = at most one active assignment per employee in this category.
 * MANY = multiple policies can coexist.
 */
export const policyCategories = pgTable("policy_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id),
  key: varchar("key", { length: 100 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  cardinality: varchar("cardinality", { length: 10 }).notNull(), // "ONE" | "MANY"
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Policies table.
 */
export const policies = pgTable("policies", {
  id: uuid("id").primaryKey().defaultRandom(),
  categoryId: uuid("category_id")
    .notNull()
    .references(() => policyCategories.id),
  name: varchar("name", { length: 255 }).notNull(),
  description: varchar("description", { length: 1000 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

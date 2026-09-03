import { pgTable, uuid, varchar, date, timestamp, index, primaryKey } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { employees } from "./employees";

/**
 * Groups table.
 */
export const groups = pgTable("groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id),
  name: varchar("name", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Group memberships table.
 *
 * Temporal: [validFrom, validTo) half-open interval.
 * validTo = null means "currently a member".
 *
 * An employee can have multiple memberships in the same group
 * over different time intervals (e.g., left and rejoined).
 */
export const groupMemberships = pgTable(
  "group_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id),
    validFrom: date("valid_from").notNull(),
    validTo: date("valid_to"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    idxGroupMembershipsEmployee: index("idx_group_memberships_employee").on(table.employeeId),
    idxGroupMembershipsGroup: index("idx_group_memberships_group").on(table.groupId),
    idxGroupMembershipsRange: index("idx_group_memberships_range").on(
      table.employeeId,
      table.groupId,
      table.validFrom,
      table.validTo,
    ),
  }),
);

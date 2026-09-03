import {
  pgTable,
  uuid,
  varchar,
  date,
  integer,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { companies } from "./companies";

/**
 * Employees table — current state.
 *
 * The current Employee record is always the latest state.
 * Historical state is captured in employee_versions.
 *
 * `version` is incremented on every attribute change to support
 * optimistic concurrency and stale-event detection.
 */
export const employees = pgTable(
  "employees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    name: varchar("name", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    country: varchar("country", { length: 100 }).notNull(),
    state: varchar("state", { length: 100 }),
    department: varchar("department", { length: 100 }).notNull(),
    employmentType: varchar("employment_type", { length: 50 }).notNull(),
    isManager: boolean("is_manager").notNull().default(false),
    hireDate: date("hire_date").notNull(),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    idxEmployeesCompany: index("idx_employees_company").on(table.companyId),
    idxEmployeesDepartment: index("idx_employees_department").on(table.department),
    idxEmployeesState: index("idx_employees_state").on(table.state),
    idxEmployeesEmploymentType: index("idx_employees_employment_type").on(table.employmentType),
    idxEmployeesCountry: index("idx_employees_country").on(table.country),
  }),
);

/**
 * Employee versions — valid-time historical state.
 *
 * Each version captures the employee's attributes over a half-open interval [validFrom, validTo).
 * validTo = null means "current / no known end date".
 *
 * These are used for point-in-time resolution: given a date,
 * find the employee state that was valid at that date.
 */
export const employeeVersions = pgTable(
  "employee_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id),
    version: integer("version").notNull(),
    validFrom: date("valid_from").notNull(),
    validTo: date("valid_to"),
    country: varchar("country", { length: 100 }).notNull(),
    state: varchar("state", { length: 100 }),
    department: varchar("department", { length: 100 }).notNull(),
    employmentType: varchar("employment_type", { length: 50 }).notNull(),
    isManager: boolean("is_manager").notNull().default(false),
    hireDate: date("hire_date").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    idxEmployeeVersionsEmployee: index("idx_employee_versions_employee").on(table.employeeId),
    idxEmployeeVersionsValidRange: index("idx_employee_versions_valid_range").on(
      table.employeeId,
      table.validFrom,
      table.validTo,
    ),
  }),
);

import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  index,
  integer,
  text,
} from "drizzle-orm/pg-core";
import { employees } from "./employees";

export const temporalJobs = pgTable(
  "temporal_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id),
    triggerAt: timestamp("trigger_at", { withTimezone: true }).notNull(),
    reason: varchar("reason", { length: 500 }).notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
  },
  (table) => ({
    idxTemporalJobsDue: index("idx_temporal_jobs_due").on(table.triggerAt, table.processedAt),
    idxTemporalJobsEmployee: index("idx_temporal_jobs_employee").on(table.employeeId),
  }),
);

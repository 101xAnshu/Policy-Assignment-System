import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { employees } from "./employees";

/**
 * Temporal jobs table.
 * Build Spec §24.
 *
 * Scheduled reconciliation triggers for:
 * - Tenure thresholds (TENURE_AT_LEAST)
 * - Future-dated employee changes
 * - Future rule activations
 *
 * Worker periodically claims due jobs using FOR UPDATE SKIP LOCKED (§25).
 * No external scheduler.
 */
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    idxTemporalJobsDue: index("idx_temporal_jobs_due").on(table.triggerAt, table.processedAt),
    idxTemporalJobsEmployee: index("idx_temporal_jobs_employee").on(table.employeeId),
  }),
);

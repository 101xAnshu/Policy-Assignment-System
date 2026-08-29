import {
  pgTable,
  uuid,
  varchar,
  date,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { companies } from "./companies";

/**
 * Audit events table.
 * Build Spec §28.
 *
 * Every material state change is recorded.
 * effectiveAt and recordedAt are explicitly distinct:
 * - effectiveAt = when the change takes business effect
 * - recordedAt = when the system recorded it (wall clock)
 */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    entityType: varchar("entity_type", { length: 100 }).notNull(),
    entityId: uuid("entity_id").notNull(),
    eventType: varchar("event_type", { length: 100 }).notNull(),
    actor: varchar("actor", { length: 255 }).notNull(),
    effectiveAt: date("effective_at").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
    payload: jsonb("payload").notNull().default({}),
  },
  (table) => ({
    idxAuditEntity: index("idx_audit_entity").on(table.entityType, table.entityId),
    idxAuditCompany: index("idx_audit_company").on(table.companyId),
    idxAuditRecorded: index("idx_audit_recorded").on(table.recordedAt),
  }),
);

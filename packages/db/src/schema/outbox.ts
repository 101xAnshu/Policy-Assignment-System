import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

/**
 * Transactional outbox table.
 * Build Spec §26.
 *
 * Any mutation that requires asynchronous reconciliation writes
 * the domain change + outbox event in one database transaction.
 *
 * Worker consumes the outbox and creates/executes reconciliation work.
 * No Redis/SQS/Kafka.
 */
export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventType: varchar("event_type", { length: 100 }).notNull(),
    entityType: varchar("entity_type", { length: 100 }).notNull(),
    entityId: uuid("entity_id").notNull(),
    payload: jsonb("payload").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (table) => ({
    idxOutboxUnprocessed: index("idx_outbox_unprocessed").on(table.processedAt, table.createdAt),
  }),
);

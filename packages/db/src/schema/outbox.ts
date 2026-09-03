import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  jsonb,
  index,
  integer,
  text,
} from "drizzle-orm/pg-core";

/**
 * Transactional outbox table.
 *
 * Any mutation that requires asynchronous reconciliation writes
 * the domain change + outbox event in one database transaction.
 *
 * Worker consumes the outbox and creates/executes reconciliation work.
 * No Redis/SQS/Kafka.
 *
 * Durability contract (worker crash / poison-event fix pass):
 * - `claimedAt` is a lease, not a state. A crash after claim must not lose
 *   the event: claims older than STALE_CLAIM_TIMEOUT_MS are reclaimable.
 * - `attempts` counts deliveries (incremented atomically on claim, so a
 *   crash still counts). Claims stop after MAX_CLAIM_ATTEMPTS; the row stays
 *   unprocessed (never silently marked completed) for operator inspection.
 * - `lastError` holds the most recent failure message (truncated) for
 *   explainability. It is cleared on success.
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
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
  },
  (table) => ({
    idxOutboxUnprocessed: index("idx_outbox_unprocessed").on(table.processedAt, table.createdAt),
  }),
);

/**
 * Transactional Outbox Event Publisher.
 *
 * Writes outbox events within the same database transaction as domain mutations.
 */

import { outboxEvents } from "../schema/outbox";
import { db } from "../connection";

export type OutboxTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface OutboxEventInput {
  eventType: string;
  entityType: string;
  entityId: string;
  payload?: Record<string, any>;
}

/**
 * Publish an event to the outbox table (supports both transactional and standalone execution).
 */
export async function publishOutboxEvent(
  event: OutboxEventInput,
  tx?: OutboxTransaction,
) {
  const runner = tx ?? db;

  const [inserted] = await runner
    .insert(outboxEvents)
    .values({
      eventType: event.eventType,
      entityType: event.entityType,
      entityId: event.entityId,
      payload: event.payload ?? {},
      processedAt: null,
    })
    .returning();

  return inserted;
}

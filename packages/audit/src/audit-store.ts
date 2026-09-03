/**
 * Audit Store Querying.
 *
 * Query and filter audit trail records with pagination.
 */

import { db, auditEvents, companies } from "@warp/db";
import { eq, and, gte, lte, desc } from "drizzle-orm";

export interface AuditFilters {
  companyId?: string;
  entityType?: string;
  entityId?: string;
  eventType?: string;
  actor?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export async function queryAuditEvents(filters: AuditFilters = {}) {
  const limit = filters.limit ? Math.min(filters.limit, 100) : 50;
  const offset = filters.offset ?? 0;

  const conditions = [];

  if (filters.companyId) {
    conditions.push(eq(auditEvents.companyId, filters.companyId));
  }
  if (filters.entityType) {
    conditions.push(eq(auditEvents.entityType, filters.entityType));
  }
  if (filters.entityId) {
    conditions.push(eq(auditEvents.entityId, filters.entityId));
  }
  if (filters.eventType) {
    conditions.push(eq(auditEvents.eventType, filters.eventType));
  }
  if (filters.actor) {
    conditions.push(eq(auditEvents.actor, filters.actor));
  }
  if (filters.from) {
    conditions.push(gte(auditEvents.effectiveAt, filters.from));
  }
  if (filters.to) {
    conditions.push(lte(auditEvents.effectiveAt, filters.to));
  }

  const query = db
    .select()
    .from(auditEvents)
    .orderBy(desc(auditEvents.effectiveAt), desc(auditEvents.recordedAt))
    .limit(limit)
    .offset(offset);

  const rows =
    conditions.length > 0
      ? await query.where(and(...conditions))
      : await query;

  return {
    count: rows.length,
    offset,
    limit,
    events: rows,
  };
}

export async function getAuditEventById(id: string) {
  const [row] = await db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.id, id));

  return row ?? null;
}

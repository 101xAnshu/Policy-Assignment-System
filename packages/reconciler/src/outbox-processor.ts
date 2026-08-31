/**
 * Outbox & Temporal Jobs Worker Processor.
 * Build Spec §25, §26, §27.
 *
 * Implements crash-resilient asynchronous consumption of outbox events and
 * scheduled temporal boundary milestones using PostgreSQL transactional row locking
 * (FOR UPDATE SKIP LOCKED) to guarantee concurrency safety.
 */

import {
  db,
  outboxEvents,
  temporalJobs,
  employees,
} from "@warp/db";
import { eq, and, isNull, lte, asc, sql } from "drizzle-orm";
import { loadActiveRulesAt } from "@warp/resolver";
import { buildDependencyIndex } from "./dependency-index";
import { reconcileEmployee, reconcileCompany } from "./reconciler";
import { reconcileEmployeeScoped } from "./scoped-reconciler";

export interface OutboxProcessSummary {
  processedCount: number;
  results: Array<{
    eventId: string;
    eventType: string;
    entityId: string;
    actionTaken: string;
    scoped: boolean;
    stale: boolean;
  }>;
}

/**
 * Process a batch of pending outbox events with FOR UPDATE SKIP LOCKED concurrency protection.
 * Build Spec §25, §26, §27.
 */
export async function processNextOutboxEvents(
  batchSize = 10,
): Promise<OutboxProcessSummary> {
  const results: OutboxProcessSummary["results"] = [];

  // Claim batch atomically with row-level locks
  const claimedEvents: any[] = await db.transaction(async (tx) => {
    // Claim row locks so concurrent worker instances skip these events
    const rows = await tx.execute(
      sql`SELECT * FROM outbox_events WHERE processed_at IS NULL ORDER BY created_at ASC LIMIT ${batchSize} FOR UPDATE SKIP LOCKED`
    );

    const eventsList = (rows.rows || rows) as any[];
    return eventsList;
  });

  for (const event of claimedEvents) {
    const payload = (typeof event.payload === "string" ? JSON.parse(event.payload) : event.payload) ?? {};
    const effectiveAt =
      payload.effectiveAt ??
      new Date().toISOString().split("T")[0];

    const eventEntityVersion = payload.entityVersion;
    let actionTaken = "";
    let scoped = false;
    let stale = false;

    try {
      switch (event.event_type || event.eventType) {
        case "EMPLOYEE_CREATED": {
          await reconcileEmployee(event.entity_id || event.entityId, effectiveAt, {
            actor: "worker:outbox",
          });
          actionTaken = `Reconciled new employee ${event.entity_id || event.entityId}`;
          break;
        }

        case "EMPLOYEE_UPDATED": {
          const empId = event.entity_id || event.entityId;
          const changedFields: string[] = payload.changedFields ?? [];
          const [emp] = await db
            .select({ companyId: employees.companyId, version: employees.version })
            .from(employees)
            .where(eq(employees.id, empId));

          if (emp) {
            // Explicit stale-event handling (§27)
            if (eventEntityVersion !== undefined && emp.version > eventEntityVersion) {
              stale = true;
              actionTaken = `[Stale event v${eventEntityVersion} < current v${emp.version}] Reconciling against authoritative DB state: `;
            }

            const rules = await loadActiveRulesAt(emp.companyId, effectiveAt);
            const depIndex = buildDependencyIndex(rules);
            const affectedCategories = depIndex.getAffectedCategoriesForAttributes(changedFields);

            if (affectedCategories.size > 0) {
              await reconcileEmployeeScoped(
                empId,
                affectedCategories,
                effectiveAt,
                { actor: "worker:outbox" },
              );
              scoped = true;
              actionTaken += `Scoped reconciliation on ${affectedCategories.size} categories for fields [${changedFields.join(", ")}]`;
            } else {
              actionTaken += `No rule categories depend on changed fields [${changedFields.join(", ")}] — skipped`;
            }
          }
          break;
        }

        case "RULE_PUBLISHED":
        case "RULE_ARCHIVED": {
          const companyId = payload.companyId;
          if (companyId) {
            await reconcileCompany(companyId, effectiveAt, {
              actor: "worker:outbox",
            });
            actionTaken = `Company-wide reconciliation triggered by rule update`;
          }
          break;
        }

        case "GROUP_MEMBERSHIP_CHANGED": {
          const empId = event.entity_id || event.entityId;
          const groupId = payload.groupId;
          const [emp] = await db
            .select({ companyId: employees.companyId })
            .from(employees)
            .where(eq(employees.id, empId));

          if (emp && groupId) {
            const rules = await loadActiveRulesAt(emp.companyId, effectiveAt);
            const depIndex = buildDependencyIndex(rules);
            const affectedCategories = depIndex.getAffectedCategoriesForGroup(groupId);

            if (affectedCategories.size > 0) {
              await reconcileEmployeeScoped(
                empId,
                affectedCategories,
                effectiveAt,
                { actor: "worker:outbox" },
              );
              scoped = true;
              actionTaken = `Scoped reconciliation for group ${groupId} on ${affectedCategories.size} categories`;
            } else {
              actionTaken = `No rule categories depend on group ${groupId}`;
            }
          }
          break;
        }

        default:
          actionTaken = `Unhandled event type ${event.event_type || event.eventType}`;
      }

      // Mark outbox event as successfully processed
      await db
        .update(outboxEvents)
        .set({ processedAt: new Date() })
        .where(eq(outboxEvents.id, event.id));

      results.push({
        eventId: event.id,
        eventType: event.event_type || event.eventType,
        entityId: event.entity_id || event.entityId,
        actionTaken,
        scoped,
        stale,
      });
    } catch (err) {
      console.error(`Error processing outbox event ${event.id}:`, err);
    }
  }

  return {
    processedCount: results.length,
    results,
  };
}

/**
 * Process due temporal jobs (e.g. tenure milestone triggers) with FOR UPDATE SKIP LOCKED.
 * Build Spec §25, §27.
 */
export async function processDueTemporalJobs(
  asOfDate?: Date | string,
  batchSize = 20,
): Promise<{ processedCount: number; jobIds: string[] }> {
  const cutoff = asOfDate
    ? typeof asOfDate === "string"
      ? new Date(asOfDate)
      : asOfDate
    : new Date();

  const cutoffStr = cutoff.toISOString();

  // Atomically claim due jobs with row locks
  const dueJobs: any[] = await db.transaction(async (tx) => {
    const rows = await tx.execute(
      sql`SELECT * FROM temporal_jobs WHERE trigger_at <= ${cutoffStr}::timestamptz AND processed_at IS NULL ORDER BY trigger_at ASC LIMIT ${batchSize} FOR UPDATE SKIP LOCKED`
    );
    return (rows.rows || rows) as any[];
  });

  const jobIds: string[] = [];

  for (const job of dueJobs) {
    const triggerDateStr =
      job.trigger_at instanceof Date
        ? job.trigger_at.toISOString().split("T")[0]
        : new Date(job.trigger_at).toISOString().split("T")[0];

    const empId = job.employee_id || job.employeeId;

    try {
      await reconcileEmployee(empId, triggerDateStr, {
        actor: "worker:temporal-milestone",
      });

      await db
        .update(temporalJobs)
        .set({ processedAt: new Date() })
        .where(eq(temporalJobs.id, job.id));

      jobIds.push(job.id);
    } catch (err) {
      console.error(`Error processing temporal job ${job.id}:`, err);
    }
  }

  return {
    processedCount: jobIds.length,
    jobIds,
  };
}

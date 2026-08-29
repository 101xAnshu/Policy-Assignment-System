/**
 * Outbox & Temporal Jobs Worker Processor.
 * Build Spec §25, §26, §27.
 *
 * Implements crash-resilient asynchronous consumption of outbox events and
 * scheduled temporal boundary milestones using PostgreSQL-native coordination.
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
  }>;
}

/**
 * Process a batch of pending outbox events.
 * Build Spec §25, §26.
 */
export async function processNextOutboxEvents(
  batchSize = 10,
): Promise<OutboxProcessSummary> {
  // Query pending events in FIFO order
  const pending = await db
    .select()
    .from(outboxEvents)
    .where(isNull(outboxEvents.processedAt))
    .orderBy(asc(outboxEvents.createdAt))
    .limit(batchSize);

  const results: OutboxProcessSummary["results"] = [];

  for (const event of pending) {
    const payload = (event.payload as Record<string, any>) ?? {};
    const effectiveAt =
      payload.effectiveAt ??
      new Date().toISOString().split("T")[0];

    let actionTaken = "";
    let scoped = false;

    try {
      switch (event.eventType) {
        case "EMPLOYEE_CREATED": {
          await reconcileEmployee(event.entityId, effectiveAt, {
            actor: "worker:outbox",
          });
          actionTaken = `Reconciled new employee ${event.entityId}`;
          break;
        }

        case "EMPLOYEE_UPDATED": {
          const changedFields: string[] = payload.changedFields ?? [];
          const [emp] = await db
            .select({ companyId: employees.companyId })
            .from(employees)
            .where(eq(employees.id, event.entityId));

          if (emp) {
            const rules = await loadActiveRulesAt(emp.companyId, effectiveAt);
            const depIndex = buildDependencyIndex(rules);
            const affectedCategories = depIndex.getAffectedCategoriesForAttributes(changedFields);

            if (affectedCategories.size > 0) {
              await reconcileEmployeeScoped(
                event.entityId,
                affectedCategories,
                effectiveAt,
                { actor: "worker:outbox" },
              );
              scoped = true;
              actionTaken = `Scoped reconciliation on ${affectedCategories.size} categories for fields [${changedFields.join(", ")}]`;
            } else {
              actionTaken = `No rule categories depend on changed fields [${changedFields.join(", ")}] — skipped`;
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
          const groupId = payload.groupId;
          const [emp] = await db
            .select({ companyId: employees.companyId })
            .from(employees)
            .where(eq(employees.id, event.entityId));

          if (emp && groupId) {
            const rules = await loadActiveRulesAt(emp.companyId, effectiveAt);
            const depIndex = buildDependencyIndex(rules);
            const affectedCategories = depIndex.getAffectedCategoriesForGroup(groupId);

            if (affectedCategories.size > 0) {
              await reconcileEmployeeScoped(
                event.entityId,
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
          actionTaken = `Unhandled event type ${event.eventType}`;
      }

      // Mark outbox event as successfully processed
      await db
        .update(outboxEvents)
        .set({ processedAt: new Date() })
        .where(eq(outboxEvents.id, event.id));

      results.push({
        eventId: event.id,
        eventType: event.eventType,
        entityId: event.entityId,
        actionTaken,
        scoped,
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
 * Process due temporal jobs (e.g. tenure milestone triggers).
 * Build Spec §27.
 */
export async function processDueTemporalJobs(
  asOfDate?: Date | string,
): Promise<{ processedCount: number; jobIds: string[] }> {
  const cutoff = asOfDate
    ? typeof asOfDate === "string"
      ? new Date(asOfDate)
      : asOfDate
    : new Date();

  const dueJobs = await db
    .select()
    .from(temporalJobs)
    .where(
      and(
        lte(temporalJobs.triggerAt, cutoff),
        isNull(temporalJobs.processedAt),
      ),
    )
    .orderBy(asc(temporalJobs.triggerAt));

  const jobIds: string[] = [];

  for (const job of dueJobs) {
    const triggerDateStr = job.triggerAt.toISOString().split("T")[0];

    try {
      await reconcileEmployee(job.employeeId, triggerDateStr, {
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

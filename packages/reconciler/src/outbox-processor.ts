/**
 * Outbox & Temporal Jobs Worker Processor.
 *
 * Implements crash-resilient asynchronous consumption of outbox events and
 * scheduled temporal boundary milestones using PostgreSQL transactional row locking
 * (FOR UPDATE SKIP LOCKED) to guarantee concurrency safety.
 *
 * Durability contract (final correctness fix pass):
 * - `claimed_at` is a lease, not terminal state. Claims older than
 *   `staleAfterMs` (default STALE_CLAIM_TIMEOUT_MS) are reclaimable, so a
 *   worker crash after claim never permanently loses the event.
 * - `attempts` is incremented atomically on claim (so crashes count too).
 *   Rows with `attempts >= maxAttempts` are excluded from claims and stay
 *   UNPROCESSED (never silently marked completed) for operator inspection.
 * - On processing failure the claim is released (`claimed_at = NULL`) and
 *   `last_error` is recorded, so the work remains retryable. Success sets
 *   `processed_at` and clears `last_error`.
 * - Batch loops isolate failures: one poison event / employee / job never
 *   aborts the rest of the batch. Company reconciliation isolates per
 *   employee (see reconciler.ts) and a partial company failure fails the
 *   triggering RULE event so it retries (successes are idempotent no-ops).
 *
 * This is bounded at-least-once delivery on top of Postgres only.
 * No Kafka / Redis / SQS.
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

/** Default lease age after which a claim is considered stale (crashed worker). */
export const STALE_CLAIM_TIMEOUT_MS = 5 * 60 * 1000;
/** Default bound on deliveries per row before it is parked for inspection. */
export const MAX_CLAIM_ATTEMPTS = 10;
/** Max chars stored in `last_error`. */
const MAX_ERROR_CHARS = 2000;

function truncateError(err: unknown): string {
  const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
  return message.slice(0, MAX_ERROR_CHARS);
}

export interface OutboxProcessSummary {
  processedCount: number;
  failedCount: number;
  results: Array<{
    eventId: string;
    eventType: string;
    entityId: string;
    actionTaken: string;
    scoped: boolean;
    stale: boolean;
    reclaimed: boolean;
    attempts: number;
  }>;
  failures: Array<{
    eventId: string;
    eventType: string;
    entityId: string;
    error: string;
    attempts: number;
  }>;
}

export interface OutboxProcessOptions {
  /** Override stale-lease age (tests use small values or backdate claimed_at). */
  staleAfterMs?: number;
  /** Override max deliveries before parking. */
  maxAttempts?: number;
}

/**
 * Process a batch of pending outbox events with FOR UPDATE SKIP LOCKED concurrency protection.
 */
export async function processNextOutboxEvents(
  batchSize = 10,
  options?: OutboxProcessOptions,
): Promise<OutboxProcessSummary> {
  const staleAfterMs = options?.staleAfterMs ?? STALE_CLAIM_TIMEOUT_MS;
  const maxAttempts = options?.maxAttempts ?? MAX_CLAIM_ATTEMPTS;
  const staleCutoff = new Date(Date.now() - staleAfterMs).toISOString();
  const results: OutboxProcessSummary["results"] = [];
  const failures: OutboxProcessSummary["failures"] = [];

  // Claim batch atomically: SELECT FOR UPDATE SKIP LOCKED + mark claimed_at in one transaction.
  // Reclaimable: processed_at IS NULL AND (claimed_at IS NULL OR claimed_at < staleCutoff)
  // Bounded: COALESCE(attempts,0) < maxAttempts. Attempts increment on claim so crashes count.
  const claimedEvents: any[] = await db.transaction(async (tx) => {
    const rows = (await tx.execute(
      sql`SELECT * FROM outbox_events WHERE processed_at IS NULL AND (claimed_at IS NULL OR claimed_at < ${staleCutoff}::timestamptz) AND COALESCE(attempts, 0) < ${maxAttempts} ORDER BY created_at ASC LIMIT ${batchSize} FOR UPDATE SKIP LOCKED`
    )) as any;

    const eventsList = (rows.rows ?? rows) as any[];

    // Atomically mark claimed + count delivery before releasing lock
    for (const evt of eventsList) {
      await tx.execute(
        sql`UPDATE outbox_events SET claimed_at = NOW(), attempts = COALESCE(attempts, 0) + 1 WHERE id = ${evt.id}`
      );
    }

    return eventsList;
  });

  for (const event of claimedEvents) {
    const payload = (typeof event.payload === "string" ? JSON.parse(event.payload) : event.payload) ?? {};
    const effectiveAt =
      payload.effectiveAt ??
      new Date().toISOString().split("T")[0];

    const eventEntityVersion = payload.entityVersion;
    const eventId = event.id as string;
    const eventType = (event.event_type || event.eventType) as string;
    const entityId = (event.entity_id || event.entityId) as string;
    const reclaimed = event.claimed_at != null;
    const attempts = (event.attempts ?? 0) + 1;
    let actionTaken = "";
    let scoped = false;
    let stale = false;

    try {
      switch (eventType) {
        case "EMPLOYEE_CREATED": {
          await reconcileEmployee(entityId, effectiveAt, {
            actor: "worker:outbox",
          });
          actionTaken = `Reconciled new employee ${entityId}`;
          break;
        }

        case "EMPLOYEE_UPDATED": {
          const empId = entityId;
          const changedFields: string[] = payload.changedFields ?? [];
          const [emp] = await db
            .select({ companyId: employees.companyId, version: employees.version })
            .from(employees)
            .where(eq(employees.id, empId));

          if (emp) {
            // Explicit stale-event handling
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
            const companyResult = await reconcileCompany(companyId, effectiveAt, {
              actor: "worker:outbox",
            });
            if (companyResult.failedCount > 0) {
              throw new Error(
                `Company reconciliation had ${companyResult.failedCount}/${companyResult.totalEmployees} employee failures: ${companyResult.failures.map((f) => `${f.employeeId}: ${f.error}`).join("; ").slice(0, 1500)}`,
              );
            }
            actionTaken = `Company-wide reconciliation triggered by rule update`;
          }
          break;
        }

        case "GROUP_MEMBERSHIP_CHANGED": {
          const empId = entityId;
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
          actionTaken = `Unhandled event type ${eventType}`;
      }

      // Mark outbox event as successfully processed; clear last error.
      await db
        .update(outboxEvents)
        .set({ processedAt: new Date(), lastError: null })
        .where(eq(outboxEvents.id, eventId));

      results.push({
        eventId,
        eventType,
        entityId,
        actionTaken,
        scoped,
        stale,
        reclaimed,
        attempts,
      });
    } catch (err) {
      // Release the lease so the event remains retryable; record the error.
      // Never mark failed work as processed.
      const message = truncateError(err);
      console.error(`Error processing outbox event ${eventId}:`, message);
      await db
        .update(outboxEvents)
        .set({ claimedAt: null, lastError: message })
        .where(eq(outboxEvents.id, eventId));
      failures.push({ eventId, eventType, entityId, error: message, attempts });
    }
  }

  return {
    processedCount: results.length,
    failedCount: failures.length,
    results,
    failures,
  };
}


export interface TemporalProcessSummary {
  processedCount: number;
  failedCount: number;
  jobIds: string[];
  failures: Array<{ jobId: string; employeeId: string; error: string; attempts: number }>;
}

export interface TemporalProcessOptions extends OutboxProcessOptions {
  /** Test-only deterministic failure injection (durability tests). */
  failForEmployeeIds?: string[];
}

/**
 * Process due temporal jobs (e.g. tenure milestone triggers) with FOR UPDATE SKIP LOCKED.
 * Same durability contract as outbox events: stale-claim reclaim, bounded
 * attempts, per-job isolation, lease release on failure.
 */
export async function processDueTemporalJobs(
  asOfDate?: Date | string,
  batchSize = 20,
  options?: TemporalProcessOptions,
): Promise<TemporalProcessSummary> {
  const staleAfterMs = options?.staleAfterMs ?? STALE_CLAIM_TIMEOUT_MS;
  const maxAttempts = options?.maxAttempts ?? MAX_CLAIM_ATTEMPTS;
  const failSet = new Set(options?.failForEmployeeIds ?? []);
  const cutoff = asOfDate
    ? typeof asOfDate === "string"
      ? new Date(asOfDate)
      : asOfDate
    : new Date();

  const cutoffStr = cutoff.toISOString();
  const staleCutoff = new Date(Date.now() - staleAfterMs).toISOString();

  // Atomically claim due jobs: SELECT FOR UPDATE SKIP LOCKED + mark claimed_at in one transaction.
  const dueJobs: any[] = await db.transaction(async (tx) => {
    const rows = (await tx.execute(
      sql`SELECT * FROM temporal_jobs WHERE trigger_at <= ${cutoffStr}::timestamptz AND processed_at IS NULL AND (claimed_at IS NULL OR claimed_at < ${staleCutoff}::timestamptz) AND COALESCE(attempts, 0) < ${maxAttempts} ORDER BY trigger_at ASC LIMIT ${batchSize} FOR UPDATE SKIP LOCKED`
    )) as any;
    const jobsList = (rows.rows ?? rows) as any[];

    // Atomically mark claimed + count delivery before releasing lock
    for (const job of jobsList) {
      await tx.execute(
        sql`UPDATE temporal_jobs SET claimed_at = NOW(), attempts = COALESCE(attempts, 0) + 1 WHERE id = ${job.id}`
      );
    }

    return jobsList;
  });

  const jobIds: string[] = [];
  const failures: TemporalProcessSummary["failures"] = [];

  for (const job of dueJobs) {
    const triggerDateStr =
      job.trigger_at instanceof Date
        ? job.trigger_at.toISOString().split("T")[0]
        : new Date(job.trigger_at).toISOString().split("T")[0];

    const empId = job.employee_id || job.employeeId;
    const jobId = job.id as string;
    const attempts = (job.attempts ?? 0) + 1;

    try {
      if (failSet.has(empId)) {
        throw new Error(`Injected failure for durability test (temporal job ${jobId})`);
      }
      await reconcileEmployee(empId, triggerDateStr, {
        actor: "worker:temporal-milestone",
      });

      await db
        .update(temporalJobs)
        .set({ processedAt: new Date(), lastError: null })
        .where(eq(temporalJobs.id, jobId));

      jobIds.push(jobId);
    } catch (err) {
      const message = truncateError(err);
      console.error(`Error processing temporal job ${jobId}:`, message);
      await db
        .update(temporalJobs)
        .set({ claimedAt: null, lastError: message })
        .where(eq(temporalJobs.id, jobId));
      failures.push({ jobId, employeeId: empId, error: message, attempts });
    }
  }

  return {
    processedCount: jobIds.length,
    failedCount: failures.length,
    jobIds,
    failures,
  };
}

/**
 * Worker durability tests: crash recovery, bounded retry, isolation, replay.
 *
 * Covers the final correctness fix pass without touching resolver semantics:
 * 1. Worker crash after claim (stale claimed_at) is reclaimed and processed.
 * 2. Failing (poison) outbox events release the lease, remain retryable,
 *    record attempts/lastError, and park after maxAttempts (never silently completed).
 * 3. One poison event does not block valid events in the same batch.
 * 4. reconcileCompany isolates per-employee failure; eventual retry converges.
 * 5. Idempotent replay: re-processing converges to zero changes, no duplicates.
 * 6. Temporal jobs have equivalent reclaim / retry / isolation semantics.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql, IDS, seed, reset, db, outboxEvents, temporalJobs, getActiveAssignmentsAt } from "@warp/db";
import {
  processNextOutboxEvents,
  processDueTemporalJobs,
  reconcileCompany,
  reconcileEmployee,
} from "@warp/reconciler";
import { publishOutboxEvent } from "@warp/db";
import { eq, isNull } from "drizzle-orm";

const POISON_EMPLOYEE_ID = "e0000000-0000-0000-0000-000000009999";

beforeAll(async () => {
  await reset(false);
  await seed(false);
});

afterAll(async () => {
  await sql.end();
});

describe("Outbox crash recovery & bounded retry", () => {
  it("reclaims a stale-claimed event after simulated worker crash", async () => {
    // Arrange: converge Alex, then create a real state-change event.
    await reconcileEmployee(IDS.alex, "2024-08-28");
    await publishOutboxEvent({
      eventType: "EMPLOYEE_UPDATED",
      entityType: "EMPLOYEE",
      entityId: IDS.alex,
      payload: { changedFields: ["state"], effectiveAt: "2024-08-28", entityVersion: 1 },
    });

    const [pending] = await db.select().from(outboxEvents).where(isNull(outboxEvents.processedAt));
    expect(pending).toBeDefined();

    // Simulate crash: claimed but never processed (10 min old lease).
    await sql`UPDATE outbox_events SET claimed_at = NOW() - INTERVAL '10 minutes', attempts = 1 WHERE id = ${pending.id}`;

    // A naive worker (claimed_at IS NULL only) would lose this event.
    // Our worker must reclaim it because the lease is stale.
    const summary = await processNextOutboxEvents(10);
    expect(summary.processedCount).toBeGreaterThanOrEqual(1);
    expect(summary.failedCount).toBe(0);
    const reclaimed = summary.results.find((r) => r.eventId === pending.id);
    expect(reclaimed).toBeDefined();
    expect(reclaimed!.reclaimed).toBe(true);

    const [row] = await db.select().from(outboxEvents).where(eq(outboxEvents.id, pending.id));
    expect(row.processedAt).not.toBeNull();
    expect(row.lastError).toBeNull();
  });

  it("releases the lease on failure, retries, and parks after maxAttempts without completing", async () => {
    // Arrange: poison event referencing a nonexistent employee -> reconcile throws.
    const poison = await publishOutboxEvent({
      eventType: "EMPLOYEE_CREATED",
      entityType: "EMPLOYEE",
      entityId: POISON_EMPLOYEE_ID,
      payload: { effectiveAt: "2024-08-28" },
    });

    // Attempt 1: fails but remains retryable (not processed, lease released).
    const first = await processNextOutboxEvents(10);
    expect(first.failures.find((f) => f.eventId === poison.id)).toBeDefined();
    let [row] = await db.select().from(outboxEvents).where(eq(outboxEvents.id, poison.id));
    expect(row.processedAt).toBeNull();
    expect(row.claimedAt).toBeNull();
    expect(row.attempts).toBe(1);
    expect(row.lastError).toContain("not found");

    // Attempt 2: retryable, increments attempts.
    const second = await processNextOutboxEvents(10);
    expect(second.failures.find((f) => f.eventId === poison.id)).toBeDefined();
    [row] = await db.select().from(outboxEvents).where(eq(outboxEvents.id, poison.id));
    expect(row.processedAt).toBeNull();
    expect(row.attempts).toBe(2);

    // Bounded: with maxAttempts=2 the parked row is excluded from claims.
    const parked = await processNextOutboxEvents(10, { maxAttempts: 2 });
    expect(parked.results.find((r) => r.eventId === poison.id)).toBeUndefined();
    expect(parked.failures.find((f) => f.eventId === poison.id)).toBeUndefined();
    [row] = await db.select().from(outboxEvents).where(eq(outboxEvents.id, poison.id));
    // Never silently marked completed.
    expect(row.processedAt).toBeNull();

    // Cleanup so later tests are unaffected (parked rows are excluded anyway).
    await sql`DELETE FROM outbox_events WHERE id = ${poison.id}`;
  });

  it("does not let one poison event block valid events in the same batch", async () => {
    const poison = await publishOutboxEvent({
      eventType: "EMPLOYEE_CREATED",
      entityType: "EMPLOYEE",
      entityId: POISON_EMPLOYEE_ID,
      payload: { effectiveAt: "2024-08-28" },
    });
    await publishOutboxEvent({
      eventType: "EMPLOYEE_UPDATED",
      entityType: "EMPLOYEE",
      entityId: IDS.alex,
      payload: { changedFields: ["state"], effectiveAt: "2024-08-28", entityVersion: 1 },
    });

    const summary = await processNextOutboxEvents(10);
    // Both outcomes observed in one batch: isolation, not abort.
    expect(summary.failedCount).toBe(1);
    expect(summary.processedCount).toBe(1);
    expect(summary.failures[0].eventId).toBe(poison.id);
    expect(summary.results[0].entityId).toBe(IDS.alex);

    const [poisonRow] = await db.select().from(outboxEvents).where(eq(outboxEvents.id, poison.id));
    expect(poisonRow.processedAt).toBeNull();
    expect(poisonRow.claimedAt).toBeNull();

    await sql`DELETE FROM outbox_events WHERE id = ${poison.id}`;
    // Drain the valid event if it somehow remains (it should be processed).
    await sql`DELETE FROM outbox_events WHERE processed_at IS NULL`;
  });
});

describe("Company-loop per-employee isolation & eventual retry", () => {
  it("continues past one employee failure and converges on retry (idempotent)", async () => {
    // Isolate: Sarah fails, other 3 must still succeed.
    const partial = await reconcileCompany(IDS.acme, "2024-08-28", {
      actor: "test:isolation",
      failForEmployeeIds: [IDS.sarah],
    });
    expect(partial.totalEmployees).toBe(4);
    expect(partial.failedCount).toBe(1);
    expect(partial.failures[0].employeeId).toBe(IDS.sarah);
    expect(partial.employeeResults).toHaveLength(3);

    // Eventual retry without the fault converges everyone, including Sarah.
    const retry = await reconcileCompany(IDS.acme, "2024-08-28", { actor: "test:retry" });
    expect(retry.failedCount).toBe(0);
    expect(retry.employeeResults).toHaveLength(4);

    const sarah = await getActiveAssignmentsAt(IDS.sarah, "2024-08-28");
    expect(sarah.length).toBeGreaterThan(0);

    // Idempotent replay: converged state yields zero changes.
    const replay = await reconcileCompany(IDS.acme, "2024-08-28", { actor: "test:replay" });
    expect(replay.failedCount).toBe(0);
    expect(replay.totalAdded).toBe(0);
    expect(replay.totalRevoked).toBe(0);
    expect(replay.totalUpdated).toBe(0);
  });

  it("re-processing outbox when idle is a no-op (no duplicates)", async () => {
    await sql`DELETE FROM outbox_events WHERE processed_at IS NULL`;
    const before = await getActiveAssignmentsAt(IDS.sarah, "2024-08-28");
    const summary = await processNextOutboxEvents(10);
    expect(summary.processedCount).toBe(0);
    expect(summary.failedCount).toBe(0);
    const after = await getActiveAssignmentsAt(IDS.sarah, "2024-08-28");
    expect(after.map((a) => a.policyId).sort()).toEqual(before.map((a) => a.policyId).sort());
  });
});

describe("Temporal job reclaim / retry / isolation", () => {
  it("reclaims a stale-claimed temporal job after simulated crash", async () => {
    await reconcileEmployee(IDS.sarah, "2024-08-28");
    const jobs = await db
      .select()
      .from(temporalJobs)
      .where(eq(temporalJobs.employeeId, IDS.sarah));
    expect(jobs.length).toBeGreaterThanOrEqual(1);
    const target = jobs[0];

    await sql`UPDATE temporal_jobs SET claimed_at = NOW() - INTERVAL '10 minutes', attempts = 1 WHERE id = ${target.id}`;

    const summary = await processDueTemporalJobs("2026-08-28T00:00:00.000Z", 20);
    expect(summary.jobIds).toContain(target.id);
    expect(summary.failedCount).toBe(0);

    const [row] = await db.select().from(temporalJobs).where(eq(temporalJobs.id, target.id));
    expect(row.processedAt).not.toBeNull();

    const sarah2026 = await getActiveAssignmentsAt(IDS.sarah, "2026-08-28");
    expect(sarah2026.map((a) => a.policyId)).toContain(IDS.extendedVacation);
  });

  it("isolates one failing temporal job and retries it successfully", async () => {
    // Arrange two due jobs directly (FK-safe: both employees exist).
    const [alexJob] = await db
      .insert(temporalJobs)
      .values({
        employeeId: IDS.alex,
        triggerAt: new Date("2025-06-01T00:00:00.000Z"),
        reason: "durability test alex",
      })
      .returning();
    const [sarahJob] = await db
      .insert(temporalJobs)
      .values({
        employeeId: IDS.sarah,
        triggerAt: new Date("2025-06-01T00:00:00.000Z"),
        reason: "durability test sarah",
      })
      .returning();

    const partial = await processDueTemporalJobs("2025-06-01T00:00:00.000Z", 20, {
      failForEmployeeIds: [IDS.sarah],
    });
    expect(partial.jobIds).toContain(alexJob.id);
    expect(partial.failures.find((f) => f.jobId === sarahJob.id)).toBeDefined();
    expect(partial.failedCount).toBe(1);

    const [sarahRow] = await db.select().from(temporalJobs).where(eq(temporalJobs.id, sarahJob.id));
    expect(sarahRow.processedAt).toBeNull();
    expect(sarahRow.claimedAt).toBeNull();
    expect(sarahRow.attempts).toBe(1);
    expect(sarahRow.lastError).toContain("Injected failure");

    // Eventual retry without the fault succeeds (no new job needed).
    const retry = await processDueTemporalJobs("2025-06-01T00:00:00.000Z", 20);
    expect(retry.failures).toHaveLength(0);
    expect(retry.jobIds).toContain(sarahJob.id);
    const [retried] = await db.select().from(temporalJobs).where(eq(temporalJobs.id, sarahJob.id));
    expect(retried.processedAt).not.toBeNull();
  });
});

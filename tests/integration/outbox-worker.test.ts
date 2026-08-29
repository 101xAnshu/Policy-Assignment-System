/**
 * Integration tests for Outbox Pattern & Background Worker.
 * Build Spec §25, §26, §27, §42, §43.
 *
 * Tests:
 * 1. Mutations write events to outbox_events in the same transaction.
 * 2. Background worker consumes outbox events and performs scoped incremental reconciliation.
 * 3. Alex Morgan Relocation to California (Demo Scenario Step 3):
 *    - Moving Alex from NY to CA triggers scoped reconciliation.
 *    - Upgrades Standard Vacation -> California Vacation.
 *    - Adds California Workplace Training.
 *    - Leaves all other categories untouched.
 * 4. Asynchronous Temporal Milestone execution (Demo Scenario Step 4):
 *    - Reconciles Sarah's tenure job at 24 months.
 *    - Promotes to Extended Vacation.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import { createApp } from "../../apps/web/src/app";
import {
  sql,
  IDS,
  seed,
  reset,
  db,
  outboxEvents,
  policyAssignments,
  temporalJobs,
  getActiveAssignmentsAt,
} from "@warp/db";
import { eq, and, isNull } from "drizzle-orm";

let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
  await reset(false);
  await seed(false);

  return new Promise<void>((resolve) => {
    const app = createApp();
    server = app.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        baseUrl = `http://localhost:${addr.port}`;
      }
      resolve();
    });
  });
});

afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  await sql.end();
});

describe("Outbox Pattern & Background Worker", () => {
  it("PATCH /api/employees/:id writes an outbox event in the same transaction", async () => {
    // Reconcile Alex Morgan's initial NY state first
    await fetch(`${baseUrl}/api/employees/${IDS.alex}/reconcile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ at: "2024-08-28" }),
    });

    const initialAssignments = await getActiveAssignmentsAt(IDS.alex, "2024-08-28");
    const initialPolicyIds = initialAssignments.map((a) => a.policyId);
    expect(initialPolicyIds).toContain(IDS.standardVacation);
    expect(initialPolicyIds).not.toContain(IDS.caVacation);
    expect(initialPolicyIds).not.toContain(IDS.caWorkplaceTraining);

    // Update Alex Morgan: move to California on 2025-01-15
    const patchRes = await fetch(`${baseUrl}/api/employees/${IDS.alex}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        state: "California",
        effectiveAt: "2025-01-15",
      }),
    });

    expect(patchRes.status).toBe(200);

    // Verify outbox event exists in database
    const pendingEvents = await db
      .select()
      .from(outboxEvents)
      .where(
        and(
          eq(outboxEvents.entityId, IDS.alex),
          isNull(outboxEvents.processedAt),
        ),
      );

    expect(pendingEvents).toHaveLength(1);
    expect(pendingEvents[0].eventType).toBe("EMPLOYEE_UPDATED");
    const payload = pendingEvents[0].payload as any;
    expect(payload.changedFields).toContain("state");
    expect(payload.effectiveAt).toBe("2025-01-15");
  });

  it("POST /api/worker/process-outbox consumes event and runs scoped incremental reconciliation", async () => {
    // Trigger worker processing
    const workerRes = await fetch(`${baseUrl}/api/worker/process-outbox`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batchSize: 10 }),
    });

    expect(workerRes.status).toBe(200);
    const workerSummary = (await workerRes.json()) as any;

    expect(workerSummary.processedCount).toBeGreaterThanOrEqual(1);
    const alexEventResult = workerSummary.results.find(
      (r: any) => r.entityId === IDS.alex,
    );
    expect(alexEventResult).toBeDefined();
    expect(alexEventResult.scoped).toBe(true);
    expect(alexEventResult.actionTaken).toContain("Scoped reconciliation");

    // Check Alex's assignments after relocation (as of 2025-01-15):
    const newAssignments = await getActiveAssignmentsAt(IDS.alex, "2025-01-15");
    const newPolicyIds = newAssignments.map((a) => a.policyId);

    // 1. Vacation upgraded from Standard to California Vacation
    expect(newPolicyIds).toContain(IDS.caVacation);
    expect(newPolicyIds).not.toContain(IDS.standardVacation);

    // 2. CA Workplace Training added
    expect(newPolicyIds).toContain(IDS.caWorkplaceTraining);

    // 3. Unaffected policies remain intact
    expect(newPolicyIds).toContain(IDS.standardSick);
    expect(newPolicyIds).toContain(IDS.usBiweekly);
    expect(newPolicyIds).toContain(IDS.standardHealthcare);
    expect(newPolicyIds).toContain(IDS.engineeringStipend);
    expect(newPolicyIds).toContain(IDS.github);
    expect(newPolicyIds).toContain(IDS.slack);
    expect(newPolicyIds).toContain(IDS.notion);
  });

  it("POST /api/worker/process-temporal triggers due tenure milestone jobs", async () => {
    // Reconcile Sarah Chen on hire date (2024-08-28), which schedules a temporal job for 2026-08-28
    await fetch(`${baseUrl}/api/employees/${IDS.sarah}/reconcile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ at: "2024-08-28" }),
    });

    // Check temporal_jobs table
    const jobs = await db
      .select()
      .from(temporalJobs)
      .where(
        and(
          eq(temporalJobs.employeeId, IDS.sarah),
          isNull(temporalJobs.processedAt),
        ),
      );
    expect(jobs.length).toBeGreaterThanOrEqual(1);

    // Process temporal jobs as of 2026-08-28 (Sarah's 2-year anniversary)
    const temporalRes = await fetch(`${baseUrl}/api/worker/process-temporal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asOf: "2026-08-28T00:00:00.000Z" }),
    });

    expect(temporalRes.status).toBe(200);
    const temporalSummary = (await temporalRes.json()) as any;
    expect(temporalSummary.processedCount).toBeGreaterThanOrEqual(1);

    // Verify Sarah is now on Extended Vacation
    const sarahAssignments2026 = await getActiveAssignmentsAt(
      IDS.sarah,
      "2026-08-28",
    );
    const sarahPolicyIds = sarahAssignments2026.map((a) => a.policyId);
    expect(sarahPolicyIds).toContain(IDS.extendedVacation);
    expect(sarahPolicyIds).not.toContain(IDS.caVacation);
  });
});

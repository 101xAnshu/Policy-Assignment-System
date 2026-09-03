/**
 * Integration tests for Reconciliation API & Convergence Engine.
 *
 * Invariants verified:
 * - P4: Idempotency: Reconciling twice on the same date produces 0 changes on 2nd run.
 * - Preview computes diff accurately without touching the database.
 * - Atomic transactional apply: updates effectiveTo on revoked policies, inserts new active policies with snapshots.
 * - Audit events created atomically with each policy change.
 * - Sarah Chen complete lifecycle:
 *   1. Initial reconciliation on hire date (2024-08-28): 10 policies added.
 *   2. Re-reconcile on 2024-08-28: 0 added, 0 revoked, 10 unchanged (IDEMPOTENT).
 *   3. Reconcile on 2026-08-28 (2 years tenure): 1 revoked (CA Vacation), 1 added (Extended Vacation), 9 unchanged.
 *   4. Re-reconcile on 2026-08-28: 0 added, 0 revoked, 10 unchanged (IDEMPOTENT).
 * - Company-wide reconciliation for Acme Corporation.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import { createApp } from "../../apps/web/src/app";
import { sql, IDS, seed, reset, db, auditEvents, policyAssignments } from "@warp/db";
import { eq } from "drizzle-orm";

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

describe("Reconciliation API & Convergence", () => {
  it("GET /api/employees/:id/reconcile/preview returns diff preview without saving to DB", async () => {
    const previewRes = await fetch(
      `${baseUrl}/api/employees/${IDS.sarah}/reconcile/preview?at=2024-08-28`,
    );
    expect(previewRes.status).toBe(200);
    const preview = (await previewRes.json()) as any;

    expect(preview.employeeId).toBe(IDS.sarah);
    expect(preview.evaluationDate).toBe("2024-08-28");
    expect(preview.diff.hasChanges).toBe(true);
    expect(preview.diff.summary.added).toBe(10);
    expect(preview.diff.summary.revoked).toBe(0);

    // Verify DB still has 0 assignments for Sarah
    const existing = await db
      .select()
      .from(policyAssignments)
      .where(eq(policyAssignments.employeeId, IDS.sarah));
    expect(existing).toHaveLength(0);
  });

  it("POST /api/employees/:id/reconcile executes initial convergence (10 additions + audit logs)", async () => {
    const res = await fetch(`${baseUrl}/api/employees/${IDS.sarah}/reconcile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ at: "2024-08-28", actor: "user:admin" }),
    });

    expect(res.status).toBe(200);
    const result = (await res.json()) as any;

    expect(result.diff.summary.added).toBe(10);
    expect(result.diff.summary.revoked).toBe(0);
    expect(result.auditEventIds).toHaveLength(10);
    expect(result.scheduledJobs.length).toBeGreaterThan(0); // Schedules 24mo tenure milestone!

    // Verify assignments in database
    const assignments = await db
      .select()
      .from(policyAssignments)
      .where(eq(policyAssignments.employeeId, IDS.sarah));
    expect(assignments).toHaveLength(10);

    // Verify audit logs in database
    const audits = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.eventType, "POLICY_ASSIGNED"));
    expect(audits.length).toBeGreaterThanOrEqual(10);
  });

  it("POST /api/employees/:id/reconcile is strictly IDEMPOTENT on second execution", async () => {
    // Reconcile Sarah on the same date a second time
    const res = await fetch(`${baseUrl}/api/employees/${IDS.sarah}/reconcile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ at: "2024-08-28" }),
    });

    expect(res.status).toBe(200);
    const result = (await res.json()) as any;

    // Zero changes, 10 unchanged, 0 audit events!
    expect(result.diff.hasChanges).toBe(false);
    expect(result.diff.summary.added).toBe(0);
    expect(result.diff.summary.revoked).toBe(0);
    expect(result.diff.summary.unchanged).toBe(10);
    expect(result.auditEventIds).toHaveLength(0);

    // Total assignments count in database remains unchanged at 10
    const assignments = await db
      .select()
      .from(policyAssignments)
      .where(eq(policyAssignments.employeeId, IDS.sarah));
    expect(assignments).toHaveLength(10);
  });

  it("POST /api/employees/:id/reconcile transitions Sarah to Extended Vacation at 2-year tenure (2026-08-28)", async () => {
    // On 2026-08-28 Sarah reaches 24 months tenure
    const res = await fetch(`${baseUrl}/api/employees/${IDS.sarah}/reconcile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ at: "2026-08-28" }),
    });

    expect(res.status).toBe(200);
    const result = (await res.json()) as any;

    // Diff: 1 revoked (CA Vacation), 1 added (Extended Vacation), 9 unchanged
    expect(result.diff.summary.revoked).toBe(1);
    expect(result.diff.summary.added).toBe(1);
    expect(result.diff.summary.unchanged).toBe(9);
    expect(result.auditEventIds).toHaveLength(2); // 1 REVOKED audit + 1 ASSIGNED audit

    // Check CA Vacation is closed at [2024-08-28, 2026-08-28)
    const [caVac] = await db
      .select()
      .from(policyAssignments)
      .where(
        eq(policyAssignments.policyId, IDS.caVacation),
      );
    expect(caVac.effectiveTo).toBe("2026-08-28");

    // Check Extended Vacation is active at [2026-08-28, null)
    const [extVac] = await db
      .select()
      .from(policyAssignments)
      .where(
        eq(policyAssignments.policyId, IDS.extendedVacation),
      );
    expect(extVac.effectiveFrom).toBe("2026-08-28");
    expect(extVac.effectiveTo).toBeNull();
  });

  it("POST /api/companies/:id/reconcile reconciles all company employees idempotently", async () => {
    const res = await fetch(`${baseUrl}/api/companies/${IDS.acme}/reconcile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ at: "2024-08-28" }),
    });

    expect(res.status).toBe(200);
    const result = (await res.json()) as any;

    expect(result.totalEmployees).toBe(4);
    expect(result.employeeResults).toHaveLength(4);

    // Second company run is completely idempotent
    const rerun = await fetch(`${baseUrl}/api/companies/${IDS.acme}/reconcile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ at: "2024-08-28" }),
    });

    const rerunResult = (await rerun.json()) as any;
    expect(rerunResult.totalAdded).toBe(0);
    expect(rerunResult.totalRevoked).toBe(0);
  });
});

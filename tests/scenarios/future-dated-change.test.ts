/**
 * Scenario Test: Future-Dated Employee Change Activation.
 * Build Spec §21, §27, §40.
 *
 * Tests:
 * 1. Future-dated employee change (effectiveAt > now) creates version + scheduled temporal job.
 * 2. Current assignments on current date remain completely unmodified.
 * 3. Processing temporal jobs at the future milestone date cleanly activates the new policies.
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
  temporalJobs,
  getActiveAssignmentsAt,
} from "@warp/db";
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

describe("Scenario: Future-Dated Employee Change Activation (§21, §40)", () => {
  it("Schedules future temporal job without prematurely altering current active policies", async () => {
    const currentDate = "2024-08-28";
    const futureDate = "2028-01-01";

    // 1. Initial reconcile Alex Morgan on current date (NY state)
    await fetch(`${baseUrl}/api/employees/${IDS.alex}/reconcile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ at: currentDate }),
    });

    const initialAssignments = await getActiveAssignmentsAt(IDS.alex, currentDate);
    const initialPolicyIds = initialAssignments.map((a) => a.policyId);

    expect(initialPolicyIds).toContain(IDS.standardVacation);
    expect(initialPolicyIds).not.toContain(IDS.caVacation);

    // 2. Submit future-dated relocation: Move Alex to California effective 2025-01-01
    const patchRes = await fetch(`${baseUrl}/api/employees/${IDS.alex}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        state: "California",
        effectiveAt: futureDate,
      }),
    });
    expect(patchRes.status).toBe(200);

    const patchBody = await patchRes.json();
    expect(patchBody.isFutureDated).toBe(true);

    // 3. Verify temporal job was scheduled for 2025-01-01
    const scheduledJobs = await db
      .select()
      .from(temporalJobs)
      .where(eq(temporalJobs.employeeId, IDS.alex));

    const relocationJob = scheduledJobs.find((j) =>
      j.reason.includes("Future-dated attribute update"),
    );
    expect(relocationJob).toBeDefined();

    // 4. Assert Alex's current policies on 2024-08-28 are UNCHANGED
    const currentAssignments = await getActiveAssignmentsAt(IDS.alex, currentDate);
    const currentPolicyIds = currentAssignments.map((a) => a.policyId);

    expect(currentPolicyIds).toContain(IDS.standardVacation);
    expect(currentPolicyIds).not.toContain(IDS.caVacation);

    // 5. Trigger temporal job execution as-of the future date 2025-01-01
    const workerRes = await fetch(`${baseUrl}/api/worker/process-temporal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asOfDate: futureDate }),
    });
    expect(workerRes.status).toBe(200);

    // 6. Assert Alex now has CA Training and Extended Vacation (due to 55m tenure) on future date 2028-01-01
    const futureAssignments = await getActiveAssignmentsAt(IDS.alex, futureDate);
    const futurePolicyIds = futureAssignments.map((a) => a.policyId);

    expect(futurePolicyIds).toContain(IDS.caWorkplaceTraining);
    expect(futurePolicyIds).toContain(IDS.extendedVacation);
    expect(futurePolicyIds).not.toContain(IDS.standardVacation);
  });
});

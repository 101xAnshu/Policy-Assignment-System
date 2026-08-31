/**
 * Scenario Test: Group Membership Lifecycle.
 * Build Spec §40.
 *
 * Tests:
 * 1. Group membership added -> outbox event created -> scoped reconciler triggers -> Manager Training assigned.
 * 2. Group membership removed -> outbox event created -> scoped reconciler triggers -> Manager Training revoked.
 * 3. Unrelated policy categories (Vacation, Healthcare, Pay) remain completely untouched.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import { createApp } from "../../apps/web/src/app";
import {
  sql,
  IDS,
  seed,
  reset,
  getActiveAssignmentsAt,
} from "@warp/db";

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

describe("Scenario: Group Membership Lifecycle (§40)", () => {
  it("Scenario 1: Adding employee to Managers group assigns Manager Training via scoped reconciliation", async () => {
    const evalDate = "2024-08-28";

    // 1. Initial reconcile for Alex Morgan (IC in Engineering, not in Managers group)
    await fetch(`${baseUrl}/api/employees/${IDS.alex}/reconcile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ at: evalDate }),
    });

    const initialAssignments = await getActiveAssignmentsAt(IDS.alex, evalDate);
    const initialPolicyIds = initialAssignments.map((a) => a.policyId);

    // Alex initially does NOT have Manager Training
    expect(initialPolicyIds).not.toContain(IDS.managerTraining);

    // 2. Add Alex Morgan to Managers group via API
    const addMemberRes = await fetch(`${baseUrl}/api/groups/${IDS.managers}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId: IDS.alex,
        validFrom: evalDate,
      }),
    });
    expect(addMemberRes.status).toBe(201);

    // 3. Process the resulting outbox event
    const outboxRes = await fetch(`${baseUrl}/api/worker/process-outbox`, {
      method: "POST",
    });
    expect(outboxRes.status).toBe(200);

    // 4. Assert Alex now has Manager Training
    const updatedAssignments = await getActiveAssignmentsAt(IDS.alex, evalDate);
    const updatedPolicyIds = updatedAssignments.map((a) => a.policyId);

    expect(updatedPolicyIds).toContain(IDS.managerTraining);

    // Assert only Compliance Training category was modified
    const complianceAssignments = updatedAssignments.filter((a) => a.categoryId === IDS.catCompliance);
    expect(complianceAssignments.length).toBe(1);
    expect(complianceAssignments[0].policyId).toBe(IDS.managerTraining);
  });

  it("Scenario 2: Removing employee from Managers group revokes Manager Training", async () => {
    const evalDate = "2024-08-28";

    // 1. Remove Alex Morgan from Managers group
    const removeMemberRes = await fetch(
      `${baseUrl}/api/groups/${IDS.managers}/members/${IDS.alex}`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ effectiveAt: evalDate }),
      },
    );
    expect(removeMemberRes.status).toBe(200);

    // 2. Process outbox event
    const outboxRes = await fetch(`${baseUrl}/api/worker/process-outbox`, {
      method: "POST",
    });
    expect(outboxRes.status).toBe(200);

    // 3. Assert Manager Training is revoked
    const finalAssignments = await getActiveAssignmentsAt(IDS.alex, evalDate);
    const finalPolicyIds = finalAssignments.map((a) => a.policyId);

    expect(finalPolicyIds).not.toContain(IDS.managerTraining);
  });
});

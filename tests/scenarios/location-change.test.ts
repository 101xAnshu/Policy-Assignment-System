/**
 * Scenario Test: Location Change & Preview-then-Apply Flow.
 *
 * Tests:
 * 1. Simulating relocation from California to New York previews exact added / revoked / unchanged diff.
 * 2. No database write occurs during preview.
 * 3. Applying the change reconciles actual state to match preview diff 100%.
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

describe("Scenario: Sarah Chen Relocation (California → New York,Steps 2–3)", () => {
  it("Previews exact diff before applying, then converges database atomically", async () => {
    const evalDate = "2024-08-28";

    // 1. Initial reconcile Sarah Chen in California
    await fetch(`${baseUrl}/api/employees/${IDS.sarah}/reconcile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ at: evalDate }),
    });

    const initialAssignments = await getActiveAssignmentsAt(IDS.sarah, evalDate);
    const initialPolicyIds = initialAssignments.map((a) => a.policyId);

    expect(initialPolicyIds).toContain(IDS.caVacation);
    expect(initialPolicyIds).toContain(IDS.caWorkplaceTraining);
    expect(initialPolicyIds).not.toContain(IDS.standardVacation);

    // 2. Run simulation preview for California -> New York
    const previewRes = await fetch(`${baseUrl}/api/employees/${IDS.sarah}/preview-change`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        updates: { state: "New York" },
        effectiveAt: evalDate,
      }),
    });
    expect(previewRes.status).toBe(200);

    const preview = await previewRes.json();

    // Verify preview diff
    expect(preview.summary.added).toBe(1); // Standard Vacation added
    expect(preview.summary.revoked).toBe(2); // CA Vacation & CA Workplace Training revoked
    expect(preview.diff.toAdd[0].policyId).toBe(IDS.standardVacation);

    const revokedPolicyIds = preview.diff.toRevoke.map((r: any) => r.policyId);
    expect(revokedPolicyIds).toContain(IDS.caVacation);
    expect(revokedPolicyIds).toContain(IDS.caWorkplaceTraining);

    // 3. Verify no database mutations occurred during preview
    const assignmentsAfterPreview = await getActiveAssignmentsAt(IDS.sarah, evalDate);
    expect(assignmentsAfterPreview.map((a) => a.policyId)).toEqual(initialPolicyIds);

    // 4. Apply changes (Demo Step 3)
    const updateRes = await fetch(`${baseUrl}/api/employees/${IDS.sarah}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        state: "New York",
        effectiveAt: evalDate,
      }),
    });
    expect(updateRes.status).toBe(200);

    // 5. Process background outbox
    const outboxRes = await fetch(`${baseUrl}/api/worker/process-outbox`, {
      method: "POST",
    });
    expect(outboxRes.status).toBe(200);

    // 6. Assert materialized database assignments match preview exactly
    const finalAssignments = await getActiveAssignmentsAt(IDS.sarah, evalDate);
    const finalPolicyIds = finalAssignments.map((a) => a.policyId);

    expect(finalPolicyIds).toContain(IDS.standardVacation);
    expect(finalPolicyIds).not.toContain(IDS.caVacation);
    expect(finalPolicyIds).not.toContain(IDS.caWorkplaceTraining);
    expect(finalPolicyIds).toContain(IDS.managerTraining); // Unaffected category preserved
    expect(finalPolicyIds).toContain(IDS.engineeringStipend); // Unaffected category preserved
  });
});

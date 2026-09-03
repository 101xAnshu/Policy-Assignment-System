/**
 * Scenario Test: Rule Lifecycle & Dynamic Mutation.
 *
 * Tests:
 * 1. Rule priority change: Updating rule priority overrides previously winning policies in ONE categories.
 * 2. Rule predicate expansion: Expanding predicate broadens affected employee population.
 * 3. Dynamic company-wide convergence preserves audit snapshots and immutability.
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
  assignmentRuleVersions,
  assignmentRules,
  getActiveAssignmentsAt,
} from "@warp/db";
import { eq } from "drizzle-orm";
import { extractDependencies } from "@warp/domain";

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

describe("Scenario: Rule Priority & Predicate Changes", () => {
  it("Scenario 1: Rule Priority Change — Upgrading Standard Vacation priority from 10 to 70 overrides California Vacation (50)", async () => {
    const evalDate = "2024-08-28";

    // 1. Initial reconcile Sarah Chen (CA-based) -> gets California Vacation (priority 50 > 10)
    await fetch(`${baseUrl}/api/employees/${IDS.sarah}/reconcile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ at: evalDate }),
    });

    const initialAssignments = await getActiveAssignmentsAt(IDS.sarah, evalDate);
    const vacAsgn1 = initialAssignments.find((a) => a.categoryId === IDS.catVacation);
    expect(vacAsgn1?.policyId).toBe(IDS.caVacation);

    // 2. Publish Version 2 of Standard Vacation rule with Priority = 70 (higher than CA Vacation 50)
    const newVersionId = "f1000000-0000-0000-0000-000000000099";
    const predicate = { type: "EQUALS" as const, field: "employmentType" as const, value: "FULL_TIME" };

    await db.insert(assignmentRuleVersions).values({
      id: newVersionId,
      ruleId: IDS.ruleStandardVacation,
      version: 2,
      predicate,
      priority: 70, // 70 > 50
      effectiveFrom: evalDate,
      effectiveTo: null,
      dependencies: extractDependencies(predicate),
      createdBy: "admin:priority-test",
    });

    const publishRes = await fetch(`${baseUrl}/api/rules/${IDS.ruleStandardVacation}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ validFrom: evalDate }),
    });
    expect(publishRes.status).toBe(200);

    // 3. Process company-wide outbox event triggered by rule publish
    const outboxRes = await fetch(`${baseUrl}/api/worker/process-outbox`, {
      method: "POST",
    });
    expect(outboxRes.status).toBe(200);

    // 4. Assert Sarah's vacation policy transitioned to Standard Vacation (priority 70 winner)
    const finalAssignments = await getActiveAssignmentsAt(IDS.sarah, evalDate);
    const vacAsgn2 = finalAssignments.find((a) => a.categoryId === IDS.catVacation);

    expect(vacAsgn2?.policyId).toBe(IDS.standardVacation);
    expect(vacAsgn2?.sourceRuleVersion).toBe(2);
  });

  it("Scenario 2: Rule Predicate Expansion — Broadening Engineering Stipend to all employees", async () => {
    // Maya was hired 2025-01-10, so evaluate after hire (pre-hire dates 404).
    const evalDate = "2025-06-01";

    // 1. Initial reconcile Maya Patel (Contractor in Finance) -> no Engineering Stipend
    await fetch(`${baseUrl}/api/employees/${IDS.maya}/reconcile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ at: evalDate }),
    });

    const initialAssignments = await getActiveAssignmentsAt(IDS.maya, evalDate);
    const initialStipend = initialAssignments.find((a) => a.categoryId === IDS.catStipend);
    expect(initialStipend).toBeUndefined();

    // 2. Publish Version 2 of Stipend rule with predicate = ALL employees
    const newVersionId = "f1000000-0000-0000-0000-000000000098";
    const allPredicate = { type: "ALL" as const, children: [] };

    await db.insert(assignmentRuleVersions).values({
      id: newVersionId,
      ruleId: IDS.ruleEngineeringStipend,
      version: 2,
      predicate: allPredicate,
      priority: 50,
      effectiveFrom: evalDate,
      effectiveTo: null,
      dependencies: extractDependencies(allPredicate),
      createdBy: "admin:predicate-expansion",
    });

    await fetch(`${baseUrl}/api/rules/${IDS.ruleEngineeringStipend}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ validFrom: evalDate }),
    });

    // 3. Process company-wide outbox reconciliation
    await fetch(`${baseUrl}/api/worker/process-outbox`, { method: "POST" });

    // 4. Maya Patel now receives Stipend
    const updatedAssignments = await getActiveAssignmentsAt(IDS.maya, evalDate);
    const updatedStipend = updatedAssignments.find((a) => a.categoryId === IDS.catStipend);

    expect(updatedStipend).toBeDefined();
    expect(updatedStipend?.policyId).toBe(IDS.engineeringStipend);
  });
});

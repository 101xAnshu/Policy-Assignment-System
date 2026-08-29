/**
 * Integration tests for Policy Assignments & Historical Timeline API.
 * Build Spec §15, §17, §18, §29.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import { createApp } from "../../apps/web/src/app";
import { sql, IDS, seed, reset } from "@warp/db";

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

describe("Assignments API & Temporal Invariants", () => {
  it("POST /api/employees/:id/assignments creates a temporal assignment with frozen explanation snapshot", async () => {
    const payload = {
      policyId: IDS.caVacation,
      categoryId: IDS.catVacation,
      sourceRuleId: IDS.ruleCaVacation,
      sourceRuleVersion: 1,
      effectiveFrom: "2024-08-28",
      effectiveTo: "2026-08-28",
      explanationSnapshot: {
        evaluatedAt: "2024-08-28",
        matchedRules: [
          {
            ruleId: IDS.ruleCaVacation,
            version: 1,
            priority: 50,
            matchedConditions: ["state = California", "employmentType = FULL_TIME"],
            outcome: "WINNER",
          },
          {
            ruleId: IDS.ruleStandardVacation,
            version: 1,
            priority: 10,
            matchedConditions: ["employmentType = FULL_TIME"],
            outcome: "OVERRIDDEN",
          },
        ],
        winner: {
          ruleId: IDS.ruleCaVacation,
          ruleVersion: 1,
          policyId: IDS.caVacation,
          policyName: "California Vacation",
          priority: 50,
          outcome: "WINNER",
        },
        reason: "Rule 'ruleCaVacation' won with highest priority (50)",
      },
    };

    const res = await fetch(`${baseUrl}/api/employees/${IDS.sarah}/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    expect(res.status).toBe(201);
    const created = (await res.json()) as any;
    expect(created.id).toBeDefined();
    expect(created.employeeId).toBe(IDS.sarah);
    expect(created.policyId).toBe(IDS.caVacation);
    expect(created.effectiveFrom).toBe("2024-08-28");
    expect(created.effectiveTo).toBe("2026-08-28");
    expect(created.explanationSnapshot.reason).toContain("highest priority");
  });

  it("POST /api/employees/:id/assignments prevents overlapping intervals in ONE-cardinality category (409 Conflict)", async () => {
    // Attempt to insert another Vacation assignment overlapping with [2024-08-28, 2026-08-28)
    const conflictingPayload = {
      policyId: IDS.standardVacation,
      categoryId: IDS.catVacation, // ONE cardinality!
      sourceRuleId: IDS.ruleStandardVacation,
      sourceRuleVersion: 1,
      effectiveFrom: "2025-01-01", // Overlaps with [2024-08-28, 2026-08-28)
      effectiveTo: "2027-01-01",
    };

    const res = await fetch(`${baseUrl}/api/employees/${IDS.sarah}/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(conflictingPayload),
    });

    expect(res.status).toBe(409);
    const err = (await res.json()) as any;
    expect(err.error).toContain("Temporal conflict");
    expect(err.conflictingAssignment).toBeDefined();
  });

  it("POST /api/employees/:id/assignments allows non-overlapping adjacent intervals in ONE-cardinality category", async () => {
    // Extended vacation starts exactly on 2026-08-28 (touching previous boundary [2024-08-28, 2026-08-28))
    const adjacentPayload = {
      policyId: IDS.extendedVacation,
      categoryId: IDS.catVacation,
      sourceRuleId: IDS.ruleExtendedVacation,
      sourceRuleVersion: 1,
      effectiveFrom: "2026-08-28", // Exactly when previous assignment ended
      effectiveTo: null, // Unbounded future
      explanationSnapshot: {
        evaluatedAt: "2026-08-28",
        matchedRules: [],
        winner: null,
        reason: "Promoted to Extended Vacation after 24 months tenure",
      },
    };

    const res = await fetch(`${baseUrl}/api/employees/${IDS.sarah}/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(adjacentPayload),
    });

    expect(res.status).toBe(201);
  });

  it("GET /api/employees/:id/assignments returns active policy at point in time", async () => {
    // On 2025-06-01: Sarah's active vacation is CA Vacation
    const res2025 = await fetch(
      `${baseUrl}/api/employees/${IDS.sarah}/assignments?at=2025-06-01`,
    );
    expect(res2025.status).toBe(200);
    const body2025 = (await res2025.json()) as any;
    expect(body2025.count).toBe(1);
    expect(body2025.assignments[0].policyId).toBe(IDS.caVacation);

    // On 2026-08-28: Sarah's active vacation is Extended Vacation
    const res2026 = await fetch(
      `${baseUrl}/api/employees/${IDS.sarah}/assignments?at=2026-08-28`,
    );
    expect(res2026.status).toBe(200);
    const body2026 = (await res2026.json()) as any;
    expect(body2026.count).toBe(1);
    expect(body2026.assignments[0].policyId).toBe(IDS.extendedVacation);
  });

  it("GET /api/employees/:id/assignments/history returns full timeline grouped by category", async () => {
    const res = await fetch(
      `${baseUrl}/api/employees/${IDS.sarah}/assignments/history`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;

    expect(body.totalCount).toBe(2);
    expect(body.byCategory.vacation).toHaveLength(2);
    expect(body.byCategory.vacation[0].policyName).toBe("California Vacation");
    expect(body.byCategory.vacation[1].policyName).toBe("Extended Vacation");
  });

  it("GET /api/assignments/:id/explanation returns frozen explanation snapshot (§18, §29)", async () => {
    // Fetch Sarah's history to get assignment ID
    const historyRes = await fetch(
      `${baseUrl}/api/employees/${IDS.sarah}/assignments/history`,
    );
    const history = (await historyRes.json()) as any;
    const firstAssignment = history.history[0];

    const expRes = await fetch(
      `${baseUrl}/api/assignments/${firstAssignment.id}/explanation`,
    );
    expect(expRes.status).toBe(200);
    const exp = (await expRes.json()) as any;

    expect(exp.assignmentId).toBe(firstAssignment.id);
    expect(exp.policyName).toBe("California Vacation");
    expect(exp.explanationSnapshot).toBeDefined();
    expect(exp.explanationSnapshot.reason).toContain("highest priority");
    expect(exp.explanationSnapshot.matchedRules).toHaveLength(2);
  });
});

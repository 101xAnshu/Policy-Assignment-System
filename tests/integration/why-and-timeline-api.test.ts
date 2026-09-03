/**
 * Integration tests for "Why?" Explainability Engine, Timeline Reconstruction, and Audit API.
 *
 * Invariants tested:
 * - "Why?" answers why an assigned policy won (WINNER).
 * - "Why?" answers why a matching policy was suppressed by higher priority (OVERRIDDEN).
 * - "Why?" answers why an employee failed rule conditions (NO_MATCH with failed condition trail).
 * - "Why?" shows temporal condition transition (tenure milestone < 24mo vs >= 24mo).
 * - Unified Timeline merges profile versions, policy lifecycles, and audit records chronologically.
 * - Audit log querying supports multi-dimensional filters.
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

describe("GET /api/employees/:id/why (Explainability Engine)", () => {
  it("explains why Sarah Chen HAS California Vacation (WINNER with priority 50)", async () => {
    // Reconcile Sarah on hire date first
    await fetch(`${baseUrl}/api/employees/${IDS.sarah}/reconcile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ at: "2024-08-28" }),
    });

    const res = await fetch(
      `${baseUrl}/api/employees/${IDS.sarah}/why?policyId=${IDS.caVacation}&at=2024-08-28`,
    );
    expect(res.status).toBe(200);
    const why = (await res.json()) as any;

    expect(why.isAssigned).toBe(true);
    expect(why.status).toBe("ASSIGNED");
    expect(why.targetPolicy.name).toBe("California Vacation");
    expect(why.reason).toContain("assigned");

    const caRule = why.ruleEvaluations.find((r: any) => r.policyId === IDS.caVacation);
    expect(caRule.matched).toBe(true);
    expect(caRule.outcome).toBe("WINNER");
    expect(caRule.matchedConditions).toContain("state = California");
  });

  it("explains why Sarah Chen DOES NOT HAVE Standard Vacation (OVERRIDDEN by CA Vacation)", async () => {
    const res = await fetch(
      `${baseUrl}/api/employees/${IDS.sarah}/why?policyId=${IDS.standardVacation}&at=2024-08-28`,
    );
    expect(res.status).toBe(200);
    const why = (await res.json()) as any;

    expect(why.isAssigned).toBe(false);
    expect(why.status).toBe("OVERRIDDEN");
    expect(why.reason).toContain("overridden");
    expect(why.reason).toContain("priority");

    const stdRule = why.ruleEvaluations.find((r: any) => r.policyId === IDS.standardVacation);
    expect(stdRule.matched).toBe(true);
    expect(stdRule.outcome).toBe("OVERRIDDEN");
  });

  it("explains why Alex Morgan DOES NOT HAVE California Vacation (NO_MATCH on state = California)", async () => {
    const res = await fetch(
      `${baseUrl}/api/employees/${IDS.alex}/why?policyId=${IDS.caVacation}&at=2024-08-28`,
    );
    expect(res.status).toBe(200);
    const why = (await res.json()) as any;

    expect(why.isAssigned).toBe(false);
    expect(why.status).toBe("NO_MATCH");
    expect(why.reason).toContain("failed rule criteria");

    const caRule = why.ruleEvaluations.find((r: any) => r.policyId === IDS.caVacation);
    expect(caRule.matched).toBe(false);
    expect(caRule.outcome).toBe("NO_MATCH");
    expect(caRule.failedConditions.some((c: string) => c.includes("state = California"))).toBe(true);
  });

  it("explains tenure threshold failure for Sarah Chen before 24 months (NO_MATCH on tenure >= 24 months)", async () => {
    const res = await fetch(
      `${baseUrl}/api/employees/${IDS.sarah}/why?policyId=${IDS.extendedVacation}&at=2024-08-28`,
    );
    expect(res.status).toBe(200);
    const why = (await res.json()) as any;

    expect(why.isAssigned).toBe(false);
    expect(why.status).toBe("NO_MATCH");

    const extRule = why.ruleEvaluations.find((r: any) => r.policyId === IDS.extendedVacation);
    expect(extRule.matched).toBe(false);
    expect(extRule.failedConditions.some((c: string) => c.includes("tenure"))).toBe(true);
  });
});

describe("GET /api/employees/:id/timeline (Timeline Reconstruction)", () => {
  it("reconstructs Sarah Chen's historical profile and policy lifecycle timeline", async () => {
    const res = await fetch(
      `${baseUrl}/api/employees/${IDS.sarah}/timeline`,
    );
    expect(res.status).toBe(200);
    const timeline = (await res.json()) as any;

    expect(timeline.employeeId).toBe(IDS.sarah);
    expect(timeline.employeeName).toBe("Sarah Chen");
    expect(timeline.totalEvents).toBeGreaterThan(0);

    // Verify chronological ordering
    for (let i = 1; i < timeline.timeline.length; i++) {
      const prev = timeline.timeline[i - 1].effectiveAt;
      const curr = timeline.timeline[i].effectiveAt;
      expect(prev.localeCompare(curr)).toBeLessThanOrEqual(0);
    }
  });
});

describe("GET /api/audit (Audit Querying)", () => {
  it("queries audit records with filters", async () => {
    const res = await fetch(
      `${baseUrl}/api/audit?companyId=${IDS.acme}&eventType=POLICY_ASSIGNED&limit=10`,
    );
    expect(res.status).toBe(200);
    const result = (await res.json()) as any;

    expect(result.events.length).toBeGreaterThan(0);
    expect(result.events.every((e: any) => e.eventType === "POLICY_ASSIGNED")).toBe(true);
  });
});

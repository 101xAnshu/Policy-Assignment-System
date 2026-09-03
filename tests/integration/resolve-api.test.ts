/**
 * Integration tests for the Resolution API.
 *
 * Tests live point-in-time policy resolution for the Acme tenant:
 * - Sarah Chen at hire date (2024-08-28): CA Vacation (50) beats Standard Vacation (10), Standard Sick, US Bi-weekly, CA Workplace Training, Manager Training, Engineering Stipend
 * - Sarah Chen at tenure threshold (2026-08-28): Extended Vacation (60) beats CA Vacation (50)
 * - Alex Morgan (NY): Standard Vacation, Standard Sick, US Bi-weekly, Engineering Stipend, GitHub
 * - Simulation API: POST /api/resolve returns computed assignments + decision trail
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

describe("GET /api/employees/:id/resolve", () => {
  it("resolves Sarah Chen's initial policies on hire date (2024-08-28) matching exact Demo Scenario", async () => {
    const res = await fetch(
      `${baseUrl}/api/employees/${IDS.sarah}/resolve?at=2024-08-28`,
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;

    expect(data.evaluationDate).toBe("2024-08-28");
    expect(data.employeeState.state).toBe("California");
    expect(data.employeeState.isManager).toBe(true);

    const policyIds = data.assignments.map((a: { policyId: string }) => a.policyId);

    // 
    // 1. California Vacation (CA Full-time beats Standard Vacation)
    // 2. Standard Sick
    // 3. US Bi-weekly
    // 4. Standard Healthcare
    // 5. CA Workplace Training
    // 6. Manager Training (from Managers group membership)
    // 7. Engineering Stipend
    // 8. GitHub (Engineering app)
    // 9. Slack (Company-wide app)
    // 10. Notion (Company-wide app)
    expect(policyIds).toContain(IDS.caVacation);
    expect(policyIds).not.toContain(IDS.standardVacation); // Overridden by priority 50
    expect(policyIds).toContain(IDS.standardSick);
    expect(policyIds).toContain(IDS.usBiweekly);
    expect(policyIds).toContain(IDS.standardHealthcare);
    expect(policyIds).toContain(IDS.caWorkplaceTraining);
    expect(policyIds).toContain(IDS.managerTraining);
    expect(policyIds).toContain(IDS.engineeringStipend);
    expect(policyIds).toContain(IDS.github);
    expect(policyIds).toContain(IDS.slack);
    expect(policyIds).toContain(IDS.notion);

    // Verify Vacation decision explanation
    const vacDecision = data.decisions.find(
      (d: { categoryKey: string }) => d.categoryKey === "vacation",
    );
    expect(vacDecision.status).toBe("ASSIGNED");
    expect(vacDecision.winner.policyId).toBe(IDS.caVacation);
    expect(vacDecision.candidates).toHaveLength(2); // CA Vacation & Standard Vacation
  });

  it("resolves Extended Vacation for Sarah after 24 months tenure (2026-08-28) matching Demo Scenario Step 4", async () => {
    const res = await fetch(
      `${baseUrl}/api/employees/${IDS.sarah}/resolve?at=2026-08-28`,
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;

    const policyIds = data.assignments.map((a: { policyId: string }) => a.policyId);

    // Extended Vacation (priority 60) wins over CA Vacation (50) and Standard Vacation (10)
    expect(policyIds).toContain(IDS.extendedVacation);
    expect(policyIds).not.toContain(IDS.caVacation);
    expect(policyIds).not.toContain(IDS.standardVacation);

    const vacDecision = data.decisions.find(
      (d: { categoryKey: string }) => d.categoryKey === "vacation",
    );
    expect(vacDecision.winner.policyId).toBe(IDS.extendedVacation);
    expect(vacDecision.candidates).toHaveLength(3);
  });

  it("resolves Alex Morgan in NY without CA training and with Standard Vacation", async () => {
    const res = await fetch(
      `${baseUrl}/api/employees/${IDS.alex}/resolve?at=2024-08-28`,
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;

    const policyIds = data.assignments.map((a: { policyId: string }) => a.policyId);

    expect(policyIds).toContain(IDS.standardVacation);
    expect(policyIds).not.toContain(IDS.caVacation);
    expect(policyIds).not.toContain(IDS.caWorkplaceTraining);
    expect(policyIds).not.toContain(IDS.managerTraining); // Alex is not in managers group
  });
});

describe("POST /api/resolve (Simulation)", () => {
  it("resolves policies on simulated employee attributes without saving to database", async () => {
    const payload = {
      companyId: IDS.acme,
      at: "2024-08-28",
      employee: {
        country: "US",
        state: "California",
        department: "Engineering",
        employmentType: "FULL_TIME",
        isManager: false,
        hireDate: "2024-08-28",
        groupIds: [],
      },
    };

    const res = await fetch(`${baseUrl}/api/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    expect(res.status).toBe(200);
    const result = (await res.json()) as any;
    const policyIds = result.assignments.map((a: { policyId: string }) => a.policyId);

    expect(policyIds).toContain(IDS.caVacation);
    expect(policyIds).not.toContain(IDS.managerTraining);
    expect(result.decisions.length).toBeGreaterThan(0);
  });
});

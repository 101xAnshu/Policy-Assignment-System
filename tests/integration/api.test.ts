/**
 * Integration tests for the Phase 1 Basic API.
 *
 * Tests all endpoints against the seeded Postgres database:
 * - Employee CRUD & temporal versioning (PATCH closes old version, creates new version)
 * - Policies & categories listing
 * - Rule lifecycle (create DRAFT with predicate validation -> publish to ACTIVE)
 * - Group listing with enriched membership data
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import { createApp } from "../../apps/web/src/app";
import { sql, IDS, seed, reset } from "@warp/db";

let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
  // Fresh seed for clean deterministic test environment
  await reset(false);
  await seed(false);

  return new Promise<void>((resolve) => {
    const app = createApp();
    // Start on a dynamic test port (0)
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
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await sql.end();
});

// ─── Health check ────────────────────────────────────────────────────────────

describe("GET /api/health", () => {
  it("returns ok status", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.status).toBe("ok");
    expect(body.timestamp).toBeDefined();
  });
});

// ─── Employees API ───────────────────────────────────────────────────────────

describe("Employees API", () => {
  it("GET /api/employees lists all seeded employees", async () => {
    const res = await fetch(`${baseUrl}/api/employees`);
    expect(res.status).toBe(200);
    const list = (await res.json()) as any[];
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThanOrEqual(4);

    const sarah = list.find((e: { name: string }) => e.name === "Sarah Chen");
    expect(sarah).toBeDefined();
    expect(sarah.state).toBe("California");
    expect(sarah.department).toBe("Engineering");
    expect(sarah.isManager).toBe(true);
  });

  it("GET /api/employees/:id returns employee detail with version history", async () => {
    const res = await fetch(`${baseUrl}/api/employees/${IDS.sarah}`);
    expect(res.status).toBe(200);
    const emp = (await res.json()) as any;
    expect(emp.name).toBe("Sarah Chen");
    expect(emp.versions).toBeDefined();
    expect(Array.isArray(emp.versions)).toBe(true);
    expect(emp.versions.length).toBeGreaterThanOrEqual(1);
    expect(emp.versions[0].version).toBe(1);
    expect(emp.versions[0].validTo).toBeNull();
  });

  it("POST /api/employees creates employee + initial version atomically", async () => {
    const newEmpPayload = {
      companyId: IDS.acme,
      name: "Jordan Taylor",
      email: "jordan.taylor@acme.com",
      country: "US",
      state: "Washington",
      department: "Engineering",
      employmentType: "FULL_TIME",
      isManager: false,
      hireDate: "2025-06-01",
    };

    const res = await fetch(`${baseUrl}/api/employees`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newEmpPayload),
    });

    expect(res.status).toBe(201);
    const created = (await res.json()) as any;
    expect(created.id).toBeDefined();
    expect(created.name).toBe("Jordan Taylor");
    expect(created.version).toBe(1);

    // Verify detail endpoint returns initial version
    const detailRes = await fetch(`${baseUrl}/api/employees/${created.id}`);
    const detail = (await detailRes.json()) as any;
    expect(detail.versions).toHaveLength(1);
    expect(detail.versions[0].validFrom).toBe("2025-06-01");
    expect(detail.versions[0].validTo).toBeNull();
  });

  it("POST /api/employees rejects incomplete payload with 400", async () => {
    const res = await fetch(`${baseUrl}/api/employees`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Incomplete" }),
    });
    expect(res.status).toBe(400);
  });

  it("PATCH /api/employees/:id updates attributes and creates version record", async () => {
    // Relocate Alex Morgan from NY to CA effective 2026-01-01
    const res = await fetch(`${baseUrl}/api/employees/${IDS.alex}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        state: "California",
        effectiveAt: "2026-01-01",
      }),
    });

    expect(res.status).toBe(200);
    const result = (await res.json()) as any;
    expect(result.version).toBe(2);
    expect(result.changedFields).toContain("state");
    expect(result.employee.state).toBe("California");

    // Fetch employee detail to verify temporal validity intervals
    const detailRes = await fetch(`${baseUrl}/api/employees/${IDS.alex}`);
    const detail = (await detailRes.json()) as any;
    expect(detail.versions).toHaveLength(2);

    // Version 1 should now be closed at [hireDate, 2026-01-01)
    const v1 = detail.versions.find((v: { version: number }) => v.version === 1);
    expect(v1.state).toBe("New York");
    expect(v1.validTo).toBe("2026-01-01");

    // Version 2 should be active from [2026-01-01, null)
    const v2 = detail.versions.find((v: { version: number }) => v.version === 2);
    expect(v2.state).toBe("California");
    expect(v2.validFrom).toBe("2026-01-01");
    expect(v2.validTo).toBeNull();
  });
});

// ─── Policies & Categories API ───────────────────────────────────────────────

describe("Policies & Categories API", () => {
  it("GET /api/policy-categories lists all categories with cardinality", async () => {
    const res = await fetch(`${baseUrl}/api/policy-categories`);
    expect(res.status).toBe(200);
    const categories = (await res.json()) as any[];
    expect(categories.length).toBe(7);

    const vacation = categories.find((c: { key: string }) => c.key === "vacation");
    expect(vacation.cardinality).toBe("ONE");

    const compliance = categories.find((c: { key: string }) => c.key === "compliance");
    expect(compliance.cardinality).toBe("MANY");
  });

  it("GET /api/policies lists policies joined with category details", async () => {
    const res = await fetch(`${baseUrl}/api/policies`);
    expect(res.status).toBe(200);
    const policyList = (await res.json()) as any[];
    expect(policyList.length).toBe(12);

    const caVac = policyList.find(
      (p: { name: string }) => p.name === "California Vacation",
    );
    expect(caVac).toBeDefined();
    expect(caVac.categoryName).toBe("Vacation");
    expect(caVac.cardinality).toBe("ONE");
  });
});

// ─── Rules API ───────────────────────────────────────────────────────────────

describe("Rules API", () => {
  it("GET /api/rules lists all seeded rules with category info", async () => {
    const res = await fetch(`${baseUrl}/api/rules`);
    expect(res.status).toBe(200);
    const ruleList = (await res.json()) as any[];
    expect(ruleList.length).toBe(12);

    const caVacRule = ruleList.find(
      (r: { name: string }) => r.name === "California Vacation",
    );
    expect(caVacRule).toBeDefined();
    expect(caVacRule.status).toBe("ACTIVE");
    expect(caVacRule.currentVersion).toBe(1);
    expect(caVacRule.categoryKey).toBe("vacation");
  });

  it("GET /api/rules/:id returns rule detail with version history & dependencies", async () => {
    const res = await fetch(`${baseUrl}/api/rules/${IDS.ruleCaVacation}`);
    expect(res.status).toBe(200);
    const rule = (await res.json()) as any;
    expect(rule.name).toBe("California Vacation");
    expect(rule.versions).toHaveLength(1);
    expect(rule.versions[0].priority).toBe(50);
    expect(rule.versions[0].dependencies.employeeFields).toContain("state");
    expect(rule.versions[0].dependencies.employeeFields).toContain("employmentType");
  });

  it("POST /api/rules creates a DRAFT rule with validated predicate", async () => {
    const payload = {
      companyId: IDS.acme,
      policyId: IDS.standardHealthcare,
      categoryId: IDS.catHealthcare,
      name: "Contractor Healthcare Opt-in",
      predicate: {
        type: "EQUALS",
        field: "employmentType",
        value: "CONTRACTOR",
      },
      priority: 20,
    };

    const res = await fetch(`${baseUrl}/api/rules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    expect(res.status).toBe(201);
    const { rule, version } = (await res.json()) as any;
    expect(rule.status).toBe("DRAFT");
    expect(rule.currentVersion).toBeNull();
    expect(version.version).toBe(1);
    expect(version.priority).toBe(20);
    expect(version.dependencies.employeeFields).toContain("employmentType");

    // Test publishing the draft rule
    const pubRes = await fetch(`${baseUrl}/api/rules/${rule.id}/publish`, {
      method: "POST",
    });
    expect(pubRes.status).toBe(200);
    const pubBody = (await pubRes.json()) as any;
    expect(pubBody.rule.status).toBe("ACTIVE");
    expect(pubBody.rule.currentVersion).toBe(1);
  });

  it("POST /api/rules rejects invalid predicate AST with 400", async () => {
    const payload = {
      companyId: IDS.acme,
      policyId: IDS.standardHealthcare,
      categoryId: IDS.catHealthcare,
      name: "Bad Rule",
      predicate: {
        type: "EQUALS",
        field: "invalid_unsupported_field",
        value: "foo",
      },
      priority: 10,
    };

    const res = await fetch(`${baseUrl}/api/rules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    expect(res.status).toBe(400);
    const err = (await res.json()) as any;
    expect(err.error).toBe("Invalid predicate");
    expect(err.details.length).toBeGreaterThan(0);
  });
});

// ─── Groups API ──────────────────────────────────────────────────────────────

describe("Groups API", () => {
  it("GET /api/groups returns groups with member count and list", async () => {
    const res = await fetch(`${baseUrl}/api/groups`);
    expect(res.status).toBe(200);
    const groupList = (await res.json()) as any[];
    expect(groupList.length).toBe(1);

    const managers = groupList[0];
    expect(managers.name).toBe("Managers");
    expect(managers.memberCount).toBe(2);
    expect(managers.members.map((m: { employeeName: string }) => m.employeeName)).toEqual(
      expect.arrayContaining(["Sarah Chen", "Daniel Lee"]),
    );
  });
});

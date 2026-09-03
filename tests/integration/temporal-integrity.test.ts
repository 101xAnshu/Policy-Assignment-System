/**
 * Temporal & data-integrity guards: pre-hire emptiness, backdate rejection,
 * reconciler date guards, and group-membership duplicate handling.
 *
 * No direct DB writes for behavior: every transition goes through the API.
 * Raw SQL is used only to read back rows for invariant assertions.
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
  policyAssignments,
  employeeVersions,
  groupMemberships,
} from "@warp/db";
import { eq, and, isNull } from "drizzle-orm";

let server: http.Server;
let baseUrl: string;

// Sarah Chen hired 2024-08-28.
const HIRE = "2024-08-28";
const BEFORE_HIRE = "2024-08-27";
const AFTER_HIRE = "2024-09-15";

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

describe("Pre-hire evaluation returns empty state, never fabricated assignments", () => {
  it("GET resolve before hire is 404", async () => {
    const res = await fetch(`${baseUrl}/api/employees/${IDS.sarah}/resolve?at=${BEFORE_HIRE}`);
    expect(res.status).toBe(404);
  });

  it("GET assignments before hire is empty", async () => {
    const res = await fetch(`${baseUrl}/api/employees/${IDS.sarah}/assignments?at=${BEFORE_HIRE}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    const list = Array.isArray(body) ? body : body.assignments;
    expect(list).toHaveLength(0);
  });

  it("POST reconcile before hire fails explicitly instead of fabricating", async () => {
    const res = await fetch(`${baseUrl}/api/employees/${IDS.sarah}/reconcile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ at: BEFORE_HIRE }),
    });
    expect(res.status).not.toBe(200);
  });

  it("resolve on and after hire date succeeds", async () => {
    for (const at of [HIRE, AFTER_HIRE]) {
      const res = await fetch(`${baseUrl}/api/employees/${IDS.sarah}/resolve?at=${at}`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.assignments.length).toBeGreaterThan(0);
    }
  });
});

describe("Backdated employee PATCH is rejected and preserves history", () => {
  it("accepts a forward-dated change", async () => {
    const res = await fetch(`${baseUrl}/api/employees/${IDS.alex}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ department: "Finance", effectiveAt: "2024-10-01" }),
    });
    expect(res.status).toBe(200);
  });

  it("rejects a backdated change earlier than the open version start", async () => {
    const before = await db
      .select()
      .from(employeeVersions)
      .where(eq(employeeVersions.employeeId, IDS.alex));

    // Alex's open version now starts 2024-10-01; 2020 predates everything.
    const res = await fetch(`${baseUrl}/api/employees/${IDS.alex}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ department: "Legal", effectiveAt: "2020-01-01" }),
    });
    expect(res.status).toBe(400);

    const after = await db
      .select()
      .from(employeeVersions)
      .where(eq(employeeVersions.employeeId, IDS.alex));
    // History byte-identical: same rows, same intervals.
    expect(after.map((v) => [v.version, v.validFrom, v.validTo, v.department])).toEqual(
      before.map((v) => [v.version, v.validFrom, v.validTo, v.department]),
    );
    for (const v of after) {
      expect(v.validTo === null || v.validTo >= v.validFrom).toBe(true);
    }
  });
});

describe("Group membership duplicates and date guards", () => {
  it("second add of an active membership is an idempotent no-op", async () => {
    const first = await fetch(`${baseUrl}/api/groups/${IDS.managers}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId: IDS.alex, validFrom: "2024-09-01" }),
    });
    expect(first.status).toBe(201);

    const second = await fetch(`${baseUrl}/api/groups/${IDS.managers}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId: IDS.alex, validFrom: "2024-09-01" }),
    });
    expect(second.status).toBe(200);
    expect(((await second.json()) as any).duplicate).toBe(true);

    const rows = await db
      .select()
      .from(groupMemberships)
      .where(
        and(
          eq(groupMemberships.groupId, IDS.managers),
          eq(groupMemberships.employeeId, IDS.alex),
          isNull(groupMemberships.validTo),
        ),
      );
    expect(rows).toHaveLength(1);
  });

  it("remove with effectiveAt before membership start is rejected", async () => {
    const res = await fetch(`${baseUrl}/api/groups/${IDS.managers}/members/${IDS.alex}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ effectiveAt: "2020-01-01" }),
    });
    expect(res.status).toBe(400);

    // Membership still active and uninverted.
    const rows = await db
      .select()
      .from(groupMemberships)
      .where(
        and(
          eq(groupMemberships.groupId, IDS.managers),
          eq(groupMemberships.employeeId, IDS.alex),
          isNull(groupMemberships.validTo),
        ),
      );
    expect(rows).toHaveLength(1);
  });

  it("remove twice: first removes, second is an idempotent no-op", async () => {
    const first = await fetch(`${baseUrl}/api/groups/${IDS.managers}/members/${IDS.alex}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ effectiveAt: "2024-11-01" }),
    });
    expect(first.status).toBe(200);

    const second = await fetch(`${baseUrl}/api/groups/${IDS.managers}/members/${IDS.alex}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ effectiveAt: "2024-11-01" }),
    });
    expect(second.status).toBe(200);
    expect(((await second.json()) as any).duplicate).toBe(true);
  });
});

describe("Persisted intervals are never inverted", () => {
  it("effectiveTo >= effectiveFrom on every assignment after mixed-date operations", async () => {
    // Battery of operations across dates, including rejected pre-hire/backdate paths.
    await fetch(`${baseUrl}/api/employees/${IDS.sarah}/reconcile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ at: HIRE }),
    });
    await fetch(`${baseUrl}/api/employees/${IDS.sarah}/reconcile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ at: "2026-08-28" }),
    });
    await fetch(`${baseUrl}/api/companies/${IDS.acme}/reconcile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ at: AFTER_HIRE }),
    });
    await fetch(`${baseUrl}/api/worker/process-outbox`, { method: "POST" });

    const rows = await db.select().from(policyAssignments);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(
        row.effectiveTo === null || row.effectiveTo >= row.effectiveFrom,
        `inverted assignment ${row.id} [${row.effectiveFrom}, ${row.effectiveTo}]`,
      ).toBe(true);
    }

    const versions = await db.select().from(employeeVersions);
    for (const v of versions) {
      expect(
        v.validTo === null || v.validTo >= v.validFrom,
        `inverted employee version ${v.id} [${v.validFrom}, ${v.validTo}]`,
      ).toBe(true);
    }

    const memberships = await db.select().from(groupMemberships);
    for (const m of memberships) {
      expect(
        m.validTo === null || m.validTo >= m.validFrom,
        `inverted membership ${m.employeeId}/${m.groupId} [${m.validFrom}, ${m.validTo}]`,
      ).toBe(true);
    }
  });
});

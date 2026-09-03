/**
 * End-to-end rule versioning lifecycle via the public API (no direct DB writes).
 *
 * Covers: create v2 (validation + dependencies + increment + history preserved),
 * inspect v1+v2, publish v2 (explicit version, exactly one outbox event),
 * affected-population reconciliation, stale/duplicate/invalid publish behavior.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import { createApp } from "../../apps/web/src/app";
import { sql, IDS, seed, reset, db, outboxEvents, getActiveAssignmentsAt } from "@warp/db";
import { eq, and } from "drizzle-orm";

let server: http.Server;
let baseUrl: string;
const evalDate = "2024-08-28";
const ruleId = IDS.ruleStandardVacation;

async function rulePublishedCount(): Promise<number> {
  const rows = await db
    .select()
    .from(outboxEvents)
    .where(and(eq(outboxEvents.eventType, "RULE_PUBLISHED"), eq(outboxEvents.entityId, ruleId)));
  return rows.length;
}

beforeAll(async () => {
  await reset(false);
  await seed(false);
  return new Promise<void>((resolve) => {
    const app = createApp();
    server = app.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr === "object") baseUrl = `http://localhost:${addr.port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  await sql.end();
});

describe("Rule versioning lifecycle via API", () => {
  it("rejects an invalid predicate with 400 and creates no version", async () => {
    const before = await (await fetch(`${baseUrl}/api/rules/${ruleId}`)).json();
    expect(before.versions).toHaveLength(1);

    const res = await fetch(`${baseUrl}/api/rules/${ruleId}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ predicate: { type: "EQUALS", field: "nope", value: "x" }, priority: 70 }),
    });
    expect(res.status).toBe(400);

    const after = await (await fetch(`${baseUrl}/api/rules/${ruleId}`)).json();
    expect(after.versions).toHaveLength(1);
  });

  it("creates v2 as a pending draft: history preserved, live version untouched, no outbox", async () => {
    expect(await rulePublishedCount()).toBe(0);

    const res = await fetch(`${baseUrl}/api/rules/${ruleId}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        predicate: { type: "EQUALS", field: "employmentType", value: "FULL_TIME" },
        priority: 70,
        effectiveFrom: evalDate,
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.version.version).toBe(2);
    expect(body.version.priority).toBe(70);
    expect(body.version.dependencies.employeeFields).toContain("employmentType");

    const detail = await (await fetch(`${baseUrl}/api/rules/${ruleId}`)).json();
    expect(detail.versions).toHaveLength(2);
    expect(detail.versions.map((v: any) => v.version).sort()).toEqual([1, 2]);
    // Live state untouched until explicit publish.
    expect(detail.currentVersion).toBe(1);
    expect(detail.status).toBe("ACTIVE");
    expect(await rulePublishedCount()).toBe(0);
  });

  it("publishes v2 explicitly: one outbox event, currentVersion advances, history intact", async () => {
    // Baseline: Sarah gets CA Vacation (50 > 10) before v2 goes live.
    await fetch(`${baseUrl}/api/employees/${IDS.sarah}/reconcile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ at: evalDate }),
    });
    const before = await getActiveAssignmentsAt(IDS.sarah, evalDate);
    expect(before.find((a) => a.categoryId === IDS.catVacation)?.policyId).toBe(IDS.caVacation);

    const res = await fetch(`${baseUrl}/api/rules/${ruleId}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 2 }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.publishedVersion.version).toBe(2);
    expect(body.rule.currentVersion).toBe(2);
    expect(body.duplicate).toBeUndefined();

    expect(await rulePublishedCount()).toBe(1);
    const detail = await (await fetch(`${baseUrl}/api/rules/${ruleId}`)).json();
    expect(detail.versions).toHaveLength(2);
    expect(detail.currentVersion).toBe(2);
  });

  it("reconciles the affected population: Sarah flips to Standard v2", async () => {
    const outboxRes = await fetch(`${baseUrl}/api/worker/process-outbox`, { method: "POST" });
    expect(outboxRes.status).toBe(200);

    const after = await getActiveAssignmentsAt(IDS.sarah, evalDate);
    const vac = after.find((a) => a.categoryId === IDS.catVacation);
    expect(vac?.policyId).toBe(IDS.standardVacation);
    expect(vac?.sourceRuleVersion).toBe(2);
  });

  it("rejects stale publish of v1 with 409 and emits no new event", async () => {
    const res = await fetch(`${baseUrl}/api/rules/${ruleId}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 1 }),
    });
    expect(res.status).toBe(409);
    expect(await rulePublishedCount()).toBe(1);
  });

  it("treats duplicate publish of current v2 as idempotent no-op with no new event", async () => {
    const res = await fetch(`${baseUrl}/api/rules/${ruleId}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 2 }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.duplicate).toBe(true);
    expect(body.publishedVersion.version).toBe(2);
    expect(await rulePublishedCount()).toBe(1);
  });

  it("returns 404 for unknown versions and keeps legacy no-version publish idempotent", async () => {
    const missing = await fetch(`${baseUrl}/api/rules/${ruleId}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 99 }),
    });
    expect(missing.status).toBe(404);
    expect(await rulePublishedCount()).toBe(1);

    // Legacy callers omitting `version` resolve to latest (v2, already current).
    const legacy = await fetch(`${baseUrl}/api/rules/${ruleId}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(legacy.status).toBe(200);
    expect(((await legacy.json()) as any).duplicate).toBe(true);
    expect(await rulePublishedCount()).toBe(1);
  });
});

/**
 * Integration test for POST /api/system/verify-incremental.
 * Build Spec §41.
 *
 * Verifies that the endpoint runs 50 mutation scenarios and proves
 * that incremental scoped reconciliation strictly equals full clean-room recomputation.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import { createApp } from "../../apps/web/src/app";
import { sql } from "@warp/db";

let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
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

describe("POST /api/system/verify-incremental (§41)", () => {
  it("executes 50 random mutations and mathematically proves incremental vs full recompute equality", async () => {
    const res = await fetch(`${baseUrl}/api/system/verify-incremental`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(200);

    const report = (await res.json()) as any;

    expect(report.success).toBe(true);
    expect(report.equality).toBe(true);
    expect(report.mismatches).toHaveLength(0);

    expect(report.stats.totalEmployees).toBe(30);
    expect(report.stats.totalEventsApplied).toBe(50);
    expect(report.stats.incrementalAssignmentsCount).toBeGreaterThan(0);
    expect(report.stats.incrementalAssignmentsCount).toBe(
      report.stats.fullRecomputeAssignmentsCount,
    );

    expect(report.invariantsVerified.DeterminismInvariance).toBe("PASS");
    expect(report.invariantsVerified.CardinalityInvariance).toBe("PASS");
    expect(report.invariantsVerified.PriorityInvariance).toBe("PASS");
    expect(report.invariantsVerified.IncrementalReferenceEquivalence).toBe("PASS");

    expect(report.reproducibleSampleEvents.length).toBeGreaterThanOrEqual(10);
  });
});

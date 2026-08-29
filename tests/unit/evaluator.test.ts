/**
 * Unit tests for the Predicate Evaluator & Tenure Calculations.
 * Build Spec §10, §16.
 */

import { describe, it, expect } from "vitest";
import {
  evaluatePredicate,
  evaluatePredicateDetailed,
  computeTenureMonths,
} from "@warp/rule-engine";
import type { EmployeeContext, Predicate } from "@warp/domain";

const baseEmployee: EmployeeContext = {
  id: "e-001" as any,
  companyId: "c-001" as any,
  country: "US",
  state: "California",
  department: "Engineering",
  employmentType: "FULL_TIME",
  isManager: true,
  hireDate: "2024-08-28",
  groupIds: ["g-managers" as any],
};

// ─── Tenure Calculation (§16) ────────────────────────────────────────────────

describe("computeTenureMonths", () => {
  it("calculates exact 24 months for 2024-08-28 to 2026-08-28 (inclusive)", () => {
    expect(computeTenureMonths("2024-08-28", "2026-08-28")).toBe(24);
  });

  it("calculates 23 months on 2026-08-27 (one day before 2 year threshold)", () => {
    expect(computeTenureMonths("2024-08-28", "2026-08-27")).toBe(23);
  });

  it("calculates 24 months on 2026-08-29 (one day after 2 year threshold)", () => {
    expect(computeTenureMonths("2024-08-28", "2026-08-29")).toBe(24);
  });

  it("calculates 0 months on the exact hire date", () => {
    expect(computeTenureMonths("2024-08-28", "2024-08-28")).toBe(0);
  });

  it("calculates 0 months for evaluation date before hire date", () => {
    expect(computeTenureMonths("2024-08-28", "2024-01-01")).toBe(0);
  });

  it("calculates 12 months on exact 1 year anniversary", () => {
    expect(computeTenureMonths("2024-08-28", "2025-08-28")).toBe(12);
  });

  it("handles leap year hire date correctly", () => {
    // Leap year Feb 29
    expect(computeTenureMonths("2024-02-29", "2025-02-28")).toBe(11);
    expect(computeTenureMonths("2024-02-29", "2025-03-01")).toBe(12);
  });

  it("handles Date objects as well as ISO strings", () => {
    expect(computeTenureMonths("2024-08-28", new Date("2026-08-28T00:00:00Z"))).toBe(24);
  });
});

// ─── Predicate Evaluation ────────────────────────────────────────────────────

describe("evaluatePredicate", () => {
  it("evaluates empty ALL as true (all employees)", () => {
    const pred: Predicate = { type: "ALL", children: [] };
    expect(evaluatePredicate(pred, baseEmployee, "2024-08-28")).toBe(true);
  });

  it("evaluates EQUALS on state matching", () => {
    const pred: Predicate = { type: "EQUALS", field: "state", value: "California" };
    expect(evaluatePredicate(pred, baseEmployee, "2024-08-28")).toBe(true);
  });

  it("evaluates EQUALS on state non-matching", () => {
    const pred: Predicate = { type: "EQUALS", field: "state", value: "New York" };
    expect(evaluatePredicate(pred, baseEmployee, "2024-08-28")).toBe(false);
  });

  it("evaluates IS_MANAGER correctly", () => {
    expect(
      evaluatePredicate({ type: "IS_MANAGER", value: true }, baseEmployee, "2024-08-28"),
    ).toBe(true);
    expect(
      evaluatePredicate({ type: "IS_MANAGER", value: false }, baseEmployee, "2024-08-28"),
    ).toBe(false);
  });

  it("evaluates GROUP_MEMBER correctly", () => {
    expect(
      evaluatePredicate({ type: "GROUP_MEMBER", groupId: "g-managers" }, baseEmployee, "2024-08-28"),
    ).toBe(true);
    expect(
      evaluatePredicate({ type: "GROUP_MEMBER", groupId: "g-execs" }, baseEmployee, "2024-08-28"),
    ).toBe(false);
  });

  it("evaluates TENURE_AT_LEAST based on evaluation date", () => {
    const pred: Predicate = { type: "TENURE_AT_LEAST", durationMonths: 24 };

    // At hire date: 0 months -> false
    expect(evaluatePredicate(pred, baseEmployee, "2024-08-28")).toBe(false);

    // 1 day before 2 years: 23 months -> false
    expect(evaluatePredicate(pred, baseEmployee, "2026-08-27")).toBe(false);

    // Exact 2 years: 24 months -> true
    expect(evaluatePredicate(pred, baseEmployee, "2026-08-28")).toBe(true);

    // 3 years: 36 months -> true
    expect(evaluatePredicate(pred, baseEmployee, "2027-08-28")).toBe(true);
  });

  it("evaluates composite ALL correctly", () => {
    const caFullTime: Predicate = {
      type: "ALL",
      children: [
        { type: "EQUALS", field: "state", value: "California" },
        { type: "EQUALS", field: "employmentType", value: "FULL_TIME" },
      ],
    };

    expect(evaluatePredicate(caFullTime, baseEmployee, "2024-08-28")).toBe(true);

    const nonMatching: EmployeeContext = {
      ...baseEmployee,
      state: "New York",
    };
    expect(evaluatePredicate(caFullTime, nonMatching, "2024-08-28")).toBe(false);
  });
});

// ─── Detailed Predicate Evaluation (Condition Trail) ─────────────────────────

describe("evaluatePredicateDetailed", () => {
  it("provides matchedConditions and failedConditions descriptions", () => {
    const composite: Predicate = {
      type: "ALL",
      children: [
        { type: "EQUALS", field: "state", value: "California" },
        { type: "EQUALS", field: "department", value: "Sales" }, // fails
      ],
    };

    const res = evaluatePredicateDetailed(composite, baseEmployee, "2024-08-28");
    expect(res.matched).toBe(false);
    expect(res.matchedConditions).toContain("state = California");
    expect(res.failedConditions[0]).toContain("department = Sales (actual: Engineering)");
  });
});

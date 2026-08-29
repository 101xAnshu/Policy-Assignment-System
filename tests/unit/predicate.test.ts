/**
 * Domain type and predicate unit tests.
 *
 * These tests verify the predicate grammar, validation, dependency extraction,
 * and human-readable descriptions — all pure functions with no database dependency.
 */

import { describe, it, expect } from "vitest";
import {
  extractDependencies,
  validatePredicate,
  describePredicate,
} from "@warp/domain";
import type { Predicate, DependencySet } from "@warp/domain";

// ─── Predicate Validation ────────────────────────────────────────────────────

describe("validatePredicate", () => {
  it("validates a correct EQUALS predicate", () => {
    const pred = { type: "EQUALS", field: "state", value: "California" };
    expect(validatePredicate(pred)).toEqual([]);
  });

  it("validates a correct ALL predicate with children", () => {
    const pred = {
      type: "ALL",
      children: [
        { type: "EQUALS", field: "state", value: "California" },
        { type: "EQUALS", field: "employmentType", value: "FULL_TIME" },
      ],
    };
    expect(validatePredicate(pred)).toEqual([]);
  });

  it("validates an empty ALL predicate (matches all employees)", () => {
    const pred = { type: "ALL", children: [] };
    expect(validatePredicate(pred)).toEqual([]);
  });

  it("validates IS_MANAGER predicate", () => {
    expect(validatePredicate({ type: "IS_MANAGER", value: true })).toEqual([]);
    expect(validatePredicate({ type: "IS_MANAGER", value: false })).toEqual([]);
  });

  it("validates GROUP_MEMBER predicate", () => {
    const pred = { type: "GROUP_MEMBER", groupId: "some-uuid" };
    expect(validatePredicate(pred)).toEqual([]);
  });

  it("validates TENURE_AT_LEAST predicate", () => {
    const pred = { type: "TENURE_AT_LEAST", durationMonths: 24 };
    expect(validatePredicate(pred)).toEqual([]);
  });

  it("rejects EQUALS with invalid field", () => {
    const pred = { type: "EQUALS", field: "salary", value: "100000" };
    const errors = validatePredicate(pred);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("field");
  });

  it("rejects unknown predicate type", () => {
    const pred = { type: "BETWEEN", field: "age", low: 20, high: 30 };
    const errors = validatePredicate(pred);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("unknown predicate type");
  });

  it("rejects non-object predicate", () => {
    expect(validatePredicate("not an object")).toHaveLength(1);
    expect(validatePredicate(null)).toHaveLength(1);
    expect(validatePredicate(42)).toHaveLength(1);
  });

  it("rejects TENURE_AT_LEAST with non-positive duration", () => {
    expect(validatePredicate({ type: "TENURE_AT_LEAST", durationMonths: 0 })).toHaveLength(1);
    expect(validatePredicate({ type: "TENURE_AT_LEAST", durationMonths: -5 })).toHaveLength(1);
    expect(validatePredicate({ type: "TENURE_AT_LEAST", durationMonths: 1.5 })).toHaveLength(1);
  });

  it("rejects GROUP_MEMBER with empty groupId", () => {
    expect(validatePredicate({ type: "GROUP_MEMBER", groupId: "" })).toHaveLength(1);
  });

  it("validates nested ALL predicates and reports nested errors", () => {
    const pred = {
      type: "ALL",
      children: [
        { type: "EQUALS", field: "state", value: "California" },
        { type: "EQUALS", field: "badField", value: "oops" },
      ],
    };
    const errors = validatePredicate(pred);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("children[1]");
  });
});

// ─── Dependency Extraction ───────────────────────────────────────────────────

describe("extractDependencies", () => {
  it("extracts field dependency from EQUALS", () => {
    const pred: Predicate = { type: "EQUALS", field: "state", value: "CA" };
    const deps = extractDependencies(pred);
    expect(deps).toEqual({
      employeeFields: ["state"],
      groupIds: [],
      hasTemporalDependency: false,
    });
  });

  it("extracts isManager dependency from IS_MANAGER", () => {
    const pred: Predicate = { type: "IS_MANAGER", value: true };
    const deps = extractDependencies(pred);
    expect(deps.employeeFields).toContain("isManager");
  });

  it("extracts group dependency from GROUP_MEMBER", () => {
    const pred: Predicate = { type: "GROUP_MEMBER", groupId: "g1" };
    const deps = extractDependencies(pred);
    expect(deps.groupIds).toEqual(["g1"]);
  });

  it("extracts temporal dependency from TENURE_AT_LEAST", () => {
    const pred: Predicate = { type: "TENURE_AT_LEAST", durationMonths: 24 };
    const deps = extractDependencies(pred);
    expect(deps.hasTemporalDependency).toBe(true);
  });

  it("extracts combined dependencies from ALL", () => {
    const pred: Predicate = {
      type: "ALL",
      children: [
        { type: "EQUALS", field: "state", value: "CA" },
        { type: "EQUALS", field: "employmentType", value: "FULL_TIME" },
        { type: "GROUP_MEMBER", groupId: "managers" },
        { type: "TENURE_AT_LEAST", durationMonths: 12 },
      ],
    };
    const deps = extractDependencies(pred);
    expect(deps.employeeFields).toContain("state");
    expect(deps.employeeFields).toContain("employmentType");
    expect(deps.groupIds).toContain("managers");
    expect(deps.hasTemporalDependency).toBe(true);
  });

  it("deduplicates employee fields", () => {
    const pred: Predicate = {
      type: "ALL",
      children: [
        { type: "EQUALS", field: "state", value: "CA" },
        { type: "EQUALS", field: "state", value: "NY" },
      ],
    };
    const deps = extractDependencies(pred);
    expect(deps.employeeFields).toEqual(["state"]);
  });

  it("returns empty dependencies for empty ALL (all employees)", () => {
    const pred: Predicate = { type: "ALL", children: [] };
    const deps = extractDependencies(pred);
    expect(deps).toEqual({
      employeeFields: [],
      groupIds: [],
      hasTemporalDependency: false,
    });
  });
});

// ─── Human-readable Description ──────────────────────────────────────────────

describe("describePredicate", () => {
  it("describes EQUALS", () => {
    const pred: Predicate = { type: "EQUALS", field: "state", value: "California" };
    expect(describePredicate(pred)).toBe("state = California");
  });

  it("describes IS_MANAGER true", () => {
    const pred: Predicate = { type: "IS_MANAGER", value: true };
    expect(describePredicate(pred)).toBe("is a manager");
  });

  it("describes IS_MANAGER false", () => {
    const pred: Predicate = { type: "IS_MANAGER", value: false };
    expect(describePredicate(pred)).toBe("is not a manager");
  });

  it("describes GROUP_MEMBER", () => {
    const pred: Predicate = { type: "GROUP_MEMBER", groupId: "abc" };
    expect(describePredicate(pred)).toBe("member of group abc");
  });

  it("describes TENURE_AT_LEAST", () => {
    const pred: Predicate = { type: "TENURE_AT_LEAST", durationMonths: 24 };
    expect(describePredicate(pred)).toBe("tenure ≥ 24 months");
  });

  it("describes empty ALL as 'all employees'", () => {
    const pred: Predicate = { type: "ALL", children: [] };
    expect(describePredicate(pred)).toBe("all employees");
  });

  it("describes ALL with children as AND-joined", () => {
    const pred: Predicate = {
      type: "ALL",
      children: [
        { type: "EQUALS", field: "state", value: "California" },
        { type: "EQUALS", field: "employmentType", value: "FULL_TIME" },
      ],
    };
    expect(describePredicate(pred)).toBe(
      "state = California AND employmentType = FULL_TIME",
    );
  });
});

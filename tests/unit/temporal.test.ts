/**
 * Unit tests for Temporal Semantics & Interval Math.
 *
 * Invariants:
 * - All intervals are half-open: [from, to)
 * - Touching boundaries (e.g. [Jan 1, Mar 1) and [Mar 1, Jun 1)) DO NOT overlap.
 * - [from, null) means unbounded future.
 */

import { describe, it, expect } from "vitest";
import { intervalsOverlap, formatDateStr } from "@warp/db";

describe("formatDateStr", () => {
  it("formats ISO string to YYYY-MM-DD", () => {
    expect(formatDateStr("2024-08-28T14:32:00.000Z")).toBe("2024-08-28");
    expect(formatDateStr("2024-08-28")).toBe("2024-08-28");
  });

  it("formats Date object to YYYY-MM-DD", () => {
    expect(formatDateStr(new Date("2024-08-28T00:00:00Z"))).toBe("2024-08-28");
  });
});

describe("intervalsOverlap (Half-open [from, to) semantics)", () => {
  it("returns FALSE for adjacent touching intervals (no gap, no overlap)", () => {
    // [2025-01-01, 2025-03-01) and [2025-03-01, 2025-06-01)
    expect(
      intervalsOverlap("2025-01-01", "2025-03-01", "2025-03-01", "2025-06-01"),
    ).toBe(false);

    // Symmetric check
    expect(
      intervalsOverlap("2025-03-01", "2025-06-01", "2025-01-01", "2025-03-01"),
    ).toBe(false);
  });

  it("returns TRUE for overlapping bounded intervals", () => {
    // [2025-01-01, 2025-03-02) and [2025-03-01, 2025-06-01) - overlaps on 2025-03-01
    expect(
      intervalsOverlap("2025-01-01", "2025-03-02", "2025-03-01", "2025-06-01"),
    ).toBe(true);

    // Completely nested interval: [2025-01-01, 2025-12-31) and [2025-03-01, 2025-06-01)
    expect(
      intervalsOverlap("2025-01-01", "2025-12-31", "2025-03-01", "2025-06-01"),
    ).toBe(true);
  });

  it("returns FALSE for disjoint non-touching intervals", () => {
    // [2025-01-01, 2025-02-01) and [2025-03-01, 2025-04-01)
    expect(
      intervalsOverlap("2025-01-01", "2025-02-01", "2025-03-01", "2025-04-01"),
    ).toBe(false);
  });

  it("handles unbounded future (to = null) correctly", () => {
    // [2025-01-01, null) and [2025-03-01, 2025-06-01) -> overlap!
    expect(
      intervalsOverlap("2025-01-01", null, "2025-03-01", "2025-06-01"),
    ).toBe(true);

    // [2025-01-01, 2025-02-01) and [2025-03-01, null) -> disjoint!
    expect(
      intervalsOverlap("2025-01-01", "2025-02-01", "2025-03-01", null),
    ).toBe(false);

    // Two unbounded intervals: [2025-01-01, null) and [2025-05-01, null) -> overlap!
    expect(
      intervalsOverlap("2025-01-01", null, "2025-05-01", null),
    ).toBe(true);
  });
});

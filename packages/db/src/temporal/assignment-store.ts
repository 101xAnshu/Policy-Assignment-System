/**
 * Temporal Assignment Store.
 * Build Spec §15, §17, §18.
 *
 * Manages persisted policy assignments with temporal half-open intervals [effectiveFrom, effectiveTo).
 * Guarantees:
 * - P6: Explicit temporal validity.
 * - P7: Stable explanation snapshots attached to historical records (§18).
 * - Cardinality: For ONE categories, validates that no two assignments overlap in time.
 */

import { db } from "../connection";
import {
  policyAssignments,
  policies,
  policyCategories,
  assignmentRules,
} from "../schema/index";
import { eq, and, lte, or, isNull, gt, sql } from "drizzle-orm";
import type {
  PolicyAssignment,
  ExplanationSnapshot,
  PolicyAssignmentId,
  EmployeeId,
  PolicyId,
  PolicyCategoryId,
  AssignmentRuleId,
} from "@warp/domain";

/**
 * Format a Date or date string to ISO YYYY-MM-DD.
 */
export function formatDateStr(d: string | Date): string {
  if (typeof d === "string") {
    return d.split("T")[0];
  }
  return d.toISOString().split("T")[0];
}

/**
 * Check if two half-open intervals [from1, to1) and [from2, to2) overlap.
 *
 * Two half-open intervals overlap if and only if:
 *   from1 < to2 (or to2 is unbounded/null) AND from2 < to1 (or to1 is unbounded/null)
 */
export function intervalsOverlap(
  from1: string,
  to1: string | null,
  from2: string,
  to2: string | null,
): boolean {
  const from1BeforeTo2 = to2 === null || from1 < to2;
  const from2BeforeTo1 = to1 === null || from2 < to1;
  return from1BeforeTo2 && from2BeforeTo1;
}

/**
 * Get active policy assignments for an employee as of a specific date.
 * Filter: effectiveFrom <= at AND (effectiveTo IS NULL OR at < effectiveTo)
 */
export async function getActiveAssignmentsAt(
  employeeId: string,
  at: string | Date,
) {
  const atStr = formatDateStr(at);

  const rows = await db
    .select({
      id: policyAssignments.id,
      employeeId: policyAssignments.employeeId,
      policyId: policyAssignments.policyId,
      policyName: policies.name,
      categoryId: policyAssignments.categoryId,
      categoryKey: policyCategories.key,
      categoryName: policyCategories.name,
      cardinality: policyCategories.cardinality,
      sourceRuleId: policyAssignments.sourceRuleId,
      sourceRuleVersion: policyAssignments.sourceRuleVersion,
      effectiveFrom: policyAssignments.effectiveFrom,
      effectiveTo: policyAssignments.effectiveTo,
      explanationSnapshot: policyAssignments.explanationSnapshot,
      createdAt: policyAssignments.createdAt,
      updatedAt: policyAssignments.updatedAt,
    })
    .from(policyAssignments)
    .innerJoin(policies, eq(policyAssignments.policyId, policies.id))
    .innerJoin(
      policyCategories,
      eq(policyAssignments.categoryId, policyCategories.id),
    )
    .where(
      and(
        eq(policyAssignments.employeeId, employeeId),
        lte(policyAssignments.effectiveFrom, atStr),
        or(
          isNull(policyAssignments.effectiveTo),
          gt(policyAssignments.effectiveTo, atStr),
        ),
      ),
    )
    .orderBy(policyCategories.name, policies.name);

  return rows;
}

/**
 * Get the complete historical timeline of all assignments for an employee.
 */
export async function getAssignmentHistory(employeeId: string) {
  const rows = await db
    .select({
      id: policyAssignments.id,
      employeeId: policyAssignments.employeeId,
      policyId: policyAssignments.policyId,
      policyName: policies.name,
      categoryId: policyAssignments.categoryId,
      categoryKey: policyCategories.key,
      categoryName: policyCategories.name,
      cardinality: policyCategories.cardinality,
      sourceRuleId: policyAssignments.sourceRuleId,
      sourceRuleVersion: policyAssignments.sourceRuleVersion,
      effectiveFrom: policyAssignments.effectiveFrom,
      effectiveTo: policyAssignments.effectiveTo,
      explanationSnapshot: policyAssignments.explanationSnapshot,
      createdAt: policyAssignments.createdAt,
      updatedAt: policyAssignments.updatedAt,
    })
    .from(policyAssignments)
    .innerJoin(policies, eq(policyAssignments.policyId, policies.id))
    .innerJoin(
      policyCategories,
      eq(policyAssignments.categoryId, policyCategories.id),
    )
    .where(eq(policyAssignments.employeeId, employeeId))
    .orderBy(
      policyCategories.name,
      policyAssignments.effectiveFrom,
      policies.name,
    );

  return rows;
}

/**
 * Get the frozen explanation snapshot for a specific assignment ID.
 * Build Spec §18, §29.
 */
export async function getAssignmentExplanation(assignmentId: string) {
  const [row] = await db
    .select({
      id: policyAssignments.id,
      employeeId: policyAssignments.employeeId,
      policyId: policyAssignments.policyId,
      policyName: policies.name,
      categoryId: policyAssignments.categoryId,
      categoryName: policyCategories.name,
      cardinality: policyCategories.cardinality,
      sourceRuleId: policyAssignments.sourceRuleId,
      sourceRuleVersion: policyAssignments.sourceRuleVersion,
      effectiveFrom: policyAssignments.effectiveFrom,
      effectiveTo: policyAssignments.effectiveTo,
      explanationSnapshot: policyAssignments.explanationSnapshot,
      createdAt: policyAssignments.createdAt,
    })
    .from(policyAssignments)
    .innerJoin(policies, eq(policyAssignments.policyId, policies.id))
    .innerJoin(
      policyCategories,
      eq(policyAssignments.categoryId, policyCategories.id),
    )
    .where(eq(policyAssignments.id, assignmentId));

  if (!row) return null;

  return row;
}

/**
 * Validate that a proposed assignment interval does not overlap with existing
 * assignments for the same employee in a ONE category.
 */
export async function checkOneCategoryOverlap(
  employeeId: string,
  categoryId: string,
  effectiveFrom: string,
  effectiveTo: string | null,
  excludeAssignmentId?: string,
): Promise<{ hasOverlap: boolean; conflictingAssignment?: typeof policyAssignments.$inferSelect }> {
  // 1. Fetch all existing assignments for this employee in this category
  const existing = await db
    .select()
    .from(policyAssignments)
    .where(
      and(
        eq(policyAssignments.employeeId, employeeId),
        eq(policyAssignments.categoryId, categoryId),
      ),
    );

  for (const record of existing) {
    if (excludeAssignmentId && record.id === excludeAssignmentId) {
      continue;
    }

    if (
      intervalsOverlap(
        effectiveFrom,
        effectiveTo,
        record.effectiveFrom,
        record.effectiveTo,
      )
    ) {
      return { hasOverlap: true, conflictingAssignment: record };
    }
  }

  return { hasOverlap: false };
}

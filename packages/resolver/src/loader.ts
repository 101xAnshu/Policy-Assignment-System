/**
 * Database Loaders for Point-in-Time Policy Resolution.
 * Build Spec §12, §15.
 *
 * Assembles the EmployeeContext and EvaluatableRule[] from PostgreSQL
 * valid at a specific point in time [validFrom, validTo).
 */

import { db } from "@warp/db";
import {
  employees,
  employeeVersions,
  groupMemberships,
  assignmentRules,
  assignmentRuleVersions,
  policies,
  policyCategories,
} from "@warp/db";
import { eq, and, lte, or, isNull, gt, sql } from "drizzle-orm";
import type {
  EmployeeContext,
  EmployeeId,
  CompanyId,
  GroupId,
  AssignmentRuleId,
  AssignmentRuleVersionId,
  PolicyId,
  PolicyCategoryId,
  Cardinality,
  Predicate,
} from "@warp/domain";
import type { EvaluatableRule } from "./types";
import { formatDate } from "./resolver";

/**
 * Load an employee's context as of a specific date.
 */
export async function loadEmployeeContextAt(
  employeeId: string,
  at: string | Date,
): Promise<EmployeeContext | null> {
  const atDateStr = formatDate(at);

  // 1. Find the employee version valid at `atDateStr`
  const [versionRecord] = await db
    .select()
    .from(employeeVersions)
    .where(
      and(
        eq(employeeVersions.employeeId, employeeId),
        lte(employeeVersions.validFrom, atDateStr),
        or(
          isNull(employeeVersions.validTo),
          gt(employeeVersions.validTo, atDateStr),
        ),
      ),
    )
    .limit(1);

  // If no version record found for this historical date, check if employee exists
  let empState = versionRecord;
  let companyId: string;

  if (!empState) {
    const [currentEmp] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, employeeId));

    if (!currentEmp) {
      return null;
    }
    empState = currentEmp as any;
    companyId = currentEmp.companyId;
  } else {
    // Get companyId from employees record
    const [currentEmp] = await db
      .select({ companyId: employees.companyId })
      .from(employees)
      .where(eq(employees.id, employeeId));
    companyId = currentEmp ? currentEmp.companyId : "";
  }

  // 2. Find group memberships valid at `atDateStr`
  const activeMemberships = await db
    .select({ groupId: groupMemberships.groupId })
    .from(groupMemberships)
    .where(
      and(
        eq(groupMemberships.employeeId, employeeId),
        lte(groupMemberships.validFrom, atDateStr),
        or(
          isNull(groupMemberships.validTo),
          gt(groupMemberships.validTo, atDateStr),
        ),
      ),
    );

  return {
    id: employeeId as EmployeeId,
    companyId: companyId as CompanyId,
    country: empState.country,
    state: empState.state,
    department: empState.department,
    employmentType: empState.employmentType as any,
    isManager: empState.isManager,
    hireDate: empState.hireDate,
    groupIds: activeMemberships.map((m) => m.groupId as GroupId),
  };
}

/**
 * Load all active rules for a company as of a specific date.
 */
export async function loadActiveRulesAt(
  companyId: string,
  at: string | Date,
): Promise<EvaluatableRule[]> {
  const atDateStr = formatDate(at);

  // Select active rules and their currently published version
  const rows = await db
    .select({
      ruleId: assignmentRules.id,
      ruleVersionId: assignmentRuleVersions.id,
      version: assignmentRuleVersions.version,
      policyId: policies.id,
      policyName: policies.name,
      categoryId: policyCategories.id,
      categoryKey: policyCategories.key,
      categoryName: policyCategories.name,
      cardinality: policyCategories.cardinality,
      predicate: assignmentRuleVersions.predicate,
      priority: assignmentRuleVersions.priority,
      effectiveFrom: assignmentRuleVersions.effectiveFrom,
      effectiveTo: assignmentRuleVersions.effectiveTo,
    })
    .from(assignmentRules)
    .innerJoin(
      assignmentRuleVersions,
      and(
        eq(assignmentRules.id, assignmentRuleVersions.ruleId),
        eq(assignmentRules.currentVersion, assignmentRuleVersions.version),
      ),
    )
    .innerJoin(policies, eq(assignmentRules.policyId, policies.id))
    .innerJoin(
      policyCategories,
      eq(assignmentRules.categoryId, policyCategories.id),
    )
    .where(
      and(
        eq(assignmentRules.companyId, companyId),
        eq(assignmentRules.status, "ACTIVE"),
        lte(assignmentRuleVersions.effectiveFrom, atDateStr),
        or(
          isNull(assignmentRuleVersions.effectiveTo),
          gt(assignmentRuleVersions.effectiveTo, atDateStr),
        ),
      ),
    );

  return rows.map((r) => ({
    ruleId: r.ruleId as AssignmentRuleId,
    ruleVersionId: r.ruleVersionId as AssignmentRuleVersionId,
    version: r.version,
    policyId: r.policyId as PolicyId,
    policyName: r.policyName,
    categoryId: r.categoryId as PolicyCategoryId,
    categoryKey: r.categoryKey,
    categoryName: r.categoryName,
    cardinality: r.cardinality as Cardinality,
    predicate: r.predicate as Predicate,
    priority: r.priority,
    effectiveFrom: r.effectiveFrom,
    effectiveTo: r.effectiveTo,
  }));
}

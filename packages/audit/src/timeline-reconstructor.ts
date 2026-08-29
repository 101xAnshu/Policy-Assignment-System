/**
 * Point-in-Time Timeline Reconstruction.
 * Build Spec §28, §29.
 *
 * Merges employee attribute changes, policy assignment lifecycles, and audit records
 * into a single unified chronological timeline for complete historic visibility.
 */

import {
  db,
  employeeVersions,
  policyAssignments,
  policies,
  policyCategories,
  auditEvents,
  employees,
} from "@warp/db";
import { eq, desc, asc } from "drizzle-orm";

export interface TimelineEntry {
  id: string;
  effectiveAt: string;
  recordedAt: string;
  type: "EMPLOYEE_VERSION" | "POLICY_ASSIGNMENT" | "AUDIT_EVENT";
  title: string;
  description: string;
  metadata: Record<string, any>;
}

export async function reconstructEmployeeTimeline(
  employeeId: string,
): Promise<{
  employeeId: string;
  employeeName: string;
  totalEvents: number;
  timeline: TimelineEntry[];
}> {
  const [employee] = await db
    .select({ name: employees.name })
    .from(employees)
    .where(eq(employees.id, employeeId));

  const employeeName = employee ? employee.name : "Unknown";

  // 1. Fetch employee version changes
  const versions = await db
    .select()
    .from(employeeVersions)
    .where(eq(employeeVersions.employeeId, employeeId))
    .orderBy(asc(employeeVersions.validFrom));

  // 2. Fetch all historical policy assignments
  const assignments = await db
    .select({
      id: policyAssignments.id,
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
    .where(eq(policyAssignments.employeeId, employeeId))
    .orderBy(asc(policyAssignments.effectiveFrom));

  // 3. Fetch audit events
  const audits = await db
    .select()
    .from(auditEvents)
    .orderBy(asc(auditEvents.effectiveAt));

  // Filter audits for this employee
  const employeeAudits = audits.filter(
    (a) => (a.payload as any)?.employeeId === employeeId,
  );

  const timeline: TimelineEntry[] = [];

  // Add version entries
  for (const v of versions) {
    timeline.push({
      id: `ver-${v.id}`,
      effectiveAt: v.validFrom,
      recordedAt: v.createdAt ? v.createdAt.toISOString() : v.validFrom,
      type: "EMPLOYEE_VERSION",
      title: `Employee Profile Version ${v.version}`,
      description: `${v.department} • ${v.employmentType} in ${v.state ?? v.country}${v.isManager ? " (Manager)" : ""}`,
      metadata: {
        version: v.version,
        validFrom: v.validFrom,
        validTo: v.validTo,
        state: v.state,
        country: v.country,
        department: v.department,
        employmentType: v.employmentType,
        isManager: v.isManager,
      },
    });
  }

  // Add assignment lifecycle entries
  for (const a of assignments) {
    timeline.push({
      id: `assign-start-${a.id}`,
      effectiveAt: a.effectiveFrom,
      recordedAt: a.createdAt ? a.createdAt.toISOString() : a.effectiveFrom,
      type: "POLICY_ASSIGNMENT",
      title: `Policy Assigned: ${a.policyName}`,
      description: `Category: ${a.categoryName} (${a.cardinality}) • Rule v${a.sourceRuleVersion}`,
      metadata: {
        action: "ASSIGNED",
        assignmentId: a.id,
        policyName: a.policyName,
        categoryName: a.categoryName,
        effectiveFrom: a.effectiveFrom,
        effectiveTo: a.effectiveTo,
        explanationSnapshot: a.explanationSnapshot,
      },
    });

    if (a.effectiveTo) {
      timeline.push({
        id: `assign-end-${a.id}`,
        effectiveAt: a.effectiveTo,
        recordedAt: a.createdAt ? a.createdAt.toISOString() : a.effectiveTo,
        type: "POLICY_ASSIGNMENT",
        title: `Policy Revoked / Replaced: ${a.policyName}`,
        description: `Ended validity on ${a.effectiveTo}`,
        metadata: {
          action: "REVOKED",
          assignmentId: a.id,
          policyName: a.policyName,
          categoryName: a.categoryName,
          effectiveFrom: a.effectiveFrom,
          effectiveTo: a.effectiveTo,
        },
      });
    }
  }

  // Add audit records
  for (const aud of employeeAudits) {
    timeline.push({
      id: `audit-${aud.id}`,
      effectiveAt: aud.effectiveAt,
      recordedAt: aud.recordedAt ? aud.recordedAt.toISOString() : aud.effectiveAt,
      type: "AUDIT_EVENT",
      title: `Audit: ${aud.eventType.replace(/_/g, " ")}`,
      description: `Actor: ${aud.actor}`,
      metadata: {
        actor: aud.actor,
        eventType: aud.eventType,
        payload: aud.payload,
      },
    });
  }

  // Sort strictly by effectiveAt ascending, then recordedAt ascending
  timeline.sort((a, b) => {
    if (a.effectiveAt !== b.effectiveAt) {
      return a.effectiveAt.localeCompare(b.effectiveAt);
    }
    return a.recordedAt.localeCompare(b.recordedAt);
  });

  return {
    employeeId,
    employeeName,
    totalEvents: timeline.length,
    timeline,
  };
}

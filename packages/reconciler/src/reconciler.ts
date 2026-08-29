/**
 * Idempotent Reconciliation Engine.
 * Build Spec §19, §20, §24, §25.
 *
 * Coordinates point-in-time state loading, deterministic resolution,
 * diff calculation, and atomic transactional database convergence.
 *
 * Principles:
 * P4 — Idempotent: Executing reconcile multiple times produces zero changes after convergence.
 * P5 — Events trigger work; events are not truth. Reads authoritative DB state on execution.
 * P8 — Complete explainability audit trail created atomically with assignments.
 */

import {
  db,
  policyAssignments,
  auditEvents,
  employees,
  getActiveAssignmentsAt,
} from "@warp/db";
import { eq, and, sql } from "drizzle-orm";
import {
  resolve,
  loadEmployeeContextAt,
  loadActiveRulesAt,
  formatDate,
} from "@warp/resolver";
import type { ResolutionResult } from "@warp/domain";
import { computeDiff, type DiffResult, type ActualAssignment } from "./diff";
import { scheduleFutureTemporalJobs } from "./temporal-planner";

export interface ReconcileResult {
  employeeId: string;
  evaluationDate: string;
  resolution: ResolutionResult;
  diff: DiffResult;
  auditEventIds: string[];
  scheduledJobs: Array<{ triggerAt: string; reason: string }>;
}

export interface CompanyReconcileResult {
  companyId: string;
  evaluationDate: string;
  totalEmployees: number;
  totalAdded: number;
  totalRevoked: number;
  totalUpdated: number;
  totalUnchanged: number;
  employeeResults: ReconcileResult[];
}

/**
 * Preview reconciliation changes for an employee without applying to the database.
 * Build Spec §23.
 */
export async function previewReconcile(
  employeeId: string,
  at: string | Date,
): Promise<{
  employeeId: string;
  evaluationDate: string;
  resolution: ResolutionResult;
  diff: DiffResult;
}> {
  const atStr = formatDate(at);

  // 1. Load employee context at date
  const employee = await loadEmployeeContextAt(employeeId, atStr);
  if (!employee) {
    throw new Error(`Employee ${employeeId} not found or inactive at ${atStr}`);
  }

  // 2. Load active rules for employee's company at date
  const rules = await loadActiveRulesAt(employee.companyId, atStr);

  // 3. Resolve desired state
  const resolution = resolve(employee, rules, atStr);

  // 4. Load actual assignments at date
  const actuals = (await getActiveAssignmentsAt(employeeId, atStr)) as ActualAssignment[];

  // 5. Compute diff
  const diff = computeDiff(resolution.assignments, actuals, resolution.decisions, atStr);

  return {
    employeeId,
    evaluationDate: atStr,
    resolution,
    diff,
  };
}

/**
 * Transactionally reconcile an employee's materialized assignments.
 * Build Spec §24.
 */
export async function reconcileEmployee(
  employeeId: string,
  at: string | Date,
  options?: { actor?: string },
): Promise<ReconcileResult> {
  const atStr = formatDate(at);
  const actor = options?.actor ?? "system:reconciler";

  // 1. Preview changes (load state + resolve + diff)
  const { employeeId: id, evaluationDate, resolution, diff } = await previewReconcile(
    employeeId,
    atStr,
  );

  const auditEventIds: string[] = [];

  // If there are changes, apply them transactionally
  if (diff.hasChanges) {
    await db.transaction(async (tx) => {
      // 1. Process revocations: set effectiveTo = atStr
      for (const rev of diff.toRevoke) {
        await tx
          .update(policyAssignments)
          .set({
            effectiveTo: atStr,
            updatedAt: new Date(),
          })
          .where(eq(policyAssignments.id, rev.id));

        // Audit revocation
        const [audit] = await tx
          .insert(auditEvents)
          .values({
            companyId: (await getCompanyIdForEmployee(employeeId))!,
            actor,
            eventType: "POLICY_REVOKED",
            entityType: "POLICY_ASSIGNMENT",
            entityId: rev.id,
            effectiveAt: atStr,
            payload: {
              employeeId,
              policyId: rev.policyId,
              categoryId: rev.categoryId,
              revokedAt: atStr,
              previousRuleId: rev.sourceRuleId,
              previousRuleVersion: rev.sourceRuleVersion,
            },
          })
          .returning({ id: auditEvents.id });

        auditEventIds.push(audit.id);
      }

      // 2. Process updates (version/rule changes)
      for (const upd of diff.toUpdate) {
        // Close previous assignment
        await tx
          .update(policyAssignments)
          .set({
            effectiveTo: atStr,
            updatedAt: new Date(),
          })
          .where(eq(policyAssignments.id, upd.actual.id));

        // Insert new assignment with new version
        const [inserted] = await tx
          .insert(policyAssignments)
          .values({
            employeeId,
            policyId: upd.desired.policyId,
            categoryId: upd.desired.categoryId,
            sourceRuleId: upd.desired.sourceRuleId,
            sourceRuleVersion: upd.desired.sourceRuleVersion,
            effectiveFrom: atStr,
            effectiveTo: null,
            explanationSnapshot: upd.explanationSnapshot,
          })
          .returning();

        // Audit update
        const [audit] = await tx
          .insert(auditEvents)
          .values({
            companyId: (await getCompanyIdForEmployee(employeeId))!,
            actor,
            eventType: "POLICY_UPDATED",
            entityType: "POLICY_ASSIGNMENT",
            entityId: inserted.id,
            effectiveAt: atStr,
            payload: {
              employeeId,
              policyId: upd.desired.policyId,
              categoryId: upd.desired.categoryId,
              newRuleId: upd.desired.sourceRuleId,
              newRuleVersion: upd.desired.sourceRuleVersion,
              previousRuleVersion: upd.actual.sourceRuleVersion,
              explanationSnapshot: upd.explanationSnapshot,
            },
          })
          .returning({ id: auditEvents.id });

        auditEventIds.push(audit.id);
      }

      // 3. Process additions
      for (const add of diff.toAdd) {
        const [inserted] = await tx
          .insert(policyAssignments)
          .values({
            employeeId,
            policyId: add.policyId,
            categoryId: add.categoryId,
            sourceRuleId: add.sourceRuleId,
            sourceRuleVersion: add.sourceRuleVersion,
            effectiveFrom: atStr,
            effectiveTo: null,
            explanationSnapshot: add.explanationSnapshot,
          })
          .returning();

        // Audit addition
        const [audit] = await tx
          .insert(auditEvents)
          .values({
            companyId: (await getCompanyIdForEmployee(employeeId))!,
            actor,
            eventType: "POLICY_ASSIGNED",
            entityType: "POLICY_ASSIGNMENT",
            entityId: inserted.id,
            effectiveAt: atStr,
            payload: {
              employeeId,
              policyId: add.policyId,
              categoryId: add.categoryId,
              sourceRuleId: add.sourceRuleId,
              sourceRuleVersion: add.sourceRuleVersion,
              explanationSnapshot: add.explanationSnapshot,
            },
          })
          .returning({ id: auditEvents.id });

        auditEventIds.push(audit.id);
      }
    });
  }

  // 4. Schedule any future temporal boundary jobs
  const employeeContext = await loadEmployeeContextAt(employeeId, atStr);
  let scheduledJobs: Array<{ triggerAt: string; reason: string }> = [];

  if (employeeContext) {
    const rules = await loadActiveRulesAt(employeeContext.companyId, atStr);
    scheduledJobs = await scheduleFutureTemporalJobs(employeeContext, rules, atStr);
  }

  return {
    employeeId,
    evaluationDate: atStr,
    resolution,
    diff,
    auditEventIds,
    scheduledJobs,
  };
}

/**
 * Reconcile all employees across a company.
 * Build Spec §24.
 */
export async function reconcileCompany(
  companyId: string,
  at: string | Date,
  options?: { actor?: string },
): Promise<CompanyReconcileResult> {
  const atStr = formatDate(at);

  const allEmployees = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.companyId, companyId));

  let totalAdded = 0;
  let totalRevoked = 0;
  let totalUpdated = 0;
  let totalUnchanged = 0;
  const employeeResults: ReconcileResult[] = [];

  for (const emp of allEmployees) {
    const res = await reconcileEmployee(emp.id, atStr, options);
    totalAdded += res.diff.summary.added;
    totalRevoked += res.diff.summary.revoked;
    totalUpdated += res.diff.summary.updated;
    totalUnchanged += res.diff.summary.unchanged;
    employeeResults.push(res);
  }

  return {
    companyId,
    evaluationDate: atStr,
    totalEmployees: allEmployees.length,
    totalAdded,
    totalRevoked,
    totalUpdated,
    totalUnchanged,
    employeeResults,
  };
}

async function getCompanyIdForEmployee(employeeId: string): Promise<string | null> {
  const [emp] = await db
    .select({ companyId: employees.companyId })
    .from(employees)
    .where(eq(employees.id, employeeId));
  return emp ? emp.companyId : null;
}

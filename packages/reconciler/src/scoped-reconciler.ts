/**
 * Scoped Incremental Reconciliation.
 *
 * Evaluates and reconciles only a specific subset of policy categories (e.g. Vacation & Training
 * when employee state changes from NY to CA), completely skipping all unaffected categories
 * while maintaining 100% mathematical equivalence to full recompute.
 */

import {
  db,
  policyAssignments,
  auditEvents,
  employees,
  getActiveAssignmentsAt,
} from "@warp/db";
import { eq, and } from "drizzle-orm";
import {
  resolve,
  loadEmployeeContextAt,
  loadActiveRulesAt,
  formatDate,
} from "@warp/resolver";
import { computeDiff, type DiffResult, type ActualAssignment } from "./diff";
import type { ReconcileResult } from "./reconciler";
import { scheduleFutureTemporalJobs } from "./temporal-planner";

/**
 * Reconcile an employee scoped to specific affected category IDs.
 */
export async function reconcileEmployeeScoped(
  employeeId: string,
  targetCategoryIds: string[] | Set<string>,
  at: string | Date,
  options?: { actor?: string },
): Promise<ReconcileResult> {
  const atStr = formatDate(at);
  const actor = options?.actor ?? "system:scoped-reconciler";
  const categorySet = new Set(targetCategoryIds);

  // If no categories are affected, return early with zero changes
  if (categorySet.size === 0) {
    const employee = await loadEmployeeContextAt(employeeId, atStr);
    return {
      employeeId,
      evaluationDate: atStr,
      resolution: { assignments: [], decisions: [] },
      diff: {
        toAdd: [],
        toRevoke: [],
        toUpdate: [],
        unchanged: [],
        hasChanges: false,
        summary: { added: 0, revoked: 0, updated: 0, unchanged: 0 },
      },
      auditEventIds: [],
      scheduledJobs: [],
    };
  }

  // 1. Load employee context
  const employee = await loadEmployeeContextAt(employeeId, atStr);
  if (!employee) {
    throw new Error(`Employee ${employeeId} not found at ${atStr}`);
  }

  // 2. Load active rules and filter to only rules belonging to the targeted categories
  const allRules = await loadActiveRulesAt(employee.companyId, atStr);
  const scopedRules = allRules.filter((r) => categorySet.has(r.categoryId));

  // 3. Resolve desired state for the scoped rules
  const scopedResolution = resolve(employee, scopedRules, atStr);

  // 4. Load actual assignments and filter to only targeted categories
  const allActuals = (await getActiveAssignmentsAt(employeeId, atStr)) as ActualAssignment[];
  const scopedActuals = allActuals.filter((a) => categorySet.has(a.categoryId));

  // 5. Compute diff only across the targeted categories
  const diff = computeDiff(
    scopedResolution.assignments,
    scopedActuals,
    scopedResolution.decisions,
    atStr,
  );

  const auditEventIds: string[] = [];

  // 6. Transactionally apply diff
  if (diff.hasChanges) {
    await db.transaction(async (tx) => {
      // Revocations
      for (const rev of diff.toRevoke) {
        await tx
          .update(policyAssignments)
          .set({
            effectiveTo: atStr,
            updatedAt: new Date(),
          })
          .where(eq(policyAssignments.id, rev.id));

        const [audit] = await tx
          .insert(auditEvents)
          .values({
            companyId: employee.companyId,
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
              scoped: true,
            },
          })
          .returning({ id: auditEvents.id });

        auditEventIds.push(audit.id);
      }

      // Updates
      for (const upd of diff.toUpdate) {
        await tx
          .update(policyAssignments)
          .set({
            effectiveTo: atStr,
            updatedAt: new Date(),
          })
          .where(eq(policyAssignments.id, upd.actual.id));

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

        const [audit] = await tx
          .insert(auditEvents)
          .values({
            companyId: employee.companyId,
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
              scoped: true,
            },
          })
          .returning({ id: auditEvents.id });

        auditEventIds.push(audit.id);
      }

      // Additions
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

        const [audit] = await tx
          .insert(auditEvents)
          .values({
            companyId: employee.companyId,
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
              scoped: true,
            },
          })
          .returning({ id: auditEvents.id });

        auditEventIds.push(audit.id);
      }
    });
  }

  // 7. Schedule future jobs if any temporal categories were touched
  const scheduledJobs = await scheduleFutureTemporalJobs(employee, scopedRules, atStr);

  return {
    employeeId,
    evaluationDate: atStr,
    resolution: scopedResolution,
    diff,
    auditEventIds,
    scheduledJobs,
  };
}

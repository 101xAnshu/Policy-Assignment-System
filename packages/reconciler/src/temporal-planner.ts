/**
 * Temporal Planner & Milestone Scheduler.
 * Build Spec §16, §27.
 *
 * Discovers future temporal trigger points (e.g., employee reaching 24 months tenure)
 * and schedules idempotent execution entries into the temporal_jobs table.
 */

import { db, temporalJobs } from "@warp/db";
import { eq, and, gt, isNull } from "drizzle-orm";
import type { EmployeeContext, Predicate } from "@warp/domain";
import type { EvaluatableRule } from "@warp/resolver";

/**
 * Add N months to an ISO date string (YYYY-MM-DD), maintaining day of month.
 */
export function addMonthsToDate(dateStr: string, monthsToAdd: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const totalMonths = y * 12 + (m - 1) + monthsToAdd;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = (totalMonths % 12) + 1;

  // Handle month length overflow (e.g. Feb 30 -> Feb 28/29)
  const maxDaysInTargetMonth = new Date(
    Date.UTC(targetYear, targetMonth, 0),
  ).getUTCDate();
  const targetDay = Math.min(d, maxDaysInTargetMonth);

  const pad = (n: number) => String(n).padStart(2, "0");
  return `${targetYear}-${pad(targetMonth)}-${pad(targetDay)}`;
}

/**
 * Scan rules for tenure milestones and schedule future temporal jobs.
 */
export async function scheduleFutureTemporalJobs(
  employee: EmployeeContext,
  rules: EvaluatableRule[],
  currentDate: string,
): Promise<Array<{ triggerAt: string; reason: string }>> {
  const scheduled: Array<{ triggerAt: string; reason: string }> = [];

  // Extract all TENURE_AT_LEAST duration values from rules
  const tenureDurations = new Set<number>();

  function extractTenures(node: Predicate) {
    if (node.type === "TENURE_AT_LEAST") {
      tenureDurations.add(node.durationMonths);
    } else if (node.type === "ALL") {
      node.children.forEach(extractTenures);
    }
  }

  rules.forEach((r) => extractTenures(r.predicate));

  for (const months of tenureDurations) {
    const milestoneDateStr = addMonthsToDate(employee.hireDate, months);

    // Only schedule if the milestone is in the future relative to the current evaluation date
    if (milestoneDateStr > currentDate) {
      const triggerTimestamp = new Date(`${milestoneDateStr}T00:00:00.000Z`);
      const reason = `Tenure milestone: ${months} months completed for ${employee.id}`;

      // Check if an unprocessed job already exists for this milestone
      const [existing] = await db
        .select()
        .from(temporalJobs)
        .where(
          and(
            eq(temporalJobs.employeeId, employee.id),
            eq(temporalJobs.triggerAt, triggerTimestamp),
            isNull(temporalJobs.processedAt),
          ),
        )
        .limit(1);

      if (!existing) {
        await db.insert(temporalJobs).values({
          employeeId: employee.id,
          triggerAt: triggerTimestamp,
          reason,
          processedAt: null,
        });

        scheduled.push({ triggerAt: milestoneDateStr, reason });
      }
    }
  }

  return scheduled;
}

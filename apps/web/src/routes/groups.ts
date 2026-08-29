/**
 * Group API routes.
 *
 * GET /api/groups — list groups with member count
 */

import { Router, type Request, type Response } from "express";
import { db } from "@warp/db";
import { groups, groupMemberships, employees } from "@warp/db";
import { eq, isNull, and } from "drizzle-orm";

export const groupRoutes = Router();

// ─── GET /api/groups ─────────────────────────────────────────────────────────

groupRoutes.get("/", async (_req: Request, res: Response) => {
  try {
    const result = await db.select().from(groups).orderBy(groups.name);

    // Enrich with current member count and member list
    const enriched = await Promise.all(
      result.map(async (group) => {
        const members = await db
          .select({
            employeeId: groupMemberships.employeeId,
            employeeName: employees.name,
            validFrom: groupMemberships.validFrom,
          })
          .from(groupMemberships)
          .innerJoin(employees, eq(groupMemberships.employeeId, employees.id))
          .where(
            and(
              eq(groupMemberships.groupId, group.id),
              isNull(groupMemberships.validTo),
            ),
          );

        return { ...group, memberCount: members.length, members };
      }),
    );

    res.json(enriched);
  } catch (err) {
    console.error("Error listing groups:", err);
    res.status(500).json({ error: "Failed to list groups" });
  }
});

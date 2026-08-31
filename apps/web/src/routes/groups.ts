/**
 * Group API routes.
 *
 * GET    /api/groups                        — list groups with member count
 * POST   /api/groups/:id/members            — add member to group with outbox trigger (§26)
 * DELETE /api/groups/:id/members/:employeeId — remove member from group with outbox trigger (§26)
 */

import { Router, type Request, type Response } from "express";
import { db } from "@warp/db";
import { groups, groupMemberships, employees, publishOutboxEvent } from "@warp/db";
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

// ─── POST /api/groups/:id/members ────────────────────────────────────────────

groupRoutes.post("/:id/members", async (req: Request, res: Response) => {
  try {
    const groupId = req.params.id;
    const { employeeId, validFrom: requestedValidFrom } = req.body;

    if (!employeeId) {
      res.status(400).json({ error: "Missing employeeId in request body" });
      return;
    }

    const validFrom = requestedValidFrom ?? new Date().toISOString().split("T")[0];

    const result = await db.transaction(async (tx) => {
      // Check group exists
      const [grp] = await tx.select().from(groups).where(eq(groups.id, groupId));
      if (!grp) return { error: "Group not found", status: 404 };

      // Insert active membership
      await tx.insert(groupMemberships).values({
        groupId,
        employeeId,
        validFrom,
        validTo: null,
      });

      // Publish outbox event for scoped reconciliation
      await publishOutboxEvent(
        {
          eventType: "GROUP_MEMBERSHIP_CHANGED",
          entityType: "EMPLOYEE",
          entityId: employeeId,
          payload: {
            groupId,
            action: "ADDED",
            effectiveAt: validFrom,
          },
        },
        tx,
      );

      return { groupId, employeeId, validFrom, status: "ADDED" };
    });

    if ("error" in result && typeof (result as any).status === "number") {
      res.status((result as any).status).json({ error: result.error });
      return;
    }

    res.status(201).json(result);
  } catch (err) {
    console.error("Error adding group member:", err);
    res.status(500).json({ error: "Failed to add group member" });
  }
});

// ─── DELETE /api/groups/:id/members/:employeeId ──────────────────────────────

groupRoutes.delete("/:id/members/:employeeId", async (req: Request, res: Response) => {
  try {
    const { id: groupId, employeeId } = req.params;
    const effectiveAt = (req.body?.effectiveAt as string) ?? new Date().toISOString().split("T")[0];

    const result = await db.transaction(async (tx) => {
      // Close active membership
      await tx
        .update(groupMemberships)
        .set({ validTo: effectiveAt })
        .where(
          and(
            eq(groupMemberships.groupId, groupId),
            eq(groupMemberships.employeeId, employeeId),
            isNull(groupMemberships.validTo),
          ),
        );

      // Publish outbox event for scoped reconciliation
      await publishOutboxEvent(
        {
          eventType: "GROUP_MEMBERSHIP_CHANGED",
          entityType: "EMPLOYEE",
          entityId: employeeId,
          payload: {
            groupId,
            action: "REMOVED",
            effectiveAt,
          },
        },
        tx,
      );

      return { groupId, employeeId, effectiveAt, status: "REMOVED" };
    });

    res.json(result);
  } catch (err) {
    console.error("Error removing group member:", err);
    res.status(500).json({ error: "Failed to remove group member" });
  }
});

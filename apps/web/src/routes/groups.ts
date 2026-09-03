/**
 * Group API routes.
 *
 * GET    /api/groups                        — list groups with member count
 * POST   /api/groups/:id/members            — add member to group with outbox trigger
 * DELETE /api/groups/:id/members/:employeeId — remove member from group with outbox trigger
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

    if (typeof validFrom !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(validFrom)) {
      res.status(400).json({ error: "validFrom must be YYYY-MM-DD" });
      return;
    }

    const result = await db.transaction(async (tx) => {
      // Check group exists
      const [grp] = await tx.select().from(groups).where(eq(groups.id, groupId));
      if (!grp) return { error: "Group not found", status: 404 };

      // Idempotent no-op: an active membership already exists. Like duplicate
      // rule publish, re-adding emits no second row and no second event.
      const [existing] = await tx
        .select()
        .from(groupMemberships)
        .where(
          and(
            eq(groupMemberships.groupId, groupId),
            eq(groupMemberships.employeeId, employeeId),
            isNull(groupMemberships.validTo),
          ),
        );
      if (existing) {
        return { groupId, employeeId, validFrom: existing.validFrom, status: "ALREADY_MEMBER", duplicate: true } as const;
      }

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

    // Idempotent re-add answers 200; first-time creation answers 201.
    res.status((result as any).duplicate ? 200 : 201).json(result);
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

    if (typeof effectiveAt !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveAt)) {
      res.status(400).json({ error: "effectiveAt must be YYYY-MM-DD" });
      return;
    }

    const result = await db.transaction(async (tx) => {
      const active = await tx
        .select()
        .from(groupMemberships)
        .where(
          and(
            eq(groupMemberships.groupId, groupId),
            eq(groupMemberships.employeeId, employeeId),
            isNull(groupMemberships.validTo),
          ),
        );

      // Idempotent no-op when nothing is active: no row touched, no event.
      if (active.length === 0) {
        return { groupId, employeeId, effectiveAt, status: "NOT_A_MEMBER", duplicate: true } as const;
      }

      // Guard against inverted intervals: cannot close before the start.
      for (const row of active) {
        if (effectiveAt < row.validFrom) {
          return {
            error: `effectiveAt ${effectiveAt} precedes membership start ${row.validFrom}`,
            status: 400,
          } as const;
        }
      }

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

    if ("error" in result && typeof (result as any).status === "number") {
      res.status((result as any).status).json({ error: (result as any).error });
      return;
    }

    res.json(result);
  } catch (err) {
    console.error("Error removing group member:", err);
    res.status(500).json({ error: "Failed to remove group member" });
  }
});

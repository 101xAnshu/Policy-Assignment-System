/**
 * Employee API routes.
 * Build Spec §29, §31, §32.
 *
 * GET  /api/employees                    — list employees
 * GET  /api/employees/:id                — get employee detail
 * POST /api/employees                    — create employee
 * PATCH /api/employees/:id               — update employee attributes
 * POST /api/employees/:id/preview-change — preview attribute change diff before applying (§32)
 * POST /api/employees/preview-onboarding — preview onboarding policies before creation (§31)
 */

import { Router, type Request, type Response } from "express";
import { db } from "@warp/db";
import {
  employees,
  employeeVersions,
  temporalJobs,
  publishOutboxEvent,
  getActiveAssignmentsAt,
} from "@warp/db";
import { eq, and, isNull, sql } from "drizzle-orm";
import {
  resolve,
  loadEmployeeContextAt,
  loadActiveRulesAt,
  formatDate,
} from "@warp/resolver";
import { computeDiff, type ActualAssignment } from "@warp/reconciler";
import type { EmployeeContext } from "@warp/domain";

export const employeeRoutes = Router();

// ─── GET /api/employees ──────────────────────────────────────────────────────

employeeRoutes.get("/", async (_req: Request, res: Response) => {
  try {
    const result = await db.select().from(employees).orderBy(employees.name);
    res.json(result);
  } catch (err) {
    console.error("Error listing employees:", err);
    res.status(500).json({ error: "Failed to list employees" });
  }
});

// ─── POST /api/employees/preview-onboarding (§31) ────────────────────────────

employeeRoutes.post("/preview-onboarding", async (req: Request, res: Response) => {
  try {
    const { companyId, country, state, department, employmentType, isManager, hireDate, groupIds } =
      req.body;

    if (!companyId || !country || !department || !employmentType || !hireDate) {
      res.status(400).json({
        error: "Missing required fields for onboarding preview",
        required: ["companyId", "country", "department", "employmentType", "hireDate"],
      });
      return;
    }

    const evalDate = hireDate;
    const rules = await loadActiveRulesAt(companyId, evalDate);

    const empContext: EmployeeContext = {
      id: "preview-onboarding" as any,
      companyId,
      country,
      state: state ?? null,
      department,
      employmentType,
      isManager: isManager ?? false,
      hireDate,
      groupIds: groupIds ?? [],
    };

    const resolution = resolve(empContext, rules, evalDate);

    res.json({
      evaluationDate: evalDate,
      employee: empContext,
      assignments: resolution.assignments,
      decisions: resolution.decisions,
    });
  } catch (err) {
    console.error("Error previewing onboarding policies:", err);
    res.status(500).json({ error: "Failed to preview onboarding policies" });
  }
});

// ─── GET /api/employees/:id ──────────────────────────────────────────────────

employeeRoutes.get("/:id", async (req: Request, res: Response) => {
  try {
    const [employee] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, req.params.id));

    if (!employee) {
      res.status(404).json({ error: "Employee not found" });
      return;
    }

    // Include version history
    const versions = await db
      .select()
      .from(employeeVersions)
      .where(eq(employeeVersions.employeeId, req.params.id))
      .orderBy(employeeVersions.version);

    res.json({ ...employee, versions });
  } catch (err) {
    console.error("Error getting employee:", err);
    res.status(500).json({ error: "Failed to get employee" });
  }
});

// ─── POST /api/employees/:id/preview-change (§32) ────────────────────────────

employeeRoutes.post("/:id/preview-change", async (req: Request, res: Response) => {
  try {
    const employeeId = req.params.id;
    const { updates, effectiveAt: requestedEffectiveAt } = req.body;

    if (!updates || typeof updates !== "object") {
      res.status(400).json({ error: "Missing updates payload" });
      return;
    }

    const effectiveAt = requestedEffectiveAt ?? new Date().toISOString().split("T")[0];

    // 1. Load current employee context at date
    const currentContext = await loadEmployeeContextAt(employeeId, effectiveAt);
    if (!currentContext) {
      res.status(404).json({ error: "Employee not found at effective date" });
      return;
    }

    // 2. Build simulated employee context
    const simulatedContext: EmployeeContext = {
      id: currentContext.id,
      companyId: currentContext.companyId,
      country: updates.country ?? currentContext.country,
      state: updates.state !== undefined ? updates.state : currentContext.state,
      department: updates.department ?? currentContext.department,
      employmentType: updates.employmentType ?? currentContext.employmentType,
      isManager: updates.isManager !== undefined ? updates.isManager : currentContext.isManager,
      hireDate: currentContext.hireDate,
      groupIds: currentContext.groupIds,
    };

    // 3. Load active rules
    const rules = await loadActiveRulesAt(currentContext.companyId, effectiveAt);

    // 4. Resolve simulated desired state
    const simulatedResolution = resolve(simulatedContext, rules, effectiveAt);

    // 5. Load actual assignments
    const actuals = (await getActiveAssignmentsAt(employeeId, effectiveAt)) as ActualAssignment[];

    // 6. Compute diff
    const diff = computeDiff(
      simulatedResolution.assignments,
      actuals,
      simulatedResolution.decisions,
      effectiveAt,
    );

    res.json({
      employeeId,
      effectiveAt,
      simulatedEmployee: simulatedContext,
      currentAssignments: actuals,
      desiredAssignments: simulatedResolution.assignments,
      decisions: simulatedResolution.decisions,
      diff,
      summary: {
        added: diff.toAdd.length,
        revoked: diff.toRevoke.length,
        updated: diff.toUpdate.length,
        unchanged: diff.unchanged.length,
        hasChanges: diff.hasChanges,
      },
    });
  } catch (err) {
    console.error("Error previewing employee attribute change:", err);
    res.status(500).json({ error: "Failed to preview employee attribute change" });
  }
});

// ─── POST /api/employees ─────────────────────────────────────────────────────

employeeRoutes.post("/", async (req: Request, res: Response) => {
  try {
    const {
      companyId,
      name,
      email,
      country,
      state,
      department,
      employmentType,
      isManager,
      hireDate,
    } = req.body;

    // Validate required fields
    if (!companyId || !name || !email || !country || !department || !employmentType || !hireDate) {
      res.status(400).json({
        error: "Missing required fields",
        required: ["companyId", "name", "email", "country", "department", "employmentType", "hireDate"],
      });
      return;
    }

    // Use a transaction to atomically create employee + initial version + outbox event
    const result = await db.transaction(async (tx) => {
      const [employee] = await tx
        .insert(employees)
        .values({
          companyId,
          name,
          email,
          country,
          state: state ?? null,
          department,
          employmentType,
          isManager: isManager ?? false,
          hireDate,
          version: 1,
        })
        .returning();

      // Create initial version record
      await tx.insert(employeeVersions).values({
        employeeId: employee.id,
        version: 1,
        validFrom: hireDate,
        validTo: null,
        country,
        state: state ?? null,
        department,
        employmentType,
        isManager: isManager ?? false,
        hireDate,
      });

      // Publish outbox event for asynchronous reconciliation
      await publishOutboxEvent(
        {
          eventType: "EMPLOYEE_CREATED",
          entityType: "EMPLOYEE",
          entityId: employee.id,
          payload: { companyId, hireDate, entityVersion: 1 },
        },
        tx,
      );

      return employee;
    });

    res.status(201).json(result);
  } catch (err) {
    console.error("Error creating employee:", err);
    res.status(500).json({ error: "Failed to create employee" });
  }
});

// ─── PATCH /api/employees/:id ────────────────────────────────────────────────

employeeRoutes.patch("/:id", async (req: Request, res: Response) => {
  try {
    const employeeId = req.params.id;
    const updates = req.body;

    const effectiveAt: string =
      updates.effectiveAt ?? new Date().toISOString().split("T")[0];

    const { effectiveAt: _, ...attributeUpdates } = updates;

    const allowedFields = [
      "name",
      "email",
      "country",
      "state",
      "department",
      "employmentType",
      "isManager",
    ];

    const sanitized: Record<string, unknown> = {};
    const changedFields: string[] = [];

    for (const [key, value] of Object.entries(attributeUpdates)) {
      if (allowedFields.includes(key)) {
        sanitized[key] = value;
        changedFields.push(key);
      }
    }

    if (changedFields.length === 0) {
      res.status(400).json({ error: "No valid fields to update" });
      return;
    }

    const today = new Date().toISOString().split("T")[0];
    const isFutureDated = effectiveAt > today;

    const result = await db.transaction(async (tx) => {
      // Load current employee
      const [current] = await tx
        .select()
        .from(employees)
        .where(eq(employees.id, employeeId));

      if (!current) {
        return null;
      }

      const newVersion = current.version + 1;

      // Close the current version's validity at effectiveAt
      await tx
        .update(employeeVersions)
        .set({ validTo: effectiveAt })
        .where(
          and(
            eq(employeeVersions.employeeId, employeeId),
            isNull(employeeVersions.validTo),
          ),
        );

      // Compute new attribute state
      const newState = {
        country: (sanitized.country as string) ?? current.country,
        state: sanitized.state !== undefined ? (sanitized.state as string | null) : current.state,
        department: (sanitized.department as string) ?? current.department,
        employmentType: (sanitized.employmentType as string) ?? current.employmentType,
        isManager: sanitized.isManager !== undefined ? (sanitized.isManager as boolean) : current.isManager,
        hireDate: current.hireDate,
      };

      // Create new version record for the future/effective date
      await tx.insert(employeeVersions).values({
        employeeId,
        version: newVersion,
        validFrom: effectiveAt,
        validTo: null,
        ...newState,
      });

      let updated = current;

      if (isFutureDated) {
        // Build Spec §21: Schedule future temporal job instead of immediate current-state reconciliation
        await tx.insert(temporalJobs).values({
          employeeId,
          triggerAt: new Date(`${effectiveAt}T00:00:00.000Z`),
          reason: `Future-dated attribute update for ${employeeId} activating at ${effectiveAt}`,
          processedAt: null,
        });

        // Keep current employee attributes as-is, increment version
        [updated] = await tx
          .update(employees)
          .set({
            version: newVersion,
            updatedAt: new Date(),
          })
          .where(eq(employees.id, employeeId))
          .returning();
      } else {
        // Immediate update to current employee record
        [updated] = await tx
          .update(employees)
          .set({
            ...sanitized,
            version: newVersion,
            updatedAt: new Date(),
          })
          .where(eq(employees.id, employeeId))
          .returning();

        // Publish outbox event with changedFields + effectiveAt + entityVersion
        await publishOutboxEvent(
          {
            eventType: "EMPLOYEE_UPDATED",
            entityType: "EMPLOYEE",
            entityId: employeeId,
            payload: { changedFields, effectiveAt, entityVersion: newVersion },
          },
          tx,
        );
      }

      return {
        employee: updated,
        changedFields,
        effectiveAt,
        version: newVersion,
        isFutureDated,
      };
    });

    if (!result) {
      res.status(404).json({ error: "Employee not found" });
      return;
    }

    res.json(result);
  } catch (err) {
    console.error("Error updating employee:", err);
    res.status(500).json({ error: "Failed to update employee" });
  }
});

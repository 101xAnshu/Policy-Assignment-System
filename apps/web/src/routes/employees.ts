/**
 * Employee API routes.
 * Build Spec §29.
 *
 * GET  /api/employees          — list employees
 * GET  /api/employees/:id      — get employee detail
 * POST /api/employees          — create employee
 * PATCH /api/employees/:id     — update employee attributes
 *
 * Employee create/update:
 * - Increments `version` on the employee record
 * - Creates a new EmployeeVersion row (valid-time history)
 * - (Phase 5: inserts outbox event for reconciliation)
 */

import { Router, type Request, type Response } from "express";
import { db } from "@warp/db";
import {
  employees,
  employeeVersions,
} from "@warp/db";
import { eq, and, isNull, sql } from "drizzle-orm";

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

    // Use a transaction to atomically create employee + initial version
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

      // Phase 5: INSERT INTO outbox_events ... here

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

    // The effectiveAt date determines when the change takes business effect.
    // If not provided, defaults to today.
    const effectiveAt: string =
      updates.effectiveAt ?? new Date().toISOString().split("T")[0];

    // Remove non-attribute fields from updates
    const { effectiveAt: _, ...attributeUpdates } = updates;

    // Allowed updatable fields
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

      // Close the current version's validity
      await tx
        .update(employeeVersions)
        .set({ validTo: effectiveAt })
        .where(
          and(
            eq(employeeVersions.employeeId, employeeId),
            isNull(employeeVersions.validTo),
          ),
        );

      // Compute new attribute state (merge current with updates)
      const newState = {
        country: (sanitized.country as string) ?? current.country,
        state: sanitized.state !== undefined ? (sanitized.state as string | null) : current.state,
        department: (sanitized.department as string) ?? current.department,
        employmentType: (sanitized.employmentType as string) ?? current.employmentType,
        isManager: sanitized.isManager !== undefined ? (sanitized.isManager as boolean) : current.isManager,
        hireDate: current.hireDate,
      };

      // Create new version record
      await tx.insert(employeeVersions).values({
        employeeId,
        version: newVersion,
        validFrom: effectiveAt,
        validTo: null,
        ...newState,
      });

      // Update current employee record
      const [updated] = await tx
        .update(employees)
        .set({
          ...sanitized,
          version: newVersion,
          updatedAt: new Date(),
        })
        .where(eq(employees.id, employeeId))
        .returning();

      // Phase 5: INSERT INTO outbox_events with changedFields + effectiveAt

      return { employee: updated, changedFields, effectiveAt, version: newVersion };
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

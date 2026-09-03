/**
 * Resolution API routes.
 *
 * GET  /api/employees/:id/resolve?at=...  — resolves point-in-time policies & decision explanation for an employee
 * POST /api/resolve                      — pure simulated resolution given employee context + date
 */

import { Router, type Request, type Response } from "express";
import {
  resolve,
  loadEmployeeContextAt,
  loadActiveRulesAt,
} from "@warp/resolver";
import type { EmployeeContext } from "@warp/domain";

export const resolveRoutes = Router();

// ─── GET /api/employees/:id/resolve ──────────────────────────────────────────

resolveRoutes.get("/employees/:id/resolve", async (req: Request, res: Response) => {
  try {
    const employeeId = req.params.id;
    const at = (req.query.at as string) ?? new Date().toISOString().split("T")[0];

    // 1. Load employee context at date
    const employee = await loadEmployeeContextAt(employeeId, at);
    if (!employee) {
      res.status(404).json({ error: "Employee not found or not active at this date" });
      return;
    }

    // 2. Load active rules for employee's company at date
    const rules = await loadActiveRulesAt(employee.companyId, at);

    // 3. Pure deterministic resolution
    const resolution = resolve(employee, rules, at);

    res.json({
      employeeId,
      companyId: employee.companyId,
      evaluationDate: at,
      employeeState: {
        country: employee.country,
        state: employee.state,
        department: employee.department,
        employmentType: employee.employmentType,
        isManager: employee.isManager,
        hireDate: employee.hireDate,
        groupIds: employee.groupIds,
      },
      activeRulesCount: rules.length,
      assignments: resolution.assignments,
      decisions: resolution.decisions,
    });
  } catch (err) {
    console.error("Error resolving employee policies:", err);
    res.status(500).json({ error: "Failed to resolve employee policies" });
  }
});

// ─── POST /api/resolve (Simulation) ──────────────────────────────────────────

resolveRoutes.post("/resolve", async (req: Request, res: Response) => {
  try {
    const { employee, at, companyId } = req.body;

    if (!employee || !companyId) {
      res.status(400).json({
        error: "Missing required fields",
        required: ["employee", "companyId"],
      });
      return;
    }

    const evalDate = at ?? new Date().toISOString().split("T")[0];

    // Load active rules for the company
    const rules = await loadActiveRulesAt(companyId, evalDate);

    const empContext: EmployeeContext = {
      id: employee.id ?? "simulated-id",
      companyId,
      country: employee.country,
      state: employee.state ?? null,
      department: employee.department,
      employmentType: employee.employmentType,
      isManager: employee.isManager ?? false,
      hireDate: employee.hireDate,
      groupIds: employee.groupIds ?? [],
    };

    const resolution = resolve(empContext, rules, evalDate);

    res.json({
      evaluationDate: evalDate,
      employee: empContext,
      assignments: resolution.assignments,
      decisions: resolution.decisions,
    });
  } catch (err) {
    console.error("Error running simulation resolution:", err);
    res.status(500).json({ error: "Failed to run simulation resolution" });
  }
});

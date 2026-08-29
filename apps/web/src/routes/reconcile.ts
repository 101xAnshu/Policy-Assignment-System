/**
 * Reconciliation API routes.
 * Build Spec §23, §24, §29.
 *
 * GET  /api/employees/:id/reconcile/preview — preview diff without applying changes
 * POST /api/employees/:id/reconcile         — apply reconciliation for an employee
 * POST /api/companies/:id/reconcile         — apply reconciliation across all company employees
 */

import { Router, type Request, type Response } from "express";
import {
  previewReconcile,
  reconcileEmployee,
  reconcileCompany,
} from "@warp/reconciler";

export const reconcileRoutes = Router();

// ─── GET /api/employees/:id/reconcile/preview ────────────────────────────────

reconcileRoutes.get(
  "/employees/:id/reconcile/preview",
  async (req: Request, res: Response) => {
    try {
      const employeeId = req.params.id;
      const at = (req.query.at as string) ?? new Date().toISOString().split("T")[0];

      const preview = await previewReconcile(employeeId, at);

      res.json(preview);
    } catch (err) {
      console.error("Error generating reconciliation preview:", err);
      res.status(500).json({ error: "Failed to generate reconciliation preview" });
    }
  },
);

// ─── POST /api/employees/:id/reconcile ───────────────────────────────────────

reconcileRoutes.post(
  "/employees/:id/reconcile",
  async (req: Request, res: Response) => {
    try {
      const employeeId = req.params.id;
      const at =
        req.body.at ??
        (req.query.at as string) ??
        new Date().toISOString().split("T")[0];
      const actor = req.body.actor ?? "user:admin";

      const result = await reconcileEmployee(employeeId, at, { actor });

      res.json(result);
    } catch (err) {
      console.error("Error executing employee reconciliation:", err);
      res.status(500).json({ error: "Failed to execute employee reconciliation" });
    }
  },
);

// ─── POST /api/companies/:id/reconcile ───────────────────────────────────────

reconcileRoutes.post(
  "/companies/:id/reconcile",
  async (req: Request, res: Response) => {
    try {
      const companyId = req.params.id;
      const at =
        req.body.at ??
        (req.query.at as string) ??
        new Date().toISOString().split("T")[0];
      const actor = req.body.actor ?? "user:admin";

      const result = await reconcileCompany(companyId, at, { actor });

      res.json(result);
    } catch (err) {
      console.error("Error executing company reconciliation:", err);
      res.status(500).json({ error: "Failed to execute company reconciliation" });
    }
  },
);

/**
 * Reconciliation & Worker API routes.
 * Build Spec §23, §24, §25, §26, §27, §29.
 *
 * GET  /api/employees/:id/reconcile/preview — preview diff without applying changes
 * POST /api/employees/:id/reconcile         — apply reconciliation for an employee
 * POST /api/companies/:id/reconcile         — apply reconciliation across all company employees
 * POST /api/worker/process-outbox           — trigger worker processing of pending outbox events
 * POST /api/worker/process-temporal         — trigger worker processing of due temporal milestone jobs
 * GET  /api/outbox                          — list outbox event queue
 * GET  /api/temporal/jobs                   — list scheduled temporal milestone jobs
 */

import { Router, type Request, type Response } from "express";
import {
  previewReconcile,
  reconcileEmployee,
  reconcileCompany,
  processNextOutboxEvents,
  processDueTemporalJobs,
} from "@warp/reconciler";
import { db, outboxEvents, temporalJobs } from "@warp/db";
import { desc, isNull, lte } from "drizzle-orm";

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

// ─── POST /api/worker/process-outbox ─────────────────────────────────────────

reconcileRoutes.post(
  "/worker/process-outbox",
  async (req: Request, res: Response) => {
    try {
      const batchSize = req.body.batchSize ? Number(req.body.batchSize) : 20;
      const result = await processNextOutboxEvents(batchSize);
      res.json(result);
    } catch (err) {
      console.error("Error processing outbox events:", err);
      res.status(500).json({ error: "Failed to process outbox events" });
    }
  },
);

// ─── POST /api/worker/process-temporal ───────────────────────────────────────

reconcileRoutes.post(
  "/worker/process-temporal",
  async (req: Request, res: Response) => {
    try {
      const asOfParam = req.body.asOf ?? req.body.asOfDate;
      const asOf = asOfParam ? new Date(asOfParam) : new Date();
      const result = await processDueTemporalJobs(asOf);
      res.json(result);
    } catch (err) {
      console.error("Error processing temporal jobs:", err);
      res.status(500).json({ error: "Failed to process temporal jobs" });
    }
  },
);

// ─── GET /api/outbox ─────────────────────────────────────────────────────────

reconcileRoutes.get("/outbox", async (_req: Request, res: Response) => {
  try {
    const events = await db
      .select()
      .from(outboxEvents)
      .orderBy(desc(outboxEvents.createdAt))
      .limit(50);
    res.json(events);
  } catch (err) {
    console.error("Error listing outbox events:", err);
    res.status(500).json({ error: "Failed to list outbox events" });
  }
});

// ─── GET /api/temporal/jobs ──────────────────────────────────────────────────

reconcileRoutes.get("/temporal/jobs", async (_req: Request, res: Response) => {
  try {
    const jobs = await db
      .select()
      .from(temporalJobs)
      .orderBy(desc(temporalJobs.triggerAt))
      .limit(50);
    res.json(jobs);
  } catch (err) {
    console.error("Error listing temporal jobs:", err);
    res.status(500).json({ error: "Failed to list temporal jobs" });
  }
});

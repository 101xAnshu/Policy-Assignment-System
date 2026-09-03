/**
 * Audit & "Why?" Explainability API routes.
 *
 * GET /api/employees/:id/why?policyId=...&at=... — Explainability endpoint
 * GET /api/employees/:id/timeline                — Reconstructed employee history timeline
 * GET /api/audit                                 — Query audit log with filters
 * GET /api/audit/:id                             — Get single audit event by ID
 */

import { Router, type Request, type Response } from "express";
import {
  explainPolicyAssignment,
  reconstructEmployeeTimeline,
  queryAuditEvents,
  getAuditEventById,
} from "@warp/audit";

export const auditRoutes = Router();

// ─── GET /api/employees/:id/why ──────────────────────────────────────────────

auditRoutes.get("/employees/:id/why", async (req: Request, res: Response) => {
  try {
    const employeeId = req.params.id;
    const policyId = req.query.policyId as string;
    const at = (req.query.at as string) ?? new Date().toISOString().split("T")[0];

    if (!policyId) {
      res.status(400).json({ error: "Missing required query parameter: policyId" });
      return;
    }

    const explanation = await explainPolicyAssignment(employeeId, policyId, at);
    res.json(explanation);
  } catch (err: any) {
    console.error("Error generating policy explanation:", err);
    res.status(500).json({
      error: "Failed to generate policy explanation",
      message: err.message,
    });
  }
});

// ─── GET /api/employees/:id/timeline ─────────────────────────────────────────

auditRoutes.get("/employees/:id/timeline", async (req: Request, res: Response) => {
  try {
    const employeeId = req.params.id;
    const timeline = await reconstructEmployeeTimeline(employeeId);
    res.json(timeline);
  } catch (err: any) {
    console.error("Error reconstructing employee timeline:", err);
    res.status(500).json({
      error: "Failed to reconstruct employee timeline",
      message: err.message,
    });
  }
});

// ─── GET /api/audit ──────────────────────────────────────────────────────────

auditRoutes.get("/audit", async (req: Request, res: Response) => {
  try {
    const {
      companyId,
      entityType,
      entityId,
      eventType,
      actor,
      from,
      to,
      limit,
      offset,
    } = req.query;

    const result = await queryAuditEvents({
      companyId: companyId as string | undefined,
      entityType: entityType as string | undefined,
      entityId: entityId as string | undefined,
      eventType: eventType as string | undefined,
      actor: actor as string | undefined,
      from: from as string | undefined,
      to: to as string | undefined,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });

    res.json(result);
  } catch (err: any) {
    console.error("Error querying audit logs:", err);
    res.status(500).json({
      error: "Failed to query audit logs",
      message: err.message,
    });
  }
});

// ─── GET /api/audit/:id ──────────────────────────────────────────────────────

auditRoutes.get("/audit/:id", async (req: Request, res: Response) => {
  try {
    const audit = await getAuditEventById(req.params.id);
    if (!audit) {
      res.status(404).json({ error: "Audit event not found" });
      return;
    }
    res.json(audit);
  } catch (err: any) {
    console.error("Error fetching audit event:", err);
    res.status(500).json({
      error: "Failed to fetch audit event",
      message: err.message,
    });
  }
});

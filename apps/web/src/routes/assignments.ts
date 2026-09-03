/**
 * Policy Assignment & History API routes.
 *
 * GET /api/employees/:id/assignments          — active assignments at date
 * GET /api/employees/:id/assignments/history  — full assignment timeline
 * GET /api/assignments/:id/explanation        — frozen explanation snapshot
 */

import { Router, type Request, type Response } from "express";
import {
  getActiveAssignmentsAt,
  getAssignmentHistory,
  getAssignmentExplanation,
  checkOneCategoryOverlap,
} from "@warp/db";
import { db, policyAssignments, policyCategories } from "@warp/db";
import { eq } from "drizzle-orm";

export const assignmentRoutes = Router();

// ─── GET /api/employees/:id/assignments ──────────────────────────────────────

assignmentRoutes.get(
  "/employees/:id/assignments",
  async (req: Request, res: Response) => {
    try {
      const employeeId = req.params.id;
      const at = (req.query.at as string) ?? new Date().toISOString().split("T")[0];

      const assignments = await getActiveAssignmentsAt(employeeId, at);

      res.json({
        employeeId,
        evaluationDate: at,
        count: assignments.length,
        assignments,
      });
    } catch (err) {
      console.error("Error fetching employee assignments:", err);
      res.status(500).json({ error: "Failed to fetch employee assignments" });
    }
  },
);

// ─── GET /api/employees/:id/assignments/history ──────────────────────────────

assignmentRoutes.get(
  "/employees/:id/assignments/history",
  async (req: Request, res: Response) => {
    try {
      const employeeId = req.params.id;
      const history = await getAssignmentHistory(employeeId);

      // Group history by category for easy frontend timeline rendering
      const byCategory: Record<string, typeof history> = {};
      for (const item of history) {
        if (!byCategory[item.categoryKey]) {
          byCategory[item.categoryKey] = [];
        }
        byCategory[item.categoryKey].push(item);
      }

      res.json({
        employeeId,
        totalCount: history.length,
        history,
        byCategory,
      });
    } catch (err) {
      console.error("Error fetching assignment history:", err);
      res.status(500).json({ error: "Failed to fetch assignment history" });
    }
  },
);

// ─── GET /api/assignments/:id/explanation ────────────────────────────────────

assignmentRoutes.get(
  "/assignments/:id/explanation",
  async (req: Request, res: Response) => {
    try {
      const assignmentId = req.params.id;
      const assignment = await getAssignmentExplanation(assignmentId);

      if (!assignment) {
        res.status(404).json({ error: "Assignment not found" });
        return;
      }

      res.json({
        assignmentId: assignment.id,
        employeeId: assignment.employeeId,
        policyId: assignment.policyId,
        policyName: assignment.policyName,
        categoryName: assignment.categoryName,
        cardinality: assignment.cardinality,
        effectiveFrom: assignment.effectiveFrom,
        effectiveTo: assignment.effectiveTo,
        explanationSnapshot: assignment.explanationSnapshot,
        recordedAt: assignment.createdAt,
      });
    } catch (err) {
      console.error("Error fetching assignment explanation:", err);
      res.status(500).json({ error: "Failed to fetch assignment explanation" });
    }
  },
);

// ─── POST /api/employees/:id/assignments (Direct Materialize) ────────────────

assignmentRoutes.post(
  "/employees/:id/assignments",
  async (req: Request, res: Response) => {
    try {
      const employeeId = req.params.id;
      const {
        policyId,
        categoryId,
        sourceRuleId,
        sourceRuleVersion,
        effectiveFrom,
        effectiveTo,
        explanationSnapshot,
      } = req.body;

      if (!policyId || !categoryId || !sourceRuleId || !sourceRuleVersion || !effectiveFrom) {
        res.status(400).json({
          error: "Missing required fields",
          required: ["policyId", "categoryId", "sourceRuleId", "sourceRuleVersion", "effectiveFrom"],
        });
        return;
      }

      // Check category cardinality
      const [category] = await db
        .select()
        .from(policyCategories)
        .where(eq(policyCategories.id, categoryId));

      if (!category) {
        res.status(404).json({ error: "Policy category not found" });
        return;
      }

      // If ONE cardinality, enforce non-overlapping intervals
      if (category.cardinality === "ONE") {
        const overlapCheck = await checkOneCategoryOverlap(
          employeeId,
          categoryId,
          effectiveFrom,
          effectiveTo ?? null,
        );

        if (overlapCheck.hasOverlap) {
          res.status(409).json({
            error: "Temporal conflict: overlapping assignment in ONE-cardinality category",
            conflictingAssignment: overlapCheck.conflictingAssignment,
          });
          return;
        }
      }

      const [created] = await db
        .insert(policyAssignments)
        .values({
          employeeId,
          policyId,
          categoryId,
          sourceRuleId,
          sourceRuleVersion,
          effectiveFrom,
          effectiveTo: effectiveTo ?? null,
          explanationSnapshot: explanationSnapshot ?? {
            evaluatedAt: effectiveFrom,
            matchedRules: [],
            winner: null,
            reason: "Directly assigned",
          },
        })
        .returning();

      res.status(201).json(created);
    } catch (err) {
      console.error("Error creating policy assignment:", err);
      res.status(500).json({ error: "Failed to create policy assignment" });
    }
  },
);

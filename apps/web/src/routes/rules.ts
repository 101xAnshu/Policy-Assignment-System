/**
 * Assignment Rule API routes.
 * Build Spec §29.
 *
 * GET  /api/rules          — list all rules (with current version)
 * GET  /api/rules/:id      — get rule detail with all versions
 * POST /api/rules          — create a new rule (as DRAFT)
 * POST /api/rules/:id/publish — publish a new version of a rule
 *
 * Phase 1: Create and list rules.
 * Phase 2+: Preview and publish with reconciliation triggers.
 */

import { Router, type Request, type Response } from "express";
import { db } from "@warp/db";
import {
  assignmentRules,
  assignmentRuleVersions,
  policies,
  policyCategories,
} from "@warp/db";
import { eq, desc } from "drizzle-orm";
import { validatePredicate, extractDependencies } from "@warp/domain";
import type { Predicate } from "@warp/domain";

export const ruleRoutes = Router();

// ─── GET /api/rules ──────────────────────────────────────────────────────────

ruleRoutes.get("/", async (_req: Request, res: Response) => {
  try {
    const result = await db
      .select({
        id: assignmentRules.id,
        name: assignmentRules.name,
        status: assignmentRules.status,
        currentVersion: assignmentRules.currentVersion,
        policyId: assignmentRules.policyId,
        policyName: policies.name,
        categoryId: assignmentRules.categoryId,
        categoryName: policyCategories.name,
        categoryKey: policyCategories.key,
        cardinality: policyCategories.cardinality,
        createdAt: assignmentRules.createdAt,
        updatedAt: assignmentRules.updatedAt,
      })
      .from(assignmentRules)
      .innerJoin(policies, eq(assignmentRules.policyId, policies.id))
      .innerJoin(
        policyCategories,
        eq(assignmentRules.categoryId, policyCategories.id),
      )
      .orderBy(policyCategories.name, assignmentRules.name);

    res.json(result);
  } catch (err) {
    console.error("Error listing rules:", err);
    res.status(500).json({ error: "Failed to list rules" });
  }
});

// ─── GET /api/rules/:id ─────────────────────────────────────────────────────

ruleRoutes.get("/:id", async (req: Request, res: Response) => {
  try {
    const [rule] = await db
      .select({
        id: assignmentRules.id,
        name: assignmentRules.name,
        status: assignmentRules.status,
        currentVersion: assignmentRules.currentVersion,
        policyId: assignmentRules.policyId,
        policyName: policies.name,
        categoryId: assignmentRules.categoryId,
        categoryName: policyCategories.name,
        categoryKey: policyCategories.key,
        cardinality: policyCategories.cardinality,
      })
      .from(assignmentRules)
      .innerJoin(policies, eq(assignmentRules.policyId, policies.id))
      .innerJoin(
        policyCategories,
        eq(assignmentRules.categoryId, policyCategories.id),
      )
      .where(eq(assignmentRules.id, req.params.id));

    if (!rule) {
      res.status(404).json({ error: "Rule not found" });
      return;
    }

    // Get all versions
    const versions = await db
      .select()
      .from(assignmentRuleVersions)
      .where(eq(assignmentRuleVersions.ruleId, req.params.id))
      .orderBy(desc(assignmentRuleVersions.version));

    res.json({ ...rule, versions });
  } catch (err) {
    console.error("Error getting rule:", err);
    res.status(500).json({ error: "Failed to get rule" });
  }
});

// ─── POST /api/rules ─────────────────────────────────────────────────────────

ruleRoutes.post("/", async (req: Request, res: Response) => {
  try {
    const { companyId, policyId, categoryId, name, predicate, priority, effectiveFrom } =
      req.body;

    // Validate required fields
    if (!companyId || !policyId || !categoryId || !name || !predicate || priority === undefined) {
      res.status(400).json({
        error: "Missing required fields",
        required: ["companyId", "policyId", "categoryId", "name", "predicate", "priority"],
      });
      return;
    }

    // Validate predicate structure
    const predicateErrors = validatePredicate(predicate);
    if (predicateErrors.length > 0) {
      res.status(400).json({
        error: "Invalid predicate",
        details: predicateErrors,
      });
      return;
    }

    const result = await db.transaction(async (tx) => {
      // Create the rule
      const [rule] = await tx
        .insert(assignmentRules)
        .values({
          companyId,
          policyId,
          categoryId,
          name,
          status: "DRAFT",
          currentVersion: null,
        })
        .returning();

      // Create the initial version (as draft)
      const dependencies = extractDependencies(predicate as Predicate);
      const [version] = await tx
        .insert(assignmentRuleVersions)
        .values({
          ruleId: rule.id,
          version: 1,
          predicate,
          priority,
          effectiveFrom: effectiveFrom ?? new Date().toISOString().split("T")[0],
          effectiveTo: null,
          dependencies,
          createdBy: "admin", // TODO: proper auth in later phases
        })
        .returning();

      return { rule, version };
    });

    res.status(201).json(result);
  } catch (err) {
    console.error("Error creating rule:", err);
    res.status(500).json({ error: "Failed to create rule" });
  }
});

// ─── POST /api/rules/:id/publish ─────────────────────────────────────────────

ruleRoutes.post("/:id/publish", async (req: Request, res: Response) => {
  try {
    const ruleId = req.params.id;

    const result = await db.transaction(async (tx) => {
      // Load the rule
      const [rule] = await tx
        .select()
        .from(assignmentRules)
        .where(eq(assignmentRules.id, ruleId));

      if (!rule) {
        return { error: "Rule not found", status: 404 };
      }

      // Get the latest version
      const [latestVersion] = await tx
        .select()
        .from(assignmentRuleVersions)
        .where(eq(assignmentRuleVersions.ruleId, ruleId))
        .orderBy(desc(assignmentRuleVersions.version))
        .limit(1);

      if (!latestVersion) {
        return { error: "No version found to publish", status: 400 };
      }

      // Activate the rule and set current version
      const [updated] = await tx
        .update(assignmentRules)
        .set({
          status: "ACTIVE",
          currentVersion: latestVersion.version,
          updatedAt: new Date(),
        })
        .where(eq(assignmentRules.id, ruleId))
        .returning();

      // Phase 5: INSERT INTO outbox_events for reconciliation

      return { rule: updated, publishedVersion: latestVersion };
    });

    if ("error" in result && typeof result.status === "number") {
      res.status(result.status).json({ error: result.error });
      return;
    }

    res.json(result);
  } catch (err) {
    console.error("Error publishing rule:", err);
    res.status(500).json({ error: "Failed to publish rule" });
  }
});

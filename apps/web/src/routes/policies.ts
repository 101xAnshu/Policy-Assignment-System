/**
 * Policy and PolicyCategory API routes.
 * Build Spec §29.
 *
 * GET /api/policies            — list policies (with category info)
 * GET /api/policy-categories   — list categories
 */

import { Router, type Request, type Response } from "express";
import { db } from "@warp/db";
import { policies, policyCategories } from "@warp/db";
import { eq } from "drizzle-orm";

export const policyRoutes = Router();

// ─── GET /api/policies ───────────────────────────────────────────────────────

policyRoutes.get("/policies", async (_req: Request, res: Response) => {
  try {
    const result = await db
      .select({
        id: policies.id,
        name: policies.name,
        description: policies.description,
        categoryId: policies.categoryId,
        categoryName: policyCategories.name,
        categoryKey: policyCategories.key,
        cardinality: policyCategories.cardinality,
      })
      .from(policies)
      .innerJoin(policyCategories, eq(policies.categoryId, policyCategories.id))
      .orderBy(policyCategories.name, policies.name);

    res.json(result);
  } catch (err) {
    console.error("Error listing policies:", err);
    res.status(500).json({ error: "Failed to list policies" });
  }
});

// ─── GET /api/policy-categories ──────────────────────────────────────────────

policyRoutes.get("/policy-categories", async (_req: Request, res: Response) => {
  try {
    const result = await db
      .select()
      .from(policyCategories)
      .orderBy(policyCategories.name);

    res.json(result);
  } catch (err) {
    console.error("Error listing categories:", err);
    res.status(500).json({ error: "Failed to list policy categories" });
  }
});

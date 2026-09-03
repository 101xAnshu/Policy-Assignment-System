/**
 * Assignment Rule API routes.
 *
 * GET  /api/rules                 — list all rules (with current version)
 * GET  /api/rules/:id             — get rule detail with all versions
 * POST /api/rules                 — create a new rule (as DRAFT)
 * POST /api/rules/:id/versions    — create a new pending version (history preserved, no reconcile yet)
 * POST /api/rules/:id/publish     — publish an explicit version (one RULE_PUBLISHED event)
 * POST /api/rules/:id/preview     — preview rule impact before publishing
 * POST /api/rules/preview-impact  — preview rule impact for new/draft rule before creating
 */

import { Router, type Request, type Response } from "express";
import { db } from "@warp/db";
import {
  assignmentRules,
  assignmentRuleVersions,
  policies,
  policyCategories,
  employees,
  publishOutboxEvent,
} from "@warp/db";
import { eq, desc } from "drizzle-orm";
import { validatePredicate, extractDependencies } from "@warp/domain";
import type { Predicate, EmployeeContext } from "@warp/domain";
import {
  resolve,
  loadEmployeeContextAt,
  loadActiveRulesAt,
  type EvaluatableRule,
} from "@warp/resolver";

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

// ─── POST /api/rules/preview-impact ────────────────────────────────────

ruleRoutes.post("/preview-impact", async (req: Request, res: Response) => {
  try {
    const { companyId, policyId, categoryId, predicate, priority, effectiveFrom, ruleId } =
      req.body;

    if (!companyId || !policyId || !categoryId || !predicate || priority === undefined) {
      res.status(400).json({
        error: "Missing required fields for rule impact preview",
        required: ["companyId", "policyId", "categoryId", "predicate", "priority"],
      });
      return;
    }

    const evalDate = effectiveFrom ?? new Date().toISOString().split("T")[0];

    // 1. Get policy and category metadata
    const [policy] = await db.select().from(policies).where(eq(policies.id, policyId));
    const [category] = await db.select().from(policyCategories).where(eq(policyCategories.id, categoryId));

    if (!policy || !category) {
      res.status(404).json({ error: "Policy or Category not found" });
      return;
    }

    // 2. Load baseline active rules
    const baselineRules = await loadActiveRulesAt(companyId, evalDate);

    // 3. Construct proposed rule
    const proposedRuleItem: EvaluatableRule = {
      ruleId: (ruleId ?? "proposed-rule") as any,
      ruleVersionId: "proposed-version" as any,
      version: 1,
      policyId: policy.id as any,
      policyName: policy.name,
      categoryId: category.id as any,
      categoryKey: category.key,
      categoryName: category.name,
      cardinality: category.cardinality as any,
      predicate: predicate as Predicate,
      priority: Number(priority),
      effectiveFrom: evalDate,
      effectiveTo: null,
    };

    // Filter out previous version of same rule if updating existing rule
    const proposedRules = [
      ...baselineRules.filter((r) => r.ruleId !== proposedRuleItem.ruleId),
      proposedRuleItem,
    ];

    // 4. Load all employees in company
    const allEmps = await db
      .select({ id: employees.id, name: employees.name, department: employees.department })
      .from(employees)
      .where(eq(employees.companyId, companyId));

    let totalNewlyAssigned = 0;
    let totalRevoked = 0;
    let totalChanged = 0;
    let totalUnchanged = 0;
    const affectedEmployees: Array<{
      employeeId: string;
      name: string;
      department: string;
      added: Array<{ policyId: string; policyName: string; categoryName: string }>;
      revoked: Array<{ policyId: string; policyName: string; categoryName: string }>;
      changed: Array<{ policyId: string; policyName: string; categoryName: string }>;
    }> = [];

    for (const empMeta of allEmps) {
      const empContext = await loadEmployeeContextAt(empMeta.id, evalDate);
      if (!empContext) continue;

      const baseRes = resolve(empContext, baselineRules, evalDate);
      const propRes = resolve(empContext, proposedRules, evalDate);

      const basePolicies = new Map(baseRes.assignments.map((a) => [a.policyId, a]));
      const propPolicies = new Map(propRes.assignments.map((a) => [a.policyId, a]));

      const added: any[] = [];
      const revoked: any[] = [];
      const changed: any[] = [];

      for (const [pId, pAsgn] of propPolicies.entries()) {
        const baseAsgn = basePolicies.get(pId);
        if (!baseAsgn) {
          added.push({
            policyId: pId,
            policyName: policy.id === pId ? policy.name : "Policy " + pId,
            categoryName: category.name,
          });
        } else if (
          baseAsgn.sourceRuleId !== pAsgn.sourceRuleId ||
          baseAsgn.sourceRuleVersion !== pAsgn.sourceRuleVersion
        ) {
          changed.push({
            policyId: pId,
            policyName: policy.id === pId ? policy.name : "Policy " + pId,
            categoryName: category.name,
          });
        }
      }

      for (const [pId, baseAsgn] of basePolicies.entries()) {
        if (!propPolicies.has(pId)) {
          revoked.push({
            policyId: pId,
            policyName: "Policy " + pId,
            categoryName: category.name,
          });
        }
      }

      if (added.length > 0 || revoked.length > 0 || changed.length > 0) {
        totalNewlyAssigned += added.length;
        totalRevoked += revoked.length;
        totalChanged += changed.length;
        affectedEmployees.push({
          employeeId: empMeta.id,
          name: empMeta.name,
          department: empMeta.department,
          added,
          revoked,
          changed,
        });
      } else {
        totalUnchanged += baseRes.assignments.length;
      }
    }

    res.json({
      evaluationDate: evalDate,
      proposedRule: {
        policyName: policy.name,
        categoryName: category.name,
        priority: Number(priority),
      },
      summary: {
        totalEmployees: allEmps.length,
        affectedEmployeesCount: affectedEmployees.length,
        newlyAssignedCount: totalNewlyAssigned,
        revokedCount: totalRevoked,
        changedCount: totalChanged,
        unchangedCount: totalUnchanged,
      },
      affectedEmployees,
    });
  } catch (err) {
    console.error("Error previewing rule impact:", err);
    res.status(500).json({ error: "Failed to preview rule impact" });
  }
});

// ─── POST /api/rules/:id/preview ───────────────────────────────────────

ruleRoutes.post("/:id/preview", async (req: Request, res: Response) => {
  try {
    const ruleId = req.params.id;
    const { predicate, priority, effectiveFrom } = req.body;

    const [rule] = await db
      .select({
        id: assignmentRules.id,
        companyId: assignmentRules.companyId,
        policyId: assignmentRules.policyId,
        categoryId: assignmentRules.categoryId,
        name: assignmentRules.name,
        currentVersion: assignmentRules.currentVersion,
      })
      .from(assignmentRules)
      .where(eq(assignmentRules.id, ruleId));

    if (!rule) {
      res.status(404).json({ error: "Rule not found" });
      return;
    }

    // Load latest version if predicate/priority not overridden in body
    let pred = predicate;
    let prio = priority;
    let eff = effectiveFrom;

    if (!pred || prio === undefined) {
      const [latest] = await db
        .select()
        .from(assignmentRuleVersions)
        .where(eq(assignmentRuleVersions.ruleId, ruleId))
        .orderBy(desc(assignmentRuleVersions.version))
        .limit(1);

      if (latest) {
        pred = pred ?? latest.predicate;
        prio = prio !== undefined ? prio : latest.priority;
        eff = eff ?? latest.effectiveFrom;
      }
    }

    // Forward to impact preview calculation
    req.body = {
      companyId: rule.companyId,
      policyId: rule.policyId,
      categoryId: rule.categoryId,
      predicate: pred,
      priority: prio,
      effectiveFrom: eff,
      ruleId,
    };

    // Call impact preview logic
    const evalDate = eff ?? new Date().toISOString().split("T")[0];
    const [policy] = await db.select().from(policies).where(eq(policies.id, rule.policyId));
    const [category] = await db.select().from(policyCategories).where(eq(policyCategories.id, rule.categoryId));

    const baselineRules = await loadActiveRulesAt(rule.companyId, evalDate);
    const proposedRuleItem: EvaluatableRule = {
      ruleId: ruleId as any,
      ruleVersionId: "proposed-version" as any,
      version: (rule.currentVersion ?? 0) + 1,
      policyId: policy.id as any,
      policyName: policy.name,
      categoryId: category.id as any,
      categoryKey: category.key,
      categoryName: category.name,
      cardinality: category.cardinality as any,
      predicate: pred as Predicate,
      priority: Number(prio),
      effectiveFrom: evalDate,
      effectiveTo: null,
    };

    const proposedRules = [
      ...baselineRules.filter((r) => r.ruleId !== ruleId),
      proposedRuleItem,
    ];

    const allEmps = await db
      .select({ id: employees.id, name: employees.name, department: employees.department })
      .from(employees)
      .where(eq(employees.companyId, rule.companyId));

    let totalNewlyAssigned = 0;
    let totalRevoked = 0;
    let totalChanged = 0;
    let totalUnchanged = 0;
    const affectedEmployees: Array<{
      employeeId: string;
      name: string;
      department: string;
      added: Array<{ policyId: string; policyName: string; categoryName: string }>;
      revoked: Array<{ policyId: string; policyName: string; categoryName: string }>;
      changed: Array<{ policyId: string; policyName: string; categoryName: string }>;
    }> = [];

    for (const empMeta of allEmps) {
      const empContext = await loadEmployeeContextAt(empMeta.id, evalDate);
      if (!empContext) continue;

      const baseRes = resolve(empContext, baselineRules, evalDate);
      const propRes = resolve(empContext, proposedRules, evalDate);

      const basePolicies = new Map(baseRes.assignments.map((a) => [a.policyId, a]));
      const propPolicies = new Map(propRes.assignments.map((a) => [a.policyId, a]));

      const added: any[] = [];
      const revoked: any[] = [];
      const changed: any[] = [];

      for (const [pId, pAsgn] of propPolicies.entries()) {
        const baseAsgn = basePolicies.get(pId);
        if (!baseAsgn) {
          added.push({
            policyId: pId,
            policyName: policy.id === pId ? policy.name : "Policy " + pId,
            categoryName: category.name,
          });
        } else if (
          baseAsgn.sourceRuleId !== pAsgn.sourceRuleId ||
          baseAsgn.sourceRuleVersion !== pAsgn.sourceRuleVersion
        ) {
          changed.push({
            policyId: pId,
            policyName: policy.id === pId ? policy.name : "Policy " + pId,
            categoryName: category.name,
          });
        }
      }

      for (const [pId] of basePolicies.entries()) {
        if (!propPolicies.has(pId)) {
          revoked.push({
            policyId: pId,
            policyName: "Policy " + pId,
            categoryName: category.name,
          });
        }
      }

      if (added.length > 0 || revoked.length > 0 || changed.length > 0) {
        totalNewlyAssigned += added.length;
        totalRevoked += revoked.length;
        totalChanged += changed.length;
        affectedEmployees.push({
          employeeId: empMeta.id,
          name: empMeta.name,
          department: empMeta.department,
          added,
          revoked,
          changed,
        });
      } else {
        totalUnchanged += baseRes.assignments.length;
      }
    }

    res.json({
      ruleId,
      evaluationDate: evalDate,
      proposedRule: {
        ruleName: rule.name,
        policyName: policy.name,
        categoryName: category.name,
        priority: Number(prio),
      },
      summary: {
        totalEmployees: allEmps.length,
        affectedEmployeesCount: affectedEmployees.length,
        newlyAssignedCount: totalNewlyAssigned,
        revokedCount: totalRevoked,
        changedCount: totalChanged,
        unchangedCount: totalUnchanged,
      },
      affectedEmployees,
    });
  } catch (err) {
    console.error("Error previewing rule impact:", err);
    res.status(500).json({ error: "Failed to preview rule impact" });
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

    if (!companyId || !policyId || !categoryId || !name || !predicate || priority === undefined) {
      res.status(400).json({
        error: "Missing required fields",
        required: ["companyId", "policyId", "categoryId", "name", "predicate", "priority"],
      });
      return;
    }

    const predicateErrors = validatePredicate(predicate);
    if (predicateErrors.length > 0) {
      res.status(400).json({
        error: "Invalid predicate",
        details: predicateErrors,
      });
      return;
    }

    const result = await db.transaction(async (tx) => {
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

      const dependencies = extractDependencies(predicate as Predicate);
      const [version] = await tx
        .insert(assignmentRuleVersions)
        .values({
          ruleId: rule.id,
          version: 1,
          predicate,
          priority: Number(priority),
          effectiveFrom: effectiveFrom ?? new Date().toISOString().split("T")[0],
          effectiveTo: null,
          dependencies,
          createdBy: "admin",
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

// ─── POST /api/rules/:id/versions ────────────────────────────────────────────
// Creates a new pending version. Validates predicate, stores dependencies,
// increments max(version)+1, preserves history. Does NOT change currentVersion
// and emits NO outbox event — reconciliation happens on explicit publish.

ruleRoutes.post("/:id/versions", async (req: Request, res: Response) => {
  try {
    const ruleId = req.params.id;
    const { predicate, priority, effectiveFrom, effectiveTo, createdBy } = req.body;

    if (!predicate || priority === undefined) {
      res.status(400).json({
        error: "Missing required fields",
        required: ["predicate", "priority"],
      });
      return;
    }

    const predicateErrors = validatePredicate(predicate);
    if (predicateErrors.length > 0) {
      res.status(400).json({ error: "Invalid predicate", details: predicateErrors });
      return;
    }

    const prio = Number(priority);
    if (!Number.isInteger(prio)) {
      res.status(400).json({ error: "Priority must be an integer" });
      return;
    }

    const from = effectiveFrom ?? new Date().toISOString().split("T")[0];
    if (typeof from !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
      res.status(400).json({ error: "effectiveFrom must be YYYY-MM-DD" });
      return;
    }
    const to = effectiveTo ?? null;
    if (to !== null && (typeof to !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(to))) {
      res.status(400).json({ error: "effectiveTo must be YYYY-MM-DD or null" });
      return;
    }
    if (to !== null && to <= from) {
      res.status(400).json({ error: "effectiveTo must be after effectiveFrom ([from, to) half-open)" });
      return;
    }

    const result = await db.transaction(async (tx) => {
      const [rule] = await tx
        .select()
        .from(assignmentRules)
        .where(eq(assignmentRules.id, ruleId));
      if (!rule) return { error: "Rule not found", status: 404 } as const;

      const existing = await tx
        .select({ version: assignmentRuleVersions.version })
        .from(assignmentRuleVersions)
        .where(eq(assignmentRuleVersions.ruleId, ruleId));
      const nextVersion = existing.reduce((m, r) => Math.max(m, r.version), 0) + 1;

      const dependencies = extractDependencies(predicate as Predicate);
      const [version] = await tx
        .insert(assignmentRuleVersions)
        .values({
          ruleId,
          version: nextVersion,
          predicate,
          priority: prio,
          effectiveFrom: from,
          effectiveTo: to,
          dependencies,
          createdBy: createdBy ?? "admin",
        })
        .returning();

      await tx
        .update(assignmentRules)
        .set({ updatedAt: new Date() })
        .where(eq(assignmentRules.id, ruleId));

      return { version };
    });

    if ("error" in result && typeof (result as any).status === "number") {
      res.status((result as any).status).json({ error: (result as any).error });
      return;
    }

    res.status(201).json(result);
  } catch (err) {
    console.error("Error creating rule version:", err);
    res.status(500).json({ error: "Failed to create rule version" });
  }
});

// ─── POST /api/rules/:id/publish ─────────────────────────────────────────────
// Publishes an EXPLICIT version. Duplicate publish of the current version is an
// idempotent no-op (no second outbox event). Publishing a non-latest version
// over a newer one is rejected with 409. Exactly one RULE_PUBLISHED per success.

ruleRoutes.post("/:id/publish", async (req: Request, res: Response) => {
  try {
    const ruleId = req.params.id;
    const requestedVersion = req.body?.version;

    if (requestedVersion !== undefined && (!Number.isInteger(requestedVersion) || requestedVersion <= 0)) {
      res.status(400).json({ error: "version must be a positive integer when provided" });
      return;
    }

    const result = await db.transaction(async (tx) => {
      const [rule] = await tx
        .select()
        .from(assignmentRules)
        .where(eq(assignmentRules.id, ruleId));

      if (!rule) {
        return { error: "Rule not found", status: 404 } as const;
      }

      const versions = await tx
        .select()
        .from(assignmentRuleVersions)
        .where(eq(assignmentRuleVersions.ruleId, ruleId))
        .orderBy(desc(assignmentRuleVersions.version));

      if (versions.length === 0) {
        return { error: "No version found to publish", status: 400 } as const;
      }

      const latestVersion = versions[0];
      const targetVersion =
        requestedVersion !== undefined
          ? versions.find((v) => v.version === requestedVersion)
          : latestVersion;

      if (!targetVersion) {
        return { error: `Version ${requestedVersion} not found for rule`, status: 404 } as const;
      }

      // Idempotent duplicate: already publishing exactly this version.
      if (rule.status === "ACTIVE" && rule.currentVersion === targetVersion.version) {
        return { rule, publishedVersion: targetVersion, duplicate: true } as const;
      }

      // Prevent stale publish: only the latest version may become current
      // (unless it is already current, handled above).
      if (targetVersion.version !== latestVersion.version) {
        return {
          error: `Stale publish rejected: version ${targetVersion.version} is not the latest (latest is ${latestVersion.version}, current is ${rule.currentVersion ?? "none"}). Publish the latest version.`,
          status: 409,
        } as const;
      }

      const [updated] = await tx
        .update(assignmentRules)
        .set({
          status: "ACTIVE",
          currentVersion: targetVersion.version,
          updatedAt: new Date(),
        })
        .where(eq(assignmentRules.id, ruleId))
        .returning();

      await publishOutboxEvent(
        {
          eventType: "RULE_PUBLISHED",
          entityType: "ASSIGNMENT_RULE",
          entityId: ruleId,
          payload: {
            companyId: rule.companyId,
            version: targetVersion.version,
            effectiveAt: targetVersion.effectiveFrom,
          },
        },
        tx,
      );

      return { rule: updated, publishedVersion: targetVersion };
    });

    if ("error" in result && typeof (result as any).status === "number") {
      res.status((result as any).status).json({ error: (result as any).error });
      return;
    }

    res.json(result);
  } catch (err) {
    console.error("Error publishing rule:", err);
    res.status(500).json({ error: "Failed to publish rule" });
  }
});

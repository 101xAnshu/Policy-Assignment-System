/**
 * Express application definition.
 * Build Spec §29.
 *
 * Configures middleware, routes, static frontend assets, and error handling.
 */

import express from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { employeeRoutes } from "./routes/employees";
import { policyRoutes } from "./routes/policies";
import { ruleRoutes } from "./routes/rules";
import { groupRoutes } from "./routes/groups";
import { resolveRoutes } from "./routes/resolve";
import { assignmentRoutes } from "./routes/assignments";
import { reconcileRoutes } from "./routes/reconcile";
import { auditRoutes } from "./routes/audit";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();

  app.use(express.json());

  // ─── Health check ──────────────────────────────────────────────────────────
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // ─── API Routes ────────────────────────────────────────────────────────────
  app.use("/api/employees", employeeRoutes);
  app.use("/api", policyRoutes);
  app.use("/api/rules", ruleRoutes);
  app.use("/api/groups", groupRoutes);
  app.use("/api", resolveRoutes);
  app.use("/api", assignmentRoutes);
  app.use("/api", reconcileRoutes);
  app.use("/api", auditRoutes);

  // ─── Static Frontend Serving (Vite Build) ──────────────────────────────────
  const clientDist = path.resolve(__dirname, "../dist/client");
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api")) return next();
      res.sendFile(path.join(clientDist, "index.html"));
    });
  }

  // ─── Error handling ────────────────────────────────────────────────────────
  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      console.error("Unhandled error:", err);
      res.status(500).json({
        error: "Internal server error",
        message: process.env.NODE_ENV === "development" ? err.message : undefined,
      });
    },
  );

  return app;
}

export const app = createApp();

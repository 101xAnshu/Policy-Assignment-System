/**
 * @warp/reconciler — Desired vs Actual Diff and Reconciliation Engine.
 */

export {
  computeDiff,
  buildExplanationSnapshot,
  type DiffResult,
  type ActualAssignment,
} from "./diff";

export {
  scheduleFutureTemporalJobs,
  addMonthsToDate,
} from "./temporal-planner";

export {
  previewReconcile,
  reconcileEmployee,
  reconcileCompany,
  type ReconcileResult,
  type CompanyReconcileResult,
} from "./reconciler";

export {
  buildDependencyIndex,
  type DependencyIndex,
} from "./dependency-index";

export {
  reconcileEmployeeScoped,
} from "./scoped-reconciler";

export {
  processNextOutboxEvents,
  processDueTemporalJobs,
  type OutboxProcessSummary,
} from "./outbox-processor";

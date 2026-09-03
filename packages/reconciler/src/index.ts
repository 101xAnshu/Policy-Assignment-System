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
  STALE_CLAIM_TIMEOUT_MS,
  MAX_CLAIM_ATTEMPTS,
  type OutboxProcessSummary,
  type OutboxProcessOptions,
  type TemporalProcessSummary,
  type TemporalProcessOptions,
} from "./outbox-processor";

# Reconciliation

## Core API

```typescript
previewReconcile(employeeId, at) // load + resolve + diff, no writes
reconcileEmployee(employeeId, at, { actor }) // diff + transactional apply + audit + schedule jobs
reconcileCompany(companyId, at, { actor }) // per-employee loop with failure isolation
reconcileEmployeeScoped(employeeId, categories, at) // same, restricted to categories
```

## Desired vs Actual vs Diff

- **Desired** comes from `resolve(employeeContextAt(t), activeRulesAt(t), t)` (`packages/resolver`). It is never trusted from the event payload.
- **Actual** comes from `getActiveAssignmentsAt(employeeId, t)` — rows where `effectiveFrom <= t < effectiveTo` (or `effectiveTo IS NULL`).
- **Diff** (`packages/reconciler/src/diff.ts`, pure) groups both sides by category, then by policy: missing policy → `toAdd`; extra policy → `toRevoke`; same policy with different `sourceRuleId/sourceRuleVersion` → `toUpdate` (close + insert); otherwise `unchanged`. Each add/update carries an `ExplanationSnapshot` built from the category decision. Snapshot drift alone (same rule/version, changed tenure text) does not trigger an update.
- **Apply** closes rows (`effectiveTo = t`), inserts new rows (`effectiveFrom = t`), and writes `POLICY_ASSIGNED / POLICY_REVOKED / POLICY_UPDATED` audit events in one transaction.

## Idempotency

The worker never deletes-and-reinserts. Converged state diffs to `hasChanges: false`, so `reconcileEmployee("sarah", t)` twice yields zero second-pass writes. Covered by `reconcile-api.test.ts` (single + company double-run) and property test P5.

## Temporal Guards

- Point-in-time loads return null before the first version (pre-hire): resolve/preview answer 404, reconcile fails explicitly.
- `PATCH` rejects `effectiveAt` before the open version's start (400); group remove rejects `effectiveAt` before membership start (400).
- Both apply loops skip any close dated before the row's own start, so `[effectiveFrom, effectiveTo)` can never invert.
- `temporal-integrity.test.ts` asserts the global invariant across assignments, versions, and memberships after mixed-date operations.

## Scoped Reconciliation and Dependency Index

`buildDependencyIndex(activeRules)` maps each rule's extracted dependencies to categories: employee fields (`country/state/department/employmentType/isManager`), group IDs, and a tenure flag (`packages/reconciler/src/dependency-index.ts`).

- `EMPLOYEE_UPDATED{changedFields}` → `getAffectedCategoriesForAttributes` → `reconcileEmployeeScoped` on those categories only.
- `GROUP_MEMBERSHIP_CHANGED{groupId}` → `getAffectedCategoriesForGroup` → scoped to that group's categories.
- Empty scope returns zero changes without touching the DB. Per-category independence is what makes scoped results equal full recompute for the touched categories.
- Rule publishes intentionally skip scoped filtering and run `reconcileCompany` (sequential, correctness over optimization).

## Transactional Outbox

Mutations write the domain row plus `outbox_events` in one Postgres transaction (`packages/db/src/outbox/publisher.ts`). Event types: `EMPLOYEE_CREATED`, `EMPLOYEE_UPDATED{changedFields,effectiveAt,entityVersion}`, `GROUP_MEMBERSHIP_CHANGED{groupId}`, `RULE_PUBLISHED{companyId,version}`. There is no broker.

## Worker Retries and Recovery

`processNextOutboxEvents` / `processDueTemporalJobs` (`packages/reconciler/src/outbox-processor.ts`, polled by `apps/worker`) share one contract:

- Claims use `FOR UPDATE SKIP LOCKED` and are **leases**: rows with `claimed_at` older than `STALE_CLAIM_TIMEOUT_MS` (default 5 min) are reclaimable, so a crash never loses work.
- `attempts` increments atomically on claim (crashes count). Rows at `MAX_CLAIM_ATTEMPTS` (default 10) are excluded and stay **unprocessed** with `last_error` — failed work is never silently completed.
- Success sets `processed_at` and clears `last_error`. Failure releases the lease (`claimed_at = NULL`) and records the error, then continues the batch (one poison event never aborts the rest).
- A `RULE_PUBLISHED` whose company run has per-employee failures fails the event itself so it retries; prior successes replay as idempotent no-ops.

Proven by `tests/integration/worker-durability.test.ts` (stale reclaim, retry/parking, batch isolation, eventual retry, replay).

## Rule-Change Fanout

Publish moves `currentVersion` and emits one `RULE_PUBLISHED`. The worker runs `reconcileCompany`, which reconciles every employee sequentially, sums add/revoke/update/unchanged, and collects `failures[]` instead of throwing on the first bad employee. Stale publishes (non-latest version) are rejected `409`; republishing the current version is an idempotent `duplicate:true` no-op with no second event (`tests/integration/rule-versioning.test.ts`).

## Temporal Triggers

`scheduleFutureTemporalJobs` scans active tenure predicates and inserts `temporal_jobs` rows for future milestones; future-dated employee changes insert their own job. `processDueTemporalJobs(cutoff)` reconciles each due employee at its trigger date with the same lease/retry/isolate semantics. Month-end calendar arithmetic can schedule a milestone that still evaluates short (e.g. Jan 31 + 1 month → Feb 28 with tenure 0); the job then succeeds idempotently but the boundary fires late — a documented limitation.

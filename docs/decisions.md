# Design Decisions

## Final Architecture (what shipped)

### 1. Branded ID types
**Decision:** Use TypeScript branded types for all entity IDs (e.g., `EmployeeId`, `PolicyId`).
**Why:** Prevents accidentally passing an employee ID where a policy ID is expected. Compile-time safety with zero runtime cost. Important for a system where many entities reference each other.

### 2. Deterministic seed IDs
**Decision:** Use hardcoded UUID-format strings (e.g., `e0000000-0000-0000-0000-000000000001`) instead of `gen_random_uuid()` for seed data.
**Why:** Tests can reference specific employees/rules/policies without querying the database first. Makes integration tests deterministic and reproducible.

### 3. Cardinality on PolicyCategory, not on rules
**Decision:** The `cardinality` field lives on `PolicyCategory`, not on individual `AssignmentRule` records.
**Why:** Cardinality is a property of the business domain ("Vacation is one-of"), not of a specific rule. All rules in the same category must obey the same cardinality constraint. Enforcement is application-level (resolver + diff + direct-POST 409); no DB exclusion constraint was added.

### 4. Priority on AssignmentRuleVersion, not on AssignmentRule
**Decision:** `priority` is a field on `AssignmentRuleVersion`, not on the rule identity.
**Why:** A published rule version must be immutable (P7). If priority lived on the rule, changing it would retroactively alter how past versions were resolved. By putting priority on the version, each published version's behavior is frozen.

### 5. Employee version history as separate table
**Decision:** Use an `employee_versions` table with temporal validity rather than tracking changes through audit events.
**Why:** Point-in-time resolution requires efficiently querying "what was this employee's state on date X?" A dedicated temporal table with `[validFrom, validTo)` intervals supports this directly, while reconstructing state from an audit log would be expensive and fragile.

### 6. Express + Vite SPA (final; Next.js not adopted)
**Decision:** Ship Express 4 JSON API plus a Vite React 19 SPA (dev `:3000` proxying `/api` to `:3001`; production bundle served statically by Express). Keep this instead of migrating to Next.js.
**Why:** The Express API already worked and the Vite build covers every demo flow. A framework migration added risk without new capability. The original "refactor to Next.js in Phase 7" plan is superseded.

### 7. ALL with empty children = match all employees
**Decision:** `{ type: "ALL", children: [] }` is vacuously true (matches every employee).
**Why:** This is mathematically natural (the conjunction of zero conditions is true) and avoids needing a special "ALWAYS" predicate type. Rules like "everyone gets Slack" use this pattern.

### 8. Half-open intervals for all temporal ranges
**Decision:** All date ranges use half-open intervals `[from, to)`.
**Why:** Half-open intervals avoid off-by-one ambiguity. They compose cleanly: if version 1 is `[Jan 1, Mar 15)` and version 2 is `[Mar 15, ...)`, there is no gap or overlap. This is a well-established pattern in temporal databases.

### 9. JSONB for predicates and dependencies
**Decision:** Store predicate ASTs and dependency sets as JSONB columns rather than normalized relational tables.
**Why:** Predicates are small, tree-structured, and always loaded as a unit. JSONB gives us efficient storage, indexing capabilities, and natural TypeScript serialization without a complex join structure.

### 10. Separate business-effective dates from system timestamps
**Decision:** Use `date` for business-effective dates and `timestamp with time zone` for system timestamps.
**Why:** Business dates (when a policy takes effect) are calendar-day concepts independent of timezone. System timestamps (when a record was created) need timezone awareness. Conflating these leads to subtle bugs around midnight boundaries.

### 11. Bounded worker leases instead of a broker
**Decision:** Add `attempts` + `last_error` to `outbox_events` / `temporal_jobs`; treat `claimed_at` as a reclaimable lease (default 5 min) with `MAX_CLAIM_ATTEMPTS` 10; release the lease on failure; park exhausted rows unprocessed.
**Why:** Counting deliveries requires worker state, and crashes never reach a failure handler — so the count must increment on claim. This yields bounded at-least-once delivery on Postgres alone. No Kafka/Redis/SQS.

### 12. Per-employee isolation in company reconciliation
**Decision:** `reconcileCompany` collects `failures[]` per employee instead of throwing on the first error; a partially-failed `RULE_PUBLISHED` event fails and retries (successes replay as no-ops).
**Why:** One poison employee must not block the company, but its work must remain retryable. Idempotent convergence makes whole-company retry safe.

### 13. Explicit-version publish with stale/duplicate guards
**Decision:** `POST /versions` drafts `max+1` with validated predicate + stored dependencies and no event; `POST /publish` requires (or defaults to) an explicit version, rejects non-latest with 409, and treats republishing current as idempotent `duplicate:true` with no second event.
**Why:** The original latest-only publish could not express intent and re-emitted events on duplicates. Explicit versions make "edit → preview → publish → reconcile" demonstrable via API/UI.

### 14. Constrained rule authoring (no DSL expansion)
**Decision:** UI builders support single `EQUALS` or `ALL (everyone)` only; `IS_MANAGER` / `GROUP_MEMBER` / `TENURE_AT_LEAST` remain API/seed-capable with no visual builder and no OR/NOT.
**Why:** Covers the priority-change and broaden-to-everyone demos without growing a generalized expression language the assignment forbids.

### 15. Test-only failure hooks
**Decision:** `failForEmployeeIds` options on `reconcileCompany` / `processDueTemporalJobs` exist only for deterministic durability tests.
**Why:** Foreign keys make real per-employee poison hard to construct; the hooks prove isolation and retry without touching resolver semantics or production paths.

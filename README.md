# Warp Policy Assignment System

> **Demo-grade policy assignment system built with production patterns: deterministic resolution, temporal state, incremental reconciliation, and explainable decisions.**
> Built with Node.js, TypeScript, PostgreSQL 16, Drizzle ORM, Express, React 19, Vite, React Flow (`@xyflow/react`), and Tailwind CSS.

---

## Table of Contents
1. [Executive Summary & Architectural Pillars](#executive-summary--architectural-pillars)
2. [Domain Model & Entity Relationships](#domain-model--entity-relationships)
3. [Temporal Semantics & Interval Math](#temporal-semantics--interval-math)
4. [Deterministic Resolver & Ambiguity Detection](#deterministic-resolver--ambiguity-detection)
5. [Reconciliation Engine & Atomic Convergence](#reconciliation-engine--atomic-convergence)
6. [Transactional Outbox & Scoped Incremental Reconciler](#transactional-outbox--scoped-incremental-reconciler)
7. [Audit System & "Why?" Explainability Engine](#audit-system--why-explainability-engine)
8. [React Flow Dynamic Resolution DAG & Web UI](#react-flow-dynamic-resolution-dag--web-ui)
9. [Property-Based Testing & Mathematical Invariants](#property-based-testing--mathematical-invariants)
10. [Acme Corporation Live Demo Scenario](#acme-corporation-live-demo-scenario)
11. [Scope & Known Limitations](#scope--known-limitations)
12. [Quickstart & Getting Started](#quickstart--getting-started)

---

## Executive Summary & Architectural Pillars

The Warp Policy Assignment System is a working demo of enterprise policy governance. It shows how rules, employee state, and time determine policy assignments — and proves each decision can be explained and re-converged. It is **not** a production service; there is no deployment, auth, or multi-tenancy.

- **P1: Mathematical Correctness**: Resolution is a pure function of (employee state, rules, date) with zero side effects (`packages/resolver/src/resolver.ts`).
- **P2: Deterministic Ordering**: Evaluation order is invariant under input permutation (`priority DESC`, `ruleId ASC`).
- **P3: Explicit Half-Open Temporal Windows**: Validity is [effectiveFrom, effectiveTo), preventing boundary gaps and overlaps.
- **P4: Idempotent Reconciliation**: Re-running reconciliation on converged state yields 0 additions, 0 revocations, 0 updates (`packages/reconciler/src/diff.ts`, tested in `reconcile-api.test.ts`).
- **P5: Scoped Incremental Recomputation**: Predicates are indexed by employee fields, group IDs, and tenure flags so only affected categories reconcile (`packages/reconciler/src/dependency-index.ts`, `scoped-reconciler.ts`).
- **P6: Auditability & "Why?" Explainability**: Assignments carry a frozen decision snapshot; the Why engine reuses the resolver, not a second algorithm (`packages/audit/src/why-engine.ts`).

```mermaid
graph LR
    subgraph Input ["Temporal State (Date t)"]
        E["Employee Context (v_t)"]
        R["Active Rules (R_t)"]
        G["Group Memberships"]
    end

    subgraph Core ["Deterministic Resolution"]
        PE["Pure Predicate Engine"]
        DR["Deterministic Resolver"]
        AMB{"Ambiguity Check"}
    end

    subgraph Convergence ["Reconciliation & Storage"]
        DIFF["Desired vs Actual Diff"]
        STORE[("PostgreSQL 16")]
        OUTBOX[("Transactional Outbox")]
    end

    subgraph Workers ["Async Convergence"]
        W["Worker: outbox + temporal jobs<br/>lease + bounded retry"]
    end

    subgraph Insights ["Audit & Visualization"]
        WHY["'Why?' Engine"]
        DAG["React Flow DAG"]
        TL["Unified Timeline"]
    end

    E --> PE
    R --> PE
    G --> PE
    PE --> DR
    DR --> AMB
    AMB -->|Resolved| DIFF
    DIFF --> STORE
    STORE --> OUTBOX
    OUTBOX --> W
    W --> STORE
    STORE --> WHY
    DR --> DAG
    STORE --> TL
```

---

## Domain Model & Entity Relationships

```mermaid
erDiagram
    COMPANIES ||--o{ EMPLOYEES : employs
    COMPANIES ||--o{ POLICY_CATEGORIES : defines
    COMPANIES ||--o{ POLICIES : owns
    COMPANIES ||--o{ GROUPS : maintains

    EMPLOYEES ||--o{ EMPLOYEE_VERSIONS : tracks
    EMPLOYEES ||--o{ GROUP_MEMBERSHIPS : belongs
    EMPLOYEES ||--o{ POLICY_ASSIGNMENTS : assigned

    POLICY_CATEGORIES ||--o{ POLICIES : groups
    POLICY_CATEGORIES ||--o{ ASSIGNMENT_RULES : governs

    ASSIGNMENT_RULES ||--o{ ASSIGNMENT_RULE_VERSIONS : versions
    ASSIGNMENT_RULE_VERSIONS }o--|| POLICIES : targets

    POLICY_ASSIGNMENTS ||--o{ AUDIT_EVENTS : records
```

### Key Schemas
- **`employees` & `employee_versions`**: Valid-time history (`[validFrom, validTo)`) for country, state, department, employment type, and manager flag.
- **`policy_categories`**: Declares cardinality (`ONE` vs `MANY`).
- **`assignment_rules` & `assignment_rule_versions`**: Stable rule identity plus immutable versions. Priority lives on the version. New versions via `POST /api/rules/:id/versions`; activation via `POST /api/rules/:id/publish` with an explicit `version`.
- **`policy_assignments`**: Materialized desired state with `explanation_snapshot` JSONB and [effectiveFrom, effectiveTo) dates.
- **`outbox_events`**: Transactional event log with `claimed_at` lease, `attempts` count, and `last_error` for bounded retries.
- **`temporal_jobs`**: Due-list for tenure milestones and future-dated changes, with the same lease/retry columns.

---

## Temporal Semantics & Interval Math

Validity intervals follow half-open semantics [effectiveFrom, effectiveTo):
1. **Active Condition**: An assignment is active at date t iff:
   `effectiveFrom <= t < effectiveTo` (or `effectiveTo` is NULL)
2. **Cardinality `ONE` Goal**: For `ONE` categories the reconciler converges toward at most one active assignment per employee. Overlap is rejected on the direct-assignment API (HTTP 409); there is **no database exclusion constraint** (see Limitations).
3. **Tenure Calculation**: Completed calendar months, minus one when the evaluation day-of-month precedes the hire day-of-month:
   Tenure(E, t) = (Year(t) - Year(hire)) × 12 + (Month(t) - Month(hire)) − (Day(t) >= Day(hire) ? 0 : 1)
   Example: hire `2024-08-28` reaches 24 months on `2026-08-28`.

---

## Deterministic Resolver & Ambiguity Detection

When resolving rules for category C at date t (`packages/resolver/src/resolver.ts`):
1. Keep rule versions where `effectiveFrom <= t < effectiveTo`.
2. Evaluate supported predicates (`ALL`, `EQUALS` on country/state/department/employmentType, `IS_MANAGER`, `GROUP_MEMBER`, `TENURE_AT_LEAST`) against the employee context and group memberships at t.
3. For **`ONE` Categories**:
   - Order matches by `priority DESC`, then `ruleId ASC`.
   - Distinct policies tied at top priority → `status: "AMBIGUOUS"`, zero assignments (never a silent winner).
   - Same policy tied at top priority → deduplicated single winner.
4. For **`MANY` Categories**:
   - Assign all matching distinct policies (deduplicated by policy).

---

## Reconciliation Engine & Atomic Convergence

Reconciliation converges materialized state toward the resolver (`packages/reconciler/src/reconciler.ts`, `diff.ts`):
1. **Preview / Diff**: `computeDiff` groups desired vs actual by category, then by policy: missing → `toAdd`, extra → `toRevoke`, same policy with different `sourceRuleId/sourceRuleVersion` → `toUpdate`, else `unchanged`.
2. **Atomic Apply**: Closes rows with `effectiveTo = t`, inserts new rows from t with an `explanationSnapshot`, and writes `POLICY_ASSIGNED / POLICY_REVOKED / POLICY_UPDATED` audit events in one transaction. Manual `POST /employees/:id/assignments` is the only non-resolver write path and is guarded by an overlap check.
3. **Idempotency**: Converged state diffs to no changes. Proven by double-reconcile tests and property test P5.

Full-company reconciliation (`reconcileCompany`) isolates per-employee failures: one bad employee is collected into `failures` and does not abort the rest.

---

## Transactional Outbox & Scoped Incremental Reconciler

1. **Transactional Outbox**: Mutations write the domain change plus `outbox_events` row in one Postgres transaction (`packages/db/src/outbox/publisher.ts`). No broker.
2. **Dependency Index** (`dependency-index.ts`): maps employee fields, group IDs, and tenure flags to categories. `EMPLOYEE_UPDATED` / `GROUP_MEMBERSHIP_CHANGED` reconcile only affected categories via `reconcileEmployeeScoped`. Rule publishes trigger full-company reconciliation (sequential; correctness preferred over indexed fanout).
3. **Worker durability** (`outbox-processor.ts`, `apps/worker`): Postgres polling with `FOR UPDATE SKIP LOCKED`. Claims are leases: stale claims (default 5 min, `STALE_CLAIM_TIMEOUT_MS`) are reclaimable; `attempts` increments on claim so crashes count; rows park after `MAX_CLAIM_ATTEMPTS` (default 10) and stay unprocessed with `last_error` — failed work is never silently marked complete. Partial company failures fail the triggering `RULE_PUBLISHED` event so it retries (successes replay as no-ops).
4. **Temporal triggers** (`temporal-planner.ts`): tenure milestones and future-dated changes schedule `temporal_jobs` rows processed by `processDueTemporalJobs` with identical lease/retry semantics.

---

## Audit System & "Why?" Explainability Engine

Answers *"Why does employee E have or not have policy P at date t?"* from the resolver trail plus the frozen snapshot on the materialized row.

### Explainability Statuses:
- **`ASSIGNED`**: Matched rule won its category.
- **`OVERRIDDEN`**: Matched, but a higher-priority rule won.
- **`NO_MATCH`**: Predicate failed (full failed-condition trail returned).
- **`AMBIGUOUS`**: Top-priority tie across distinct policies.
- **`NOT_IN_DESIRED`**: No active rule targets the policy.

UI: per-policy **Why?** modal, rule version **History** modal, unified employee timeline, audit explorer, and `GET /api/employees/:id/why?policyId=&at=`.

---

## React Flow Dynamic Resolution DAG & Web UI

Stack is **Express + Vite + React 19 + `@xyflow/react` + Tailwind** (deliberately not Next.js; see Limitations). The SPA is served statically by Express in production and via Vite dev proxy (`/api → localhost:3001`) in development.

Demonstrable flows (all wired to the real resolver/worker, no mocks):
- ⚡ **Resolution graph**: Employee → Resolver → Category decision → Policy nodes built from live `resolve` / `preview-change` results, with state simulation (CA/NY/TX/OR) and tenure presets.
- 👥 **Employees & Timeline**: list, detail with assignments + versions + timeline.
- 🧾 **Onboarding**: create form with live policy preview before save.
- ✏️ **Attribute changes**: edit modal with downstream diff preview; apply only on confirm.
- 📜 **Rules**: registry with priority ordering, **New version** authoring (constrained to single `EQUALS` or `ALL (everyone)` — no OR/NOT/DSL), version **History**, impact **Preview**, and explicit-version **Publish**.
- 🔄 **Reconciliation Center**: per-employee/company reconcile, outbox + temporal job queues with manual processing.
- 🔍 **Verify system** modal: runs randomized incremental-vs-full comparison plus invariant checks.

---

## Property-Based Testing & Mathematical Invariants

**21 suites, 146 tests, all passing** (`npx vitest run`): 7 unit files (78 tests), 10 integration files (62 tests), 4 scenario files (6 tests). Real Postgres + HTTP; no mocks. `fast-check` covers:

1. **Determinism**: order-permutation invariance (P1).
2. **Cardinality**: `ONE` never exceeds 1 in resolver output (P2).
3. **Priority Invariant**: winner is always the maximal candidate priority (P3).
4. **Reference Equivalence**: production resolver matches the reference implementation on randomized inputs (P4). The reference mirrors the production algorithm line-for-line, so this proves self-consistency, not independent specification correctness.
5. **Reconciliation Idempotency**: re-diff of converged state is empty (P5).
6. **Incremental-vs-Full**: scoped sequences equal full recompute for sequential in-order mutations (P6), plus the server `/system/verify-incremental` endpoint (policy-set comparison).

Durability tests (`worker-durability.test.ts`, 7) prove stale-claim reclaim, lease release on failure, bounded parking, batch/company/temporal isolation, eventual retry, and replay idempotency. Versioning tests (`rule-versioning.test.ts`, 7) prove the full `POST /versions → publish(version) → outbox → reconcile` lifecycle plus stale/duplicate/invalid guards. Integrity tests (`temporal-integrity.test.ts`, 10) prove pre-hire emptiness, backdate rejection with history preserved, reconciler date guards, group idempotency, and a global no-inverted-intervals invariant.

---

## Acme Corporation Live Demo Scenario

Seeded tenant (`packages/db/src/seed.ts`, deterministic UUIDs): 1 company, 7 categories, 12 policies, 12 rules, 1 group.

| Employee | State / Dept / Type / Manager | Hire Date | Notes |
|---|---|---|---|
| **Sarah Chen** | California / Engineering / Full-time / Manager (in Managers group) | 2024-08-28 | Priority-conflict demo (CA 50 beats Standard 10); tenure demo (Extended 60 at 2026-08-28) |
| **Alex Morgan** | New York / Engineering / Full-time / IC | 2023-06-15 | Location-change demo (NY→CA) |
| **Maya Patel** | California / Finance / Contractor | 2025-01-10 | Predicate-broadening demo (no stipend until rule widens) |
| **Daniel Lee** | Oregon / Engineering / Full-time / Manager (in Managers group) | 2022-03-01 | Tenured manager control |

Rule archetypes in seed: CA-vs-Standard priority conflict (Vacation `ONE`), tenure-gated Extended Vacation, group-gated Manager Training, location-gated CA Workplace Training, and `MANY` compliance/app-access/stipend rules. Suggested narrative: Why does Sarah have CA Vacation → move her to NY with preview → apply and reconcile → travel to 2026-08-28 for tenure → publish a rule version with impact preview → run Verify.

---

## Scope & Known Limitations

- **Local demo, not production**: no deployment, auth, multi-tenancy, pagination, or observability beyond structured logs.
- **Vite, not Next.js**: early drafts considered Next.js, but the implementation ships Express + Vite SPA. This was kept deliberately — the API was already working in Express and a framework migration added risk without demo value. The stack above states this honestly.
- **Cardinality is application-enforced**: overlapping `ONE` intervals are rejected on the direct-assignment route (409) and avoided by diff convergence, but there is no Postgres exclusion constraint. Concurrent writers could violate it.
- **Reference resolver is a mirror, not an oracle**: it duplicates the production algorithm, so equivalence tests prove self-consistency.
- **Incremental proof is bounded**: sequential, in-order mutations at fixed dates. Crash/retry/isolation is covered by targeted durability tests, but duplicate/out-of-order/concurrent delivery has no randomized adversarial generators.
- **Worker delivery is bounded at-least-once**: 5-minute claim leases, max 10 attempts, then rows park with `last_error`. Poison work needs operator reset (`attempts=0, claimed_at=NULL`).
- **Rule fanout is full-company sequential** with per-employee isolation; indexed old-vs-new population filtering was deferred for correctness.
- **Rule authoring is constrained**: single `EQUALS` or `ALL (everyone)` in the UI; `IS_MANAGER` / `GROUP_MEMBER` / `TENURE_AT_LEAST` rules exist in seed/API but have no visual builder. No OR/NOT/DSL by design.
- **Temporal edge**: month-end tenure arithmetic (e.g. Jan 31 + 1 month) can schedule a milestone that still evaluates short; the job succeeds idempotently but the boundary fires late.
- **Temporal guards (enforced)**: resolving before hire returns 404/empty (never fabricated state); `PATCH` with `effectiveAt` before the open version start is rejected 400 with history untouched; the reconciler never closes a row before its start; group re-add and no-op remove are idempotent (`duplicate:true`, no second event); remove with `effectiveAt` before membership start is rejected 400.

---

## Run Locally (verified from a clean checkout)

### 1. Prerequisites
- Node.js >= 20 (`node --version`)
- Docker running (`docker --version`) — for PostgreSQL 16
- Free ports: `5433` (Postgres), `3001` (API), `3000` (UI)
- No `.env` file needed. Defaults work out of the box; overrides are optional:
  - `DATABASE_URL` (default `postgresql://warp:warp_local@127.0.0.1:5433/warp_dev`)
  - `PORT` (API port, default `3000` — set `3001` when running alongside the UI)
  - `POLL_INTERVAL_MS` (worker poll cadence, default `1000`)

### 2. Install
```bash
git clone <repo-url>
cd policy-assignment-system
npm install
```

### 3. Database
```bash
docker compose up -d        # first checkout only; starts Postgres on 5433
npm run db:push             # apply schema (idempotent)
npm run db:reset            # empty all tables (required when the volume already has data, harmless otherwise)
npm run db:seed             # Acme tenant: 4 employees, 7 categories, 12 policies, 12 rules
```

### 4. Tests
```bash
# 21 suites, 146 tests (unit + integration + scenarios, real Postgres + HTTP)
npx vitest run
```

### 5. App + Worker (two terminals)
```bash
# Terminal 1 — API on :3001 plus Vite UI on :3000 (proxies /api to :3001)
PORT=3001 npm run dev:api
# Terminal 2 — background reconciliation worker
npm run dev:worker
```

Visit **`http://localhost:3000`**. Without the worker running, trigger reconciliation manually via `POST /api/worker/process-outbox` and `POST /api/worker/process-temporal` (the Reconciliation Center does this for you).

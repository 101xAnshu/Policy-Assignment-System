# Architecture

## Core Thesis

Rules are versioned declarations of desired policy state. A deterministic resolver computes desired assignments for an employee at a point in time. An event-driven, idempotent reconciliation engine incrementally converges materialized assignments toward that desired state. Every decision produces an explanation / audit trail.

## Conceptual Pipeline

```
Employee State + Versioned Rules + Point in Time
    ↓
Rule Matching (predicate evaluation)
    ↓
Candidate Policies
    ↓
Cardinality Resolution (ONE vs MANY)
    ↓
Conflict Resolution (priority DESC, rule ID ASC)
    ↓
Desired Assignment State
    ↓
Diff Against Actual State
    ↓
Reconciliation (idempotent)
    ↓
Materialized Assignments + Audit + Explanation
```

## Key Distinction

| Concept | Role | Lives in |
|---------|------|----------|
| **Rules** | Desired state declarations | `assignment_rules` + `assignment_rule_versions` |
| **Assignments** | Materialized/derived state | `policy_assignments` |
| **Reconciler** | Convergence mechanism | `packages/reconciler` + `apps/worker` |

## Non-negotiable Principles

| ID | Principle | Implication |
|----|-----------|-------------|
| P1 | PostgreSQL is authoritative | No Redis, no Kafka, no SQS; outbox + jobs are Postgres tables |
| P2 | Resolver is deterministic and pure | Same inputs → same outputs, always (`packages/resolver`) |
| P3 | Assignments are derived state | Rules + employee + time = truth |
| P4 | Reconciliation is idempotent | Running twice = running once (diff, never blind rewrite) |
| P5 | Events trigger work; events are not truth | Worker reloads employee/rules at `effectiveAt` before resolving |
| P6 | Temporal validity is explicit | Business-effective dates ≠ system timestamps |
| P7 | Historical rule versions are immutable | New behavior = new version row; publish only moves `currentVersion` |
| P8 | Explainability comes from resolution | Why engine reuses resolver decisions + frozen snapshots |

## Technology Stack (actual)

- **Backend:** TypeScript + Express 4 (JSON API under `/api`)
- **Frontend:** React 19 + Vite 5 SPA + Tailwind CSS (dev on `:3000`, proxying `/api` to the API on `:3001`; production bundle served statically by Express)
- **Graph:** `@xyflow/react` (one data-driven resolution graph)
- **Database:** PostgreSQL 16 (Compose `5433:5432`)
- **ORM:** Drizzle ORM + `postgres.js`
- **Testing:** Vitest + fast-check (real Postgres + HTTP, no mocks)
- **Runtime:** Node.js ≥ 20
- **Infrastructure:** Docker Compose + PostgreSQL only

Deliberate deviation: early plans mentioned Next.js, but the working API was already Express and the UI shipped as a Vite SPA. Migrating frameworks added risk without demo value, so Express + Vite is the final architecture.

## Runtime Components

```
Vite SPA (:3000, dev) ──/api──▶ Express API ──▶ PostgreSQL 16
   (prod bundle served              │  Drizzle ORM
    statically by Express)          │
                                    ├─ employees / versions / groups / rules
                                    ├─ policy_assignments (derived)
                                    ├─ audit_events (append-only)
                                    ├─ outbox_events (lease + attempts)
                                    └─ temporal_jobs (lease + attempts)
                                              ▲
Worker (apps/worker, Postgres polling, FOR UPDATE SKIP LOCKED)
  processNextOutboxEvents ──▶ reconcileEmployee / Scoped / Company
  processDueTemporalJobs  ──▶ reconcileEmployee at trigger date
```

## Monorepo Structure (actual)

```
policy-assignment-system/
├── apps/
│   ├── web/        # Express API (src/routes, src/server.ts) + Vite SPA (src/client)
│   └── worker/     # Polling loop calling the reconciler (no separate queue)
├── packages/
│   ├── domain/     # Predicate grammar, validation, dependency extraction, shared types
│   ├── db/         # Drizzle schema, connection, seed/reset, assignment store, outbox publisher
│   ├── rule-engine/# Pure predicate evaluator + tenure math
│   ├── resolver/   # resolve(), referenceResolver, point-in-time loaders
│   ├── reconciler/ # diff, reconciler, scoped-reconciler, dependency-index, temporal-planner, outbox-processor
│   └── audit/      # Why engine + timeline reconstruction
├── tests/
│   ├── unit/       # 7 files, pure-function tests (no DB)
│   ├── integration/# 9 files, API + worker tests against real Postgres
│   └── scenarios/  # 4 files, multi-step journeys (location, group, rule, future-dated)
└── docs/
```

## Temporal Semantics

All temporal intervals are **half-open: [from, to)**.

- `effectiveFrom = Sep 1` means active at Sep 1 00:00
- `effectiveTo = Sep 1` means NOT active at Sep 1 00:00
- `effectiveTo = null` means "no expiration" / "currently active"

Business-effective dates (`effectiveFrom`, `effectiveTo`, `validFrom`, `validTo`) use the `date` type.
System timestamps (`createdAt`, `updatedAt`, `recordedAt`, `claimedAt`, `processedAt`) use `timestamp with time zone`.

## Conflict Resolution

For matching candidates in a ONE-cardinality category:

1. `priority DESC` (higher priority wins)
2. `rule ID ASC` (deterministic tie-breaker)

If two rules at the same priority assign **different** policies: **AMBIGUOUS** (zero assignments, surfaced — never silently resolved). Same-policy ties deduplicate.

For MANY-cardinality categories: all matching policies are assigned, deduplicated by policy ID.

## Rule Versioning (actual)

- `POST /api/rules` creates identity (`DRAFT`, `currentVersion NULL`) plus `v1`.
- `POST /api/rules/:id/versions` validates the predicate, stores extracted dependencies, inserts `max(version)+1`, and leaves live state untouched (no outbox event).
- `POST /api/rules/:id/publish` takes an explicit `{ version }` (default: latest). Republishing the current version is an idempotent no-op (`duplicate:true`, no event). Publishing a non-latest version is rejected `409`. Success moves `currentVersion`, sets `ACTIVE`, and emits exactly one `RULE_PUBLISHED` event in the same transaction.
- The UI exposes this as Create → New version → History → Preview impact → Publish(version).

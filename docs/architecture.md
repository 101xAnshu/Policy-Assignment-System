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

| Concept | Role |
|---------|------|
| **Rules** | Desired state declarations |
| **Assignments** | Materialized/derived state |
| **Reconciler** | Convergence mechanism |

## Non-negotiable Principles

| ID | Principle | Implication |
|----|-----------|-------------|
| P1 | PostgreSQL is authoritative | No Redis, no Kafka, no SQS |
| P2 | Resolver is deterministic and pure | Same inputs → same outputs, always |
| P3 | Assignments are derived state | Rules + employee + time = truth |
| P4 | Reconciliation is idempotent | Running twice = running once |
| P5 | Events trigger work; events are not truth | Worker reads current state before resolving |
| P6 | Temporal validity is explicit | Business-effective dates ≠ system timestamps |
| P7 | Historical rule versions are immutable | Publishing never mutates the previous version |
| P8 | Explainability comes from resolution | No separate explanation algorithm |

## Technology Stack

- **Frontend:** Next.js + React + TypeScript + Tailwind
- **Graph:** @xyflow/react
- **Backend:** TypeScript + Express (evolving to Next.js API routes)
- **Database:** PostgreSQL 16
- **ORM:** Drizzle
- **Testing:** Vitest + fast-check
- **Runtime:** Node.js
- **Infrastructure:** Docker Compose + PostgreSQL

## Monorepo Structure

```
policy-assignment-system/
├── apps/
│   ├── web/        # API server (Phase 1), frontend (Phase 7+)
│   └── worker/     # Postgres-polling reconciliation worker
├── packages/
│   ├── domain/     # Pure types, predicate grammar, value objects
│   ├── db/         # Drizzle schema, connection, seed data
│   ├── rule-engine/# Predicate evaluator
│   ├── resolver/   # Deterministic resolution algorithm
│   ├── reconciler/ # Desired-vs-actual diff engine
│   └── audit/      # Audit event recording
├── tests/
│   ├── unit/       # Pure function tests
│   ├── integration/# Database + API tests
│   ├── scenarios/  # Realistic multi-step scenarios
│   └── property/   # fast-check property-based tests
└── docs/
```

## Temporal Semantics

All temporal intervals are **half-open: [from, to)**.

- `effectiveFrom = Sep 1` means active at Sep 1 00:00
- `effectiveTo = Sep 1` means NOT active at Sep 1 00:00
- `effectiveTo = null` means "no expiration" / "currently active"

Business-effective dates (`effectiveFrom`, `effectiveTo`, `validFrom`, `validTo`) use the `date` type.
System timestamps (`createdAt`, `updatedAt`, `recordedAt`) use `timestamp with time zone`.

## Conflict Resolution

For matching candidates in a ONE-cardinality category:

1. `priority DESC` (higher priority wins)
2. `rule ID ASC` (deterministic tie-breaker)

If two rules at the same priority assign **different** policies: **AMBIGUOUS** (surfaced as an error, never silently resolved).

For MANY-cardinality categories: all matching policies are assigned, deduplicated by policy ID.

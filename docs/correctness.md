# Correctness

## What Is Guaranteed (and Where It Is Proven)

### Deterministic Resolution
`resolve(employee, rules, at)` is pure: same context + same rule set + same date yields the same assignments and decision trail. Categories iterate in sorted `categoryId` order; `ONE` winners sort by `priority DESC, ruleId ASC`; outputs sort by `categoryId, policyId` (`packages/resolver/src/resolver.ts`). Proven by order-permutation property test P1 and shuffle unit tests. Residual risk: category display metadata is first-seen-wins if the same `categoryId` ever arrives with conflicting metadata.

### Cardinality
Resolver output never exceeds one assignment per `ONE` category (property test P2). Enforcement beyond the resolver is application-level: diff convergence avoids overlaps and the direct-assignment route rejects them (HTTP 409). There is **no Postgres exclusion constraint**, so concurrent writers are not serially protected — a stated limitation, covered only via the API test.

### Ambiguity Handling
A top-priority tie across distinct policies in a `ONE` category yields `status: "AMBIGUOUS"` with zero assignments — never a silent winner. Same-policy ties deduplicate. Unit-tested (`resolver.test.ts`); the seed contains an override conflict (CA 50 > Standard 10) but no committable tie, so ambiguity is proven by tests, not by seed data.

### Temporal Semantics
Half-open `[from, to)` everywhere: rule activity, employee versions, memberships, assignments. Tenure is inclusive completed-months arithmetic with the Sarah boundary (`2026-08-27 → 23`, `2026-08-28 → 24`) and leap-day cases unit-tested. Point-in-time loads use `validFrom <= at < validTo`.

### Idempotency
Diff-then-apply means converged state re-diffs empty. Proven by `diff.test.ts`, property test P5, and double-reconcile integration tests (single + company). Replay tests confirm no duplicate rows.

### Incremental Reconciliation
Scoped reconciliation filters rules and actuals to the dependency-index categories and diffs only that subset. Sound because categories resolve independently. Proven for sequential in-order attribute/group/priority mutations by property test P6 (60 randomized runs) and the `/system/verify-incremental` endpoint (30 employees / 50 events, policy-set equality).

### Incremental-vs-Full Verification
Two independent checks compare incremental work against full recompute: in-memory P6 and the server endpoint. Both compare assignment policy sets; the endpoint ignores rule-version/snapshot text. The reference resolver used as oracle duplicates the production algorithm, so passing proves self-consistency under the tested generator (fixed date, ≤10 rules, in-order events) — not independent specification correctness or adversarial delivery.

## Known Limitations (Deliberate, Not Fixed Here)

- No DB-level `ONE` non-overlap constraint; no backdate/inversion guard beyond API validation.
- No duplicate/out-of-order/concurrent fuzz generators; crash/retry safety is covered by targeted durability tests instead.
- Tenure month-end arithmetic can fire late (Jan 31 case).
- `Decision.winner` for `MANY` categories is the alphabetically-first policy; per-policy snapshots patch the correct winner for storage.
- `failForEmployeeIds` hooks exist solely for deterministic durability tests.

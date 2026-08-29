# Correctness

*To be documented in Phase 9 when property-based tests are implemented.*

## Core Invariants

### Determinism
```
resolve(employee, rules, date) == resolve(employee, rules, date)
```
Regardless of evaluation order (shuffle candidates to verify).

### Idempotency
```
reconcile() then reconcile() == one reconcile()
```
Same final database state.

### Cardinality
For ONE categories: ≤ 1 active assignment per employee at any point in time.

### Temporal Validity
Assignments respect their half-open intervals. ONE-category assignments never overlap.

### Reference Equivalence
```
incremental(events) == fullRecompute(finalState)
```
This is the highest-priority property test.

## Reference Resolver

A deliberately simple resolver that evaluates every employee × every active rule with no dependency optimization. Used as the ground truth for verifying the incremental reconciliation engine.

# Reconciliation

*To be documented in Phase 4 when the reconciler is implemented.*

## Core API

```typescript
reconcileEmployee(employeeId, effectiveAt): ReconciliationResult
```

## Process

```
current authoritative employee/group/rule state
    ↓
resolve(...)
    ↓
desired state
    ↓
load actual assignments
    ↓
compute diff
    ↓
transactional apply
    ↓
audit
```

## Idempotency Guarantee

Calling `reconcileEmployee("sarah", date)` repeatedly must converge to the same database state.

The reconciler calculates a diff rather than blindly deleting and re-inserting.

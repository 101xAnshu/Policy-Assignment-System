# Resolution Algorithm

*To be documented in Phase 2 when the resolver is implemented.*

## Core Function

```typescript
resolve(
  employee: EmployeeContext,
  rules: ActiveRuleVersion[],
  at: Date
): ResolutionResult
```

## Algorithm Steps

1. Determine employee state valid at `at`
2. Determine group memberships valid at `at`
3. Select rule versions valid at `at` (half-open: `[effectiveFrom, effectiveTo)`)
4. Evaluate predicates against employee context
5. Collect matching candidates
6. Group candidates by policy category
7. Resolve each category by cardinality (ONE vs MANY)
8. Produce desired assignments
9. Produce decision explanations

## Conflict Resolution

For matching candidates in a ONE-cardinality category:

```
priority DESC → rule ID ASC
```

- Higher priority wins
- Equal priority + same policy → deduplicate
- Equal priority + different policies → AMBIGUOUS

## Temporal Semantics

- Resolver always requires an explicit `at: Date` parameter
- Never implicitly uses "now" inside the resolver
- Half-open intervals: `effectiveFrom <= at AND (effectiveTo IS NULL OR at < effectiveTo)`

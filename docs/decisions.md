# Design Decisions

## Phase 1

### 1. Branded ID types
**Decision:** Use TypeScript branded types for all entity IDs (e.g., `EmployeeId`, `PolicyId`).
**Why:** Prevents accidentally passing an employee ID where a policy ID is expected. Compile-time safety with zero runtime cost. Important for a system where many entities reference each other.

### 2. Deterministic seed IDs
**Decision:** Use hardcoded UUID-format strings (e.g., `e0000000-0000-0000-0000-000000000001`) instead of `gen_random_uuid()` for seed data.
**Why:** Tests can reference specific employees/rules/policies without querying the database first. Makes integration tests deterministic and reproducible.

### 3. Cardinality on PolicyCategory, not on rules
**Decision:** The `cardinality` field lives on `PolicyCategory`, not on individual `AssignmentRule` records.
**Why:** Cardinality is a property of the business domain ("Vacation is one-of"), not of a specific rule. All rules in the same category must obey the same cardinality constraint.

### 4. Priority on AssignmentRuleVersion, not on AssignmentRule
**Decision:** `priority` is a field on `AssignmentRuleVersion`, not on the rule identity.
**Why:** A published rule version must be immutable (P7). If priority lived on the rule, changing it would retroactively alter how past versions were resolved. By putting priority on the version, each published version's behavior is frozen.

### 5. Employee version history as separate table
**Decision:** Use an `employee_versions` table with temporal validity rather than tracking changes through audit events.
**Why:** Point-in-time resolution requires efficiently querying "what was this employee's state on date X?" A dedicated temporal table with `[validFrom, validTo)` intervals supports this directly, while reconstructing state from an audit log would be expensive and fragile.

### 6. Express for Phase 1 API
**Decision:** Use a lightweight Express server rather than initializing Next.js from day one.
**Why:** Phase 1 only needs API endpoints. Express gives us a working API in minutes without the overhead of a full React framework. The API will be refactored into Next.js API routes in Phase 7 when the frontend is built.

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

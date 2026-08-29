/**
 * Reset the database: drop all data and re-seed.
 */

import { db, sql } from "./connection";
import * as schema from "./schema/index";
import { sql as drizzleSql } from "drizzle-orm";

export async function reset(closeConnection = true) {
  console.log("🗑️  Resetting database...\n");

  // Drop all data in dependency order
  const tables = [
    "temporal_jobs",
    "outbox_events",
    "audit_events",
    "policy_assignments",
    "assignment_rule_versions",
    "assignment_rules",
    "group_memberships",
    "groups",
    "policies",
    "policy_categories",
    "employee_versions",
    "employees",
    "companies",
  ];

  for (const table of tables) {
    await db.execute(drizzleSql.raw(`DELETE FROM ${table}`));
    console.log(`  Cleared: ${table}`);
  }

  console.log("\n✅ Database reset complete. Run 'npm run db:seed' to re-seed.");

  if (closeConnection) {
    await sql.end();
  }
}

if (process.argv[1]?.replace(/\\/g, "/").includes("reset.ts")) {
  reset(true).catch((err) => {
    console.error("❌ Reset failed:", err);
    process.exit(1);
  });
}

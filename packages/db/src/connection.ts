/**
 * Database connection using postgres.js driver + Drizzle ORM.
 *
 * postgres.js is chosen over pg/node-postgres because it:
 * - Has better TypeScript support
 * - Is faster (pipelining, binary protocol)
 * - Has simpler connection pooling
 * - Works well with Drizzle
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://warp:warp_local@127.0.0.1:5433/warp_dev";

/**
 * Raw postgres.js client.
 * Used for migrations and raw queries when needed.
 */
export const sql = postgres(connectionString);

/**
 * Drizzle ORM instance with full schema.
 * This is the primary database interface for the application.
 */
export const db = drizzle(sql, { schema });

export type Database = typeof db;

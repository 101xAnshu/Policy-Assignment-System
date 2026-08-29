import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://warp:warp_local@127.0.0.1:5433/warp_dev",
  },
  verbose: true,
  strict: true,
});

import { defineConfig } from "drizzle-kit";

// Migrations are hand-authored SQL under db/migrations/ (RULE-D01/D02: forward-only,
// reviewed). `drizzle-kit generate` here is a local authoring aid only — its output is
// never applied directly, only used as a diff/reference before writing the real file.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/infra/db/schema/index.ts",
  out: "./db/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/betting_dev",
  },
});

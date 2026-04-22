import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src-new/db/schema.ts",
  out: "./src-new/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/theoria",
  },
  strict: true,
  verbose: true,
});

/**
 * Run pending Drizzle migrations on startup.
 * Safe to call multiple times — migration runner is idempotent.
 */

import { migrate } from "drizzle-orm/postgres-js/migrator";
import path from "path";
import { fileURLToPath } from "url";
import { getDb } from "./connection.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations(): Promise<void> {
  const db = getDb();
  if (!db) return;
  const migrationsFolder = path.resolve(__dirname, "./migrations");
  await migrate(db, { migrationsFolder });
}

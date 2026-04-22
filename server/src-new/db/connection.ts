/**
 * PostgreSQL / TimescaleDB connection.
 *
 * Exposed as a singleton created lazily on first call to `getDb()`.
 * When no DATABASE_URL is configured, `getDb()` returns null so callers can
 * fall back to the in-memory store.
 */

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { schema } from "./schema.js";

export type Db = PostgresJsDatabase<typeof schema>;

let _sql: ReturnType<typeof postgres> | null = null;
let _db: Db | null = null;

export function getSql(): ReturnType<typeof postgres> | null {
  if (_sql) return _sql;
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  _sql = postgres(url, {
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idle_timeout: 30,
    connect_timeout: 10,
    prepare: true,
    onnotice: () => {},
  });
  return _sql;
}

export function getDb(): Db | null {
  if (_db) return _db;
  const sql = getSql();
  if (!sql) return null;
  _db = drizzle(sql, { schema });
  return _db;
}

export async function closeDb(): Promise<void> {
  if (_sql) {
    await _sql.end({ timeout: 5 });
    _sql = null;
    _db = null;
  }
}

/**
 * Quick connectivity check — returns true if the database answered within
 * `timeoutMs`. Does NOT throw.
 */
export async function ping(timeoutMs = 3_000): Promise<boolean> {
  const sql = getSql();
  if (!sql) return false;
  try {
    const result = await Promise.race([
      sql`SELECT 1 AS ok`,
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error("db ping timeout")), timeoutMs),
      ),
    ]);
    return Array.isArray(result) && result.length > 0;
  } catch {
    return false;
  }
}

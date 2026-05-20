import "server-only";

import type { Pool, QueryResultRow } from "pg";

let pool: Pool | null = null;

async function getDbPool(): Promise<Pool | null> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return null;
  }
  if (!pool) {
    try {
      const { Pool: PgPool } = await import(/* webpackIgnore: true */ "pg");
      pool = new PgPool({ connectionString: databaseUrl });
    } catch (error) {
      console.error(
        "PostgreSQL client unavailable. Install with: npm install pg",
        error,
      );
      return null;
    }
  }
  return pool;
}

export async function queryRows<T extends QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const db = await getDbPool();
  if (!db) {
    return [];
  }
  const result = await db.query<T>(sql, params);
  return result.rows;
}

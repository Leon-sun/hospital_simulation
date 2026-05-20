import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Pool, PoolClient, QueryResultRow } from "pg";
import { Pool as PgPool } from "pg";

const scriptDir = dirname(fileURLToPath(import.meta.url));
export const projectRoot = join(scriptDir, "..", "..");

export function requireDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is missing. Set it in .env.local (see .env.example).",
    );
  }
  return databaseUrl;
}

export function createPool(): Pool {
  return new PgPool({
    connectionString: requireDatabaseUrl(),
  });
}

export async function withTransaction<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function queryRows<T extends QueryResultRow>(
  client: PoolClient,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await client.query<T>(sql, params);
  return result.rows;
}

export function readProjectFile(relativePath: string): string {
  return readFileSync(join(projectRoot, relativePath), "utf8");
}

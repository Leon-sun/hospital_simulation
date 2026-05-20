/**
 * Seeds PostgreSQL from the existing hospital mock SQL (no new generators).
 *
 * Mock data source: hospital_event_scheduling_seed.sql
 *   - TRUNCATE + INSERT for dimensions, pathways, transitions, and 2000 synthetic cases
 *   - Uses SELECT setseed(0.4242) for deterministic rows (same as the SQL seed file)
 *
 * In-memory TS mocks (dashboard-case-source, simulation-engine, etc.) mirror this SQL
 * but are not re-inserted here; the SQL seed is the relational source of truth.
 */
import { createPool, withTransaction } from "./lib/db-utils.js";
import { executeSqlText, loadSeedSql } from "./lib/sql-file.js";

async function main() {
  const pool = createPool();

  try {
    await withTransaction(pool, async (client) => {
      const seedSql = loadSeedSql();
      const executed = await executeSqlText(client, seedSql, {
        skipSelect: true,
        skipTransactionControl: true,
        allowSetseed: true,
      });

      console.log(
        [
          "Seeded PostgreSQL from hospital_event_scheduling_seed.sql.",
          `  Executed ${executed} SQL statements (INSERT/TRUNCATE/UPDATE/temp tables).`,
          "  Skipped validation SELECT statements (run npm run db:validate).",
        ].join("\n"),
      );
    });
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

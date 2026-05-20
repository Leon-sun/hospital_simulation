/**
 * Creates PostgreSQL tables, indexes, and dashboard/forecast views from existing project SQL.
 *
 * Mock data source (schema only): hospital_event_scheduling_demo.sql (DDL through indexes)
 * Views: sql/hospital_forecast_views.sql, dashboard_kpi_views.sql
 */
import { join } from "node:path";

import { createPool, projectRoot, withTransaction } from "./lib/db-utils.js";
import { executeSqlFile, executeSqlText, loadSchemaSql } from "./lib/sql-file.js";

async function main() {
  const pool = createPool();

  try {
    await withTransaction(pool, async (client) => {
      const schemaSql = loadSchemaSql();
      const schemaStatements = await executeSqlText(client, schemaSql, {
        skipSelect: true,
        skipTransactionControl: true,
        reorderCreateTables: true,
      });

      const forecastStatements = await executeSqlFile(
        client,
        join(projectRoot, "sql/hospital_forecast_views.sql"),
        { skipSelect: true, skipTransactionControl: true },
      );

      const dashboardViewStatements = await executeSqlFile(
        client,
        join(projectRoot, "dashboard_kpi_views.sql"),
        { skipSelect: true, skipTransactionControl: true },
      );

      console.log(
        [
          "Schema created from existing mock SQL definitions.",
          `  DDL/index statements: ${schemaStatements}`,
          `  Forecast view statements: ${forecastStatements}`,
          `  Dashboard KPI view statements: ${dashboardViewStatements}`,
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

/**
 * Validates row counts and sample records after seeding existing mock SQL data.
 */
import { createPool, queryRows, withTransaction } from "./lib/db-utils.js";

type SampleRow = Record<string, unknown>;

const EXPECTED: Record<string, { exact?: number; min?: number }> = {
  '"DimPathway"': { exact: 10 },
  '"DimEntryPoint"': { exact: 4 },
  '"FactCase"': { exact: 2000 },
  '"FactSchedulingEvent"': { exact: 2000 },
  '"FactHospitalEvent"': { min: 4000 },
  '"FactPathwayTransition"': { min: 50 },
  '"FactCalendarSlot"': { min: 500 },
};

async function main() {
  const pool = createPool();

  try {
    await withTransaction(pool, async (client) => {
      console.log("\n=== Row counts ===");
      let failures = 0;
      for (const [quotedName, rule] of Object.entries(EXPECTED)) {
        const tableName = quotedName.replaceAll('"', "");
        const countResult = await queryRows<{ row_count: string }>(
          client,
          `SELECT COUNT(*)::text AS row_count FROM ${quotedName}`,
        );
        const count = Number(countResult[0]?.row_count ?? 0);
        const ok =
          (rule.exact !== undefined && count === rule.exact) ||
          (rule.min !== undefined && count >= rule.min) ||
          (rule.exact === undefined && rule.min === undefined);

        const expectation =
          rule.exact !== undefined ? `exactly ${rule.exact}` : `at least ${rule.min}`;
        const status = ok ? "OK" : "FAIL";
        console.log(`  [${status}] ${tableName}: ${count} (expected ${expectation})`);
        if (!ok) failures += 1;
      }

      const priorityMix = await queryRows<{ priority: string; row_count: string }>(
        client,
        `
        SELECT priority, COUNT(*)::text AS row_count
        FROM "FactSchedulingEvent"
        GROUP BY priority
        ORDER BY priority
        `,
      );

      console.log("\n=== Scheduling priority mix (sample) ===");
      for (const row of priorityMix) {
        console.log(`  ${row.priority}: ${row.row_count}`);
      }

      const eventTypes = await queryRows<{ event_type: string; row_count: string }>(
        client,
        `
        SELECT event_type, COUNT(*)::text AS row_count
        FROM "FactHospitalEvent"
        GROUP BY event_type
        ORDER BY event_type
        `,
      );

      console.log("\n=== Hospital event types ===");
      for (const row of eventTypes) {
        console.log(`  ${row.event_type}: ${row.row_count}`);
      }

      const samples: Array<{ title: string; sql: string }> = [
        {
          title: "DimEntryPoint",
          sql: `SELECT entry_point_name, description FROM "DimEntryPoint" ORDER BY entry_point_name LIMIT 5`,
        },
        {
          title: "FactCase",
          sql: `SELECT case_id, priority_general, priority_detail, created_at
                FROM "FactCase" ORDER BY created_at LIMIT 5`,
        },
        {
          title: "FactSchedulingEvent",
          sql: `SELECT event_id, specialty, priority, status, event_category
                FROM "FactSchedulingEvent" ORDER BY created_at LIMIT 5`,
        },
        {
          title: "FactHospitalEvent",
          sql: `SELECT hospital_event_id, case_id, event_type, specialty, status, start_datetime
                FROM "FactHospitalEvent" ORDER BY start_datetime LIMIT 5`,
        },
      ];

      console.log("\n=== Sample records ===");
      for (const sample of samples) {
        const rows = await queryRows<SampleRow>(client, sample.sql);
        console.log(`\n${sample.title} (${rows.length} rows shown):`);
        console.table(rows);
      }

      const forecastChecks = await queryRows<{ check_name: string; check_value: string }>(
        client,
        `
        SELECT 'vw_entry_point_arrival_rate_4w' AS check_name, COUNT(*)::text AS check_value
        FROM vw_entry_point_arrival_rate_4w
        UNION ALL
        SELECT 'vw_forecast_pathway_events_next_week', COUNT(*)::text
        FROM vw_forecast_pathway_events_next_week
        UNION ALL
        SELECT 'vw_next_week_event_demand_summary', COUNT(*)::text
        FROM vw_next_week_event_demand_summary
        `,
      );

      console.log("\n=== Forecast views ===");
      for (const row of forecastChecks) {
        const count = Number(row.check_value);
        const ok = count > 0;
        console.log(`  [${ok ? "OK" : "FAIL"}] ${row.check_name}: ${row.check_value}`);
        if (!ok) failures += 1;
      }

      if (failures > 0) {
        throw new Error(`Validation failed with ${failures} check(s).`);
      }

      console.log("\nAll validation checks passed.");
    });
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

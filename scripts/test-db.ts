import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is missing. Check .env.local.");
}

const pool = new Pool({
  connectionString: databaseUrl,
});

async function main() {
  const result = await pool.query("SELECT NOW() as now");
  console.log(result.rows);
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
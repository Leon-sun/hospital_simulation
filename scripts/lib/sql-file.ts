import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { PoolClient } from "pg";

import { projectRoot } from "./db-utils.js";

export type ExecuteSqlOptions = {
  /** Skip SELECT statements (validation / sanity checks). */
  skipSelect?: boolean;
  /** Skip transaction control emitted inside SQL files. */
  skipTransactionControl?: boolean;
  /** Allow SELECT setseed(...) for deterministic mock generation. */
  allowSetseed?: boolean;
  /** Run CREATE TABLE statements in FK-safe order (hospital_event_scheduling_demo.sql). */
  reorderCreateTables?: boolean;
};

/** FK-safe order from hospital_event_scheduling_demo.sql (FactCase references DimPathway). */
const SCHEMA_TABLE_CREATE_ORDER = [
  "DimPathway",
  "DimEntryPoint",
  "FactHospitalEvent",
  "FactCase",
  "FactEntryPointPathwayProbability",
  "FactPathwayTransition",
  "DimEventLabel",
  "FactSchedulingEvent",
  "BridgeEventLabel",
  "DimOutpatientDurationRule",
  "FactHistoricalEventDuration",
  "DimSurgeryDurationDistribution",
  "DimSchedulingRule",
  "FactOutpatientCapacity",
  "FactSurgeryCapacity",
  "FactCalendarSlot",
] as const;

const SCHEMA_DATA_MARKER = 'INSERT INTO "DimPathway"';

/** Existing mock DDL + indexes from hospital_event_scheduling_demo.sql (no generated case rows). */
export function loadSchemaSql(): string {
  const demoSql = readFileSync(
    join(projectRoot, "hospital_event_scheduling_demo.sql"),
    "utf8",
  );
  const markerIndex = demoSql.indexOf(SCHEMA_DATA_MARKER);
  if (markerIndex < 0) {
    throw new Error(
      `Could not find schema/data boundary marker (${SCHEMA_DATA_MARKER}) in hospital_event_scheduling_demo.sql`,
    );
  }
  return demoSql.slice(0, markerIndex);
}

/** Existing mock insert/seed SQL (2000-case hospital simulation). */
export function loadSeedSql(): string {
  return readFileSync(
    join(projectRoot, "hospital_event_scheduling_seed.sql"),
    "utf8",
  );
}

export function expandIrDirectives(sql: string, baseDir: string = projectRoot): string {
  return sql.replace(/^\\ir\s+(.+)\s*$/gm, (_, relativePath: string) => {
    const resolved = join(baseDir, relativePath.trim());
    return readFileSync(resolved, "utf8");
  });
}

/**
 * Split SQL on semicolons outside quotes and dollar-quoted blocks.
 */
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let buffer = "";
  let index = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let dollarTag: string | null = null;

  const append = (text: string) => {
    buffer += text;
    index += text.length;
  };

  while (index < sql.length) {
    if (!inSingleQuote && !inDoubleQuote && dollarTag === null) {
      if (sql.startsWith("--", index)) {
        const lineEnd = sql.indexOf("\n", index);
        if (lineEnd < 0) {
          break;
        }
        index = lineEnd + 1;
        continue;
      }

      if (sql.startsWith("/*", index)) {
        const blockEnd = sql.indexOf("*/", index + 2);
        if (blockEnd < 0) {
          break;
        }
        index = blockEnd + 2;
        continue;
      }
    }

    if (dollarTag !== null) {
      const closing = `$${dollarTag}$`;
      if (sql.startsWith(closing, index)) {
        append(closing);
        dollarTag = null;
        continue;
      }
      append(sql[index]);
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote && sql[index] === "$") {
      const rest = sql.slice(index);
      const match = rest.match(/^\$([A-Za-z0-9_]*)\$/);
      if (match) {
        dollarTag = match[1];
        append(match[0]);
        continue;
      }
    }

    const char = sql[index];

    if (!inDoubleQuote && char === "'") {
      const next = sql[index + 1];
      if (inSingleQuote && next === "'") {
        append("''");
        continue;
      }
      inSingleQuote = !inSingleQuote;
      append(char);
      continue;
    }

    if (!inSingleQuote && char === '"') {
      inDoubleQuote = !inDoubleQuote;
      append(char);
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote && char === ";") {
      const trimmed = buffer.trim();
      if (trimmed.length > 0) {
        statements.push(trimmed);
      }
      buffer = "";
      index += 1;
      continue;
    }

    append(char);
  }

  const trailing = buffer.trim();
  if (trailing.length > 0) {
    statements.push(trailing);
  }

  return statements;
}

function stripLineComments(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !/^\s*--/.test(line))
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .trim();
}

function shouldSkipStatement(statement: string, options: ExecuteSqlOptions): boolean {
  const normalized = stripLineComments(statement).replace(/\s+/g, " ").trim();
  if (!normalized) return true;

  if (options.skipTransactionControl) {
    if (/^BEGIN\b/i.test(normalized)) return true;
    if (/^COMMIT\b/i.test(normalized)) return true;
    if (/^ROLLBACK\b/i.test(normalized)) return true;
  }

  if (/^SELECT\b/i.test(normalized)) {
    if (options.allowSetseed && /^SELECT\s+setseed\s*\(/i.test(normalized)) {
      return false;
    }
    if (options.skipSelect) return true;
  }

  return false;
}

function extractCreateTableName(statement: string): string | null {
  const normalized = stripLineComments(statement).replace(/\s+/g, " ").trim();
  const match = normalized.match(/^CREATE TABLE\s+"([^"]+)"/i);
  return match?.[1] ?? null;
}

export function reorderSchemaStatements(statements: string[]): string[] {
  const dropTables: string[] = [];
  const createTables = new Map<string, string>();
  const createIndexes: string[] = [];
  const preamble: string[] = [];
  const remainder: string[] = [];

  for (const statement of statements) {
    const normalized = stripLineComments(statement).replace(/\s+/g, " ").trim();
    if (!normalized) continue;

    if (/^DROP TABLE/i.test(normalized)) {
      dropTables.push(statement);
      continue;
    }

    const tableName = extractCreateTableName(statement);
    if (tableName) {
      createTables.set(tableName, statement);
      continue;
    }

    if (/^CREATE INDEX/i.test(normalized)) {
      createIndexes.push(statement);
      continue;
    }

    if (/^CREATE EXTENSION/i.test(normalized)) {
      preamble.push(statement);
      continue;
    }

    remainder.push(statement);
  }

  const orderedCreates: string[] = [];
  for (const tableName of SCHEMA_TABLE_CREATE_ORDER) {
    const statement = createTables.get(tableName);
    if (statement) {
      orderedCreates.push(statement);
      createTables.delete(tableName);
    }
  }

  for (const statement of createTables.values()) {
    orderedCreates.push(statement);
  }

  return [...dropTables, ...preamble, ...orderedCreates, ...createIndexes, ...remainder];
}

export async function executeSqlText(
  client: PoolClient,
  sql: string,
  options: ExecuteSqlOptions = {},
): Promise<number> {
  const expanded = expandIrDirectives(sql);
  let statements = splitSqlStatements(expanded);
  if (options.reorderCreateTables) {
    statements = reorderSchemaStatements(statements);
  }
  let executed = 0;

  for (const statement of statements) {
    if (shouldSkipStatement(statement, options)) continue;
    try {
      await client.query(statement);
    } catch (error) {
      const preview = stripLineComments(statement).replace(/\s+/g, " ").trim().slice(0, 240);
      throw new Error(
        `SQL execution failed (${preview}): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    executed += 1;
  }

  return executed;
}

export async function executeSqlFile(
  client: PoolClient,
  absolutePath: string,
  options: ExecuteSqlOptions = {},
): Promise<number> {
  const sql = readFileSync(absolutePath, "utf8");
  return executeSqlText(client, sql, options);
}

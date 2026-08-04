import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectionDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "sql",
  "ranking-projections",
);

function statements(sql) {
  return sql.split(/;\s*(?:\n|$)/).map((statement) => statement.trim()).filter(Boolean);
}

function splitClauses(sql) {
  const clauses = [];
  let start = 0;
  let depth = 0;
  let quote = null;
  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index];
    if (quote) {
      if (character === quote) {
        if (sql[index + 1] === quote && quote !== "`") index += 1;
        else quote = null;
      } else if (character === "\\" && quote !== "`") {
        index += 1;
      }
      continue;
    }
    if (character === "'" || character === '"' || character === "`") {
      quote = character;
      continue;
    }
    if (character === "(") depth += 1;
    else if (character === ")") depth -= 1;
    else if (character === "," && depth === 0) {
      clauses.push(sql.slice(start, index).trim());
      start = index + 1;
    }
  }
  clauses.push(sql.slice(start).trim());
  return clauses.filter(Boolean);
}

function alterTable(statement) {
  const match = statement.match(
    /^([\s\S]*?\bALTER\s+TABLE\s+`?([A-Za-z0-9_]+)`?\s+)([\s\S]*)$/i,
  );
  if (!match) return null;
  return { prefix: match[1], table: match[2], clauses: splitClauses(match[3]) };
}

function secondaryIndex(clause) {
  const normalized = clause.replace(/^(?:\s*--[^\n]*(?:\n|$))+/, "").trim();
  const match = normalized.match(
    /^ADD\s+(UNIQUE\s+)?INDEX\s+`?([A-Za-z0-9_]+)`?\s*(\([\s\S]+\))$/i,
  );
  if (!match) return null;
  return {
    name: match[2],
    sql: `ADD ${match[1] ? "UNIQUE " : ""}INDEX \`${match[2]}\` ${match[3]}`,
  };
}

export function extractSecondaryIndexes(statement, expectedTable) {
  const alter = alterTable(statement);
  if (!alter || alter.table !== expectedTable) return [];
  return alter.clauses.map(secondaryIndex).filter(Boolean);
}

export function deferSecondaryIndexes(statement, tableNames) {
  const alter = alterTable(statement);
  if (!alter || !tableNames.has(alter.table)) return statement;
  const retained = alter.clauses.filter((clause) => !secondaryIndex(clause));
  if (retained.length === alter.clauses.length) return statement;
  return retained.length > 0 ? `${alter.prefix}${retained.join(",\n")}` : null;
}

export async function projectionIndexesForGroup(group) {
  const indexes = [];
  const seen = new Set();
  for (const source of group.indexSources ?? []) {
    const sql = await readFile(join(projectionDirectory, source.file), "utf8");
    const sourceTable = source.sourceTable ?? source.table;
    const extracted = statements(sql).flatMap((statement) =>
      extractSecondaryIndexes(statement, sourceTable));
    if (extracted.length === 0) {
      throw new Error(`No secondary indexes found for ${source.table} in ${source.file}`);
    }
    for (const index of extracted) {
      const key = `${source.table}.${index.name}`;
      if (seen.has(key)) throw new Error(`Duplicate projection index definition: ${key}`);
      seen.add(key);
      indexes.push({ table: source.table, ...index });
    }
  }
  return indexes;
}

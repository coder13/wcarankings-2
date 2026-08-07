import type { Connection } from "mysql2/promise";
import { argumentList } from "../../lib/arguments.ts";
import { databaseOptions } from "../../lib/database.ts";
import { projectionSql, statements } from "../../../data-tools/projections/build/sql.ts";

const TABLES = [
  "person_year_ranking_cohorts",
  "person_year_rankings_single",
  "person_year_rankings_average",
] as const;
const SUFFIX = "_dirty";

export function quoteYears(years: readonly number[]): string {
  if (years.length === 0 || years.some((year) => !Number.isInteger(year) || year < 1)) {
    throw new Error("At least one valid ranking year is required");
  }
  return years.join(",");
}

export function dirtySql(sql: string, years: readonly number[]): string {
  const renamed = [...TABLES]
    .sort((left, right) => right.length - left.length)
    .reduce((value, table) => value.replaceAll(table, `${table}${SUFFIX}`), sql);
  return renamed.replaceAll("period_year > 0", `period_year IN (${quoteYears(years)})`);
}

async function execute(connection: Connection, sql: string): Promise<void> {
  for (const statement of statements(sql)) await connection.query(statement);
}

async function main(): Promise<void> {
  const years = argumentList("years").map(Number).sort((left, right) => left - right);
  quoteYears(years);
  const mysql = await import("mysql2/promise");
  const { databaseOptions } = await import("../../lib/database.ts");
  const connection = await mysql.createConnection(databaseOptions());
  try {
    await connection.query("SET SESSION max_statement_time = 0");
    for (const table of TABLES) await connection.query(`DROP TABLE IF EXISTS \`${table}${SUFFIX}\``);
    const cohortSql = await projectionSql("people/year-rankings/person_year_ranking_cohorts.sql");
    const singleSql = await projectionSql("people/year-rankings/person_year_rankings_single.sql");
    const averageSql = await projectionSql("people/year-rankings/person_year_rankings_average.sql");
    await execute(connection, dirtySql(cohortSql, years));
    await execute(connection, dirtySql(singleSql, years));
    await execute(connection, dirtySql(averageSql, years));
    await connection.beginTransaction();
    try {
      const yearList = quoteYears(years);
      for (const table of TABLES.slice(1)) {
        await connection.query(`DELETE FROM \`${table}\` WHERE year IN (${yearList})`);
        await connection.query(`INSERT INTO \`${table}\` SELECT * FROM \`${table}${SUFFIX}\``);
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    }
    for (const table of TABLES) await connection.query(`DROP TABLE IF EXISTS \`${table}${SUFFIX}\``);
  } finally {
    await connection.end();
  }
}

if (import.meta.main) await main();

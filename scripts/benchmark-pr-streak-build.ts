#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { statements } from "../data-tools/projections/build/sql.ts";
import { databaseOptions } from "./lib/database.ts";

const BUILD_TARGET_MS = 10 * 60 * 1_000;
const SCROLL_TARGET_MS = 2_500;
const DEFAULT_OUTPUT = "/tmp/pr-streak-build-benchmark.json";
const OUTPUT_TABLES = [
  "person_pr_streak_counts",
  "person_pr_streak_year_counts",
  "person_pr_streak_rankings",
  "person_pr_streak_ranking_counts",
] as const;

function argument(name: string) {
  const prefix = `--${name}=`;
  return process.argv
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length);
}

function percentile(values: number[], fraction: number) {
  const sorted = [...values].sort((left, right) => left - right);
  return (
    sorted[
      Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)
    ] ?? 0
  );
}

function elapsed(startedAt: number) {
  return Math.round((performance.now() - startedAt) * 100) / 100;
}

function temporaryOutputSql(sql: string) {
  return sql.replace(
    /^CREATE TABLE (person_pr_streak_(?:counts|year_counts|rankings|ranking_counts))\b/gm,
    "CREATE TEMPORARY TABLE $1",
  );
}

async function timedQuery(
  connection: mysql.Connection,
  sql: string,
  values: readonly unknown[] = [],
) {
  const startedAt = performance.now();
  const [rows] = await connection.query<RowDataPacket[]>(sql, [...values]);
  return { durationMs: elapsed(startedAt), rows };
}

async function scrollBenchmark(connection: mysql.Connection) {
  const scenarios = [
    {
      id: "world-all-eager",
      values: ["world", "", "all"],
      rowsSql: `
        SELECT person_id, pr_streak, rank, position
        FROM person_pr_streak_rankings
        WHERE scope = ? AND region_id = ? AND gender = ?
          AND position >= ? AND position < ?
        ORDER BY position, person_id
      `,
      countSql: `
        SELECT count
        FROM person_pr_streak_ranking_counts
        WHERE scope = ? AND region_id = ? AND gender = ?
      `,
    },
    {
      id: "world-f-o-2023-lazy",
      values: [2023, "f", "o"],
      rowsSql: `
        WITH filtered AS (
          SELECT person_id, pr_streak
          FROM person_pr_streak_year_counts
          WHERE year = ? AND person_gender IN (?, ?) AND pr_streak >= 2
        ), ranked AS (
          SELECT filtered.*,
            RANK() OVER (ORDER BY pr_streak DESC) AS rank,
            ROW_NUMBER() OVER (ORDER BY pr_streak DESC, person_id) AS position
          FROM filtered
        )
        SELECT person_id, pr_streak, rank, position
        FROM ranked
        WHERE position >= ? AND position < ?
        ORDER BY position, person_id
      `,
      countSql: `
        SELECT COUNT(*) AS count
        FROM person_pr_streak_year_counts
        WHERE year = ? AND person_gender IN (?, ?) AND pr_streak >= 2
      `,
    },
  ] as const;

  const reports = [];
  for (const scenario of scenarios) {
    const pageDurations: number[] = [];
    let rows = 0;
    for (let page = 0; page < 20; page += 1) {
      const start = page * 50 + 1;
      const pageResult = await timedQuery(connection, scenario.rowsSql, [
        ...scenario.values,
        start,
        start + 50,
      ]);
      const countResult = await timedQuery(
        connection,
        scenario.countSql,
        scenario.values,
      );
      rows += pageResult.rows.length;
      pageDurations.push(pageResult.durationMs + countResult.durationMs);
    }
    reports.push({
      id: scenario.id,
      pages: pageDurations.length,
      rows,
      medianMs: percentile(pageDurations, 0.5),
      p95Ms: percentile(pageDurations, 0.95),
      maxMs: Math.max(...pageDurations),
      targetMs: SCROLL_TARGET_MS,
      passes: percentile(pageDurations, 0.95) < SCROLL_TARGET_MS,
    });
  }
  return reports;
}

async function explainPlans(connection: mysql.Connection) {
  const plans = {
    sourceAggregation: `
      SELECT person_id, event_id, competition_id, competition_start_date,
        YEAR(competition_start_date) AS competition_year,
        MIN(CASE WHEN best > 0 THEN best END) AS best_single,
        MIN(CASE WHEN average > 0 THEN average END) AS best_average
      FROM result_facts
      WHERE best > 0 OR average > 0
      GROUP BY person_id, event_id, competition_id, competition_start_date
    `,
    eagerPage: `
      SELECT person_id, pr_streak, rank, position
      FROM person_pr_streak_rankings
      WHERE scope = 'world' AND region_id = '' AND gender = 'all'
        AND position >= 1 AND position < 51
      ORDER BY position, person_id
    `,
    lazyYearGenderPage: `
      WITH filtered AS (
        SELECT person_id, pr_streak
        FROM person_pr_streak_year_counts
        WHERE year = 2023 AND person_gender IN ('f', 'o') AND pr_streak >= 2
      ), ranked AS (
        SELECT filtered.*,
          RANK() OVER (ORDER BY pr_streak DESC) AS rank,
          ROW_NUMBER() OVER (ORDER BY pr_streak DESC, person_id) AS position
        FROM filtered
      )
      SELECT person_id, pr_streak, rank, position
      FROM ranked
      WHERE position >= 1 AND position < 51
      ORDER BY position, person_id
    `,
  };
  return Object.fromEntries(
    await Promise.all(
      Object.entries(plans).map(async ([name, sql]) => {
        const [rows] = await connection.query<RowDataPacket[]>(
          `EXPLAIN FORMAT=JSON ${sql}`,
        );
        const raw = String(rows[0]?.EXPLAIN ?? "{}");
        return [name, JSON.parse(raw)] as const;
      }),
    ),
  );
}

async function main() {
  const output = resolve(argument("output") ?? DEFAULT_OUTPUT);
  const sqlPath = resolve(
    "data-tools/projection-catalog/people/pr-streak-rankings/person_pr_streak_rankings.sql",
  );
  const sql = temporaryOutputSql(await readFile(sqlPath, "utf8"));
  const connection = await mysql.createConnection(databaseOptions());
  const phaseTimings: { phase: string; durationMs: number }[] = [];
  let activePhase = "initializing";
  const buildStartedAt = performance.now();
  const heartbeat = setInterval(() => {
    console.log(
      `[pr-streak-build] elapsed=${elapsed(buildStartedAt)}ms phase=${activePhase}`,
    );
  }, 30_000);

  try {
    for (const statement of statements(sql)) {
      activePhase =
        statement.match(/^\s*-- phase:\s*([^\n]+)/)?.[1]?.trim() ??
        "unlabeled statement";
      const startedAt = performance.now();
      await connection.query(statement);
      const durationMs = elapsed(startedAt);
      phaseTimings.push({ phase: activePhase, durationMs });
      console.log(`[pr-streak-build] ${activePhase}: ${durationMs}ms`);
    }

    activePhase = "measuring output tables";
    const rowCounts: Record<string, number> = {};
    for (const table of OUTPUT_TABLES) {
      const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS count FROM \`${table}\``,
      );
      rowCounts[table] = Number(rows[0]?.count ?? 0);
    }
    const [topRankings] = await connection.query<RowDataPacket[]>(`
      SELECT
        ranking.rank,
        ranking.position,
        ranking.person_id AS personId,
        person.name AS personName,
        ranking.pr_streak AS prStreak
      FROM person_pr_streak_rankings ranking
      INNER JOIN persons person
        ON person.wca_id = ranking.person_id AND person.sub_id = 1
      WHERE ranking.scope = 'world'
        AND ranking.region_id = ''
        AND ranking.gender = 'all'
      ORDER BY ranking.position
      LIMIT 100
    `);
    const [metadata] = await connection.query<RowDataPacket[]>(
      "SELECT `key`, value FROM export_metadata WHERE `key` IN ('export_date', 'fetched_at')",
    );
    const scroll = await scrollBenchmark(connection);
    const plans = await explainPlans(connection);
    const buildDurationMs = elapsed(buildStartedAt);
    const warnings = [
      ...(buildDurationMs > BUILD_TARGET_MS
        ? [`Build exceeded the 10-minute target (${buildDurationMs}ms).`]
        : []),
      ...scroll
        .filter(({ passes }) => !passes)
        .map(
          ({ id, p95Ms }) =>
            `${id} exceeded the 2.5-second p95 target (${p95Ms}ms).`,
        ),
    ];
    const [versionRows] = await connection.query<RowDataPacket[]>(
      "SELECT VERSION() AS version",
    );
    const report = {
      generatedAt: new Date().toISOString(),
      safety:
        "All PR Streak build outputs were TEMPORARY tables in one session; persistent raw and projection tables were not modified.",
      databaseVersion: String(versionRows[0]?.version ?? "unknown"),
      targets: { buildMs: BUILD_TARGET_MS, scrollP95Ms: SCROLL_TARGET_MS },
      buildDurationMs,
      buildPasses: buildDurationMs <= BUILD_TARGET_MS,
      rowCounts,
      exportMetadata: Object.fromEntries(
        metadata.map((row) => [String(row.key), String(row.value)]),
      ),
      topRankings,
      phaseTimings,
      scroll,
      explainPlans: plans,
      warnings,
    };
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`[pr-streak-build] report=${output}`);
    if (warnings.length) {
      for (const warning of warnings)
        console.warn(`[pr-streak-build] WARNING: ${warning}`);
      process.exitCode = 1;
    }
  } finally {
    clearInterval(heartbeat);
    await connection.end();
  }
}

await main();

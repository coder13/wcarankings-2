#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { databaseOptions } from "./lib/database.mjs";

const DEFAULT_SUB_X = 10;
const DEFAULT_REPETITIONS = 1;
const TEMP_TABLE_PREFIX = "stat_experiment_";

export const PROPOSED_STATS = [
  {
    key: "medal-collection",
    sourceTables: ["competition_podium_members"],
    sourceIndexes: ["PRIMARY", "idx_comp_podium_members_person"],
    status: "supported",
    timing: "materialize",
    notes:
      "The active podium-member projection has one row per medal and a person-first lookup index.",
  },
  {
    key: "most-solves-competition-year",
    sourceTables: ["result_facts", "result_attempts"],
    sourceIndexes: ["PRIMARY", "idx_result_attempts_result"],
    status: "partial",
    timing: "attempt-shared-vs-separate",
    notes:
      "Attempt values are available, but the daily schema has no published solve-grain table.",
  },
  {
    key: "rank-events-per-person",
    sourceTables: ["person_event_rankings"],
    sourceIndexes: ["PRIMARY"],
    status: "supported",
    timing: "materialize",
    notes:
      "The person-first primary key supports event coverage aggregation without scanning raw results.",
  },
  {
    key: "oldest-standing-world-records",
    sourceTables: ["result_facts"],
    sourceIndexes: ["PRIMARY"],
    status: "partial",
    timing: "historical-shared-vs-direct",
    notes:
      "Record codes and dates exist, but there is no record-period or standing-record index.",
  },
  {
    key: "records-in-most-events",
    sourceTables: ["result_facts"],
    sourceIndexes: ["PRIMARY"],
    status: "partial",
    timing: "historical-shared-vs-direct",
    notes:
      "World-record codes can be counted, but a record-code access path is not materialized.",
  },
  {
    key: "blindfolded-success-rate-streaks",
    sourceTables: ["result_facts", "result_attempts"],
    sourceIndexes: ["PRIMARY", "idx_result_attempts_result"],
    status: "partial",
    timing: "attempt-shared-vs-separate",
    notes:
      "Attempt values include successes and DNFs; streak semantics still need a product definition.",
  },
  {
    key: "most-sub-x-solves",
    sourceTables: ["result_facts", "result_attempts"],
    sourceIndexes: ["PRIMARY", "idx_result_attempts_result"],
    status: "partial",
    timing: "attempt-shared-vs-separate",
    notes:
      "A thresholded solve count is computable, but Sub-X needs an event and threshold policy.",
  },
  {
    key: "top-100-appearances",
    sourceTables: [
      "person_year_rankings_single",
      "person_year_rankings_average",
      "person_year_ranking_cohorts",
    ],
    sourceIndexes: [
      "idx_person_year_single_browse",
      "idx_person_year_average_browse",
    ],
    status: "supported",
    timing: "materialize",
    notes:
      "Year/event/cohort/position browse indexes can restrict to the top 100 before grouping by person.",
  },
  {
    key: "historical-as-of-rankings",
    sourceTables: ["result_facts"],
    sourceIndexes: [
      "idx_result_facts_single_ranking_cover",
      "idx_result_facts_average_ranking_cover",
    ],
    status: "partial",
    timing: "historical-shared-vs-direct",
    notes:
      "Current result facts cover value ordering, but each as-of date still requires a historical window rank.",
  },
];

const INVENTORY_TABLES = [
  ...new Set(PROPOSED_STATS.flatMap(({ sourceTables }) => sourceTables)),
];

function argumentValue(name, argv = process.argv) {
  const prefix = `--${name}=`;
  return (
    argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? ""
  );
}

function numericArgument(name, fallback, argv = process.argv) {
  const value = Number(argumentValue(name, argv));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function parseDates(value) {
  return value
    .split(",")
    .map((date) => date.trim())
    .filter(Boolean)
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date));
}

function identifier(name) {
  if (!/^[a-z][a-z0-9_]*$/i.test(name))
    throw new Error(`Unsafe SQL identifier: ${name}`);
  return `\`${name}\``;
}

function sqlDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new Error(`Invalid date: ${date}`);
  return `'${date}'`;
}

function elapsedMs(startedAt) {
  return Math.round(performance.now() - startedAt);
}

function planJson(rows) {
  const value =
    rows[0]?.EXPLAIN ?? rows[0]?.explain ?? Object.values(rows[0] ?? {})[0];
  if (typeof value !== "string") return value ?? null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

async function timedQuery(connection, sql, params = []) {
  const startedAt = performance.now();
  const [rows] = await connection.query(sql, params);
  return { rows, durationMs: elapsedMs(startedAt) };
}

async function explain(connection, sql, params = []) {
  const [rows] = await connection.query(`EXPLAIN FORMAT=JSON ${sql}`, params);
  return planJson(rows);
}

async function dropTempTable(connection, tableName) {
  await connection.query(
    `DROP TEMPORARY TABLE IF EXISTS ${identifier(tableName)}`,
  );
}

async function materialize(connection, tableName, sql) {
  await dropTempTable(connection, tableName);
  const startedAt = performance.now();
  await connection.query(
    `CREATE TEMPORARY TABLE ${identifier(tableName)} ENGINE = InnoDB AS ${sql}`,
  );
  const durationMs = elapsedMs(startedAt);
  const count = await timedQuery(
    connection,
    `SELECT COUNT(*) AS count FROM ${identifier(tableName)}`,
  );
  return {
    durationMs,
    rows: Number(count.rows[0]?.count ?? 0),
    countDurationMs: count.durationMs,
  };
}

async function readInventory(connection) {
  const tables = {};
  for (const tableName of INVENTORY_TABLES) {
    const [statusRows] = await connection.query(
      `SHOW TABLE STATUS LIKE '${tableName}'`,
    );
    const status = statusRows[0];
    const [columns] = status
      ? await connection.query(`SHOW COLUMNS FROM ${identifier(tableName)}`)
      : [[]];
    const [indexes] = status
      ? await connection.query(`SHOW INDEX FROM ${identifier(tableName)}`)
      : [[]];
    const groupedIndexes = {};
    for (const index of indexes) {
      groupedIndexes[index.Key_name] ??= {
        unique: index.Non_unique === 0,
        columns: [],
        cardinality: index.Cardinality,
      };
      groupedIndexes[index.Key_name].columns.push(index.Column_name);
    }
    tables[tableName] = status
      ? {
          rowsEstimate: Number(status.Rows ?? 0),
          dataBytes: Number(status.Data_length ?? 0),
          indexBytes: Number(status.Index_length ?? 0),
          engine: status.Engine,
          columns: columns.map(({ Field, Type, Null }) => ({
            name: Field,
            type: Type,
            nullable: Null === "YES",
          })),
          indexes: groupedIndexes,
        }
      : { missing: true };
  }
  return tables;
}

function directAttemptQueries(subX) {
  const source = `
    FROM result_facts facts
    STRAIGHT_JOIN result_attempts attempt ON attempt.result_id = facts.result_id
  `;
  return {
    "most-solves-competition-year": `
      SELECT facts.competition_year, facts.competition_id, facts.person_id, COUNT(*) AS solve_count
      ${source}
      WHERE attempt.value > 0
      GROUP BY facts.competition_year, facts.competition_id, facts.person_id
    `,
    "blindfolded-success-rate-streaks": `
      SELECT facts.person_id, facts.event_id,
        SUM(attempt.value > 0) AS successful_attempts,
        COUNT(*) AS attempts
      ${source}
      WHERE facts.event_id IN ('333bf', '444bf', '555bf', '333mbf')
      GROUP BY facts.person_id, facts.event_id
    `,
    "most-sub-x-solves": `
      SELECT facts.person_id, COUNT(*) AS sub_x_solves
      ${source}
      WHERE attempt.value > 0 AND attempt.value < ${subX}
      GROUP BY facts.person_id
    `,
  };
}

function sharedAttemptQueries() {
  return {
    "most-solves-competition-year": `
      SELECT competition_year, competition_id, person_id, COUNT(*) AS solve_count
      FROM ${identifier(`${TEMP_TABLE_PREFIX}attempt_facts`)}
      WHERE solve_value > 0
      GROUP BY competition_year, competition_id, person_id
    `,
    "blindfolded-success-rate-streaks": `
      SELECT person_id, event_id,
        SUM(solve_value > 0) AS successful_attempts,
        COUNT(*) AS attempts
      FROM ${identifier(`${TEMP_TABLE_PREFIX}attempt_facts`)}
      WHERE event_id IN ('333bf', '444bf', '555bf', '333mbf')
      GROUP BY person_id, event_id
    `,
    "most-sub-x-solves": `
      SELECT person_id, COUNT(*) AS sub_x_solves
      FROM ${identifier(`${TEMP_TABLE_PREFIX}attempt_facts`)}
      WHERE solve_value > 0 AND solve_value < :subX
      GROUP BY person_id
    `,
  };
}

function sharedAttemptQuery(query, subX) {
  return query.replace(":subX", String(subX));
}

const ATTEMPT_STAGE_SQL = `
  SELECT
    facts.result_id,
    facts.event_id,
    facts.person_id,
    facts.competition_id,
    facts.competition_year,
    facts.competition_start_date,
    facts.round_type_id,
    attempt.attempt_number,
    attempt.value AS solve_value
  FROM result_facts facts
  STRAIGHT_JOIN result_attempts attempt ON attempt.result_id = facts.result_id
`;

async function measureAttemptScans(connection, { repetitions, subX }) {
  const directQueries = directAttemptQueries(subX);
  const sharedQueries = sharedAttemptQueries();
  const plans = {
    stage: await explain(connection, ATTEMPT_STAGE_SQL),
    direct: {},
    shared: {},
  };
  for (const [key, query] of Object.entries(directQueries))
    plans.direct[key] = await explain(connection, query);

  const direct = [];
  for (let repetition = 1; repetition <= repetitions; repetition += 1) {
    const scans = [];
    for (const [key, query] of Object.entries(directQueries)) {
      const tableName = `${TEMP_TABLE_PREFIX}direct_${key.replaceAll("-", "_")}`;
      const materialized = await materialize(connection, tableName, query);
      scans.push({ key, ...materialized });
      await dropTempTable(connection, tableName);
    }
    direct.push({
      repetition,
      scans,
      totalMs: scans.reduce((total, scan) => total + scan.durationMs, 0),
    });
  }

  const shared = [];
  for (let repetition = 1; repetition <= repetitions; repetition += 1) {
    const stage = await materialize(
      connection,
      `${TEMP_TABLE_PREFIX}attempt_facts`,
      ATTEMPT_STAGE_SQL,
    );
    if (Object.keys(plans.shared).length === 0) {
      for (const [key, query] of Object.entries(sharedQueries))
        plans.shared[key] = await explain(
          connection,
          sharedAttemptQuery(query, subX),
        );
    }
    const consumers = [];
    for (const [key, query] of Object.entries(sharedQueries)) {
      const measured = await timedQuery(
        connection,
        `SELECT COUNT(*) AS result_count FROM (${sharedAttemptQuery(query, subX)}) consumer`,
      );
      consumers.push({
        key,
        durationMs: measured.durationMs,
        rows: Number(measured.rows[0]?.result_count ?? 0),
      });
    }
    await dropTempTable(connection, `${TEMP_TABLE_PREFIX}attempt_facts`);
    shared.push({
      repetition,
      stage,
      consumers,
      totalMs:
        stage.durationMs +
        consumers.reduce((total, consumer) => total + consumer.durationMs, 0),
    });
  }

  return {
    name: "attempt-facts-shared-vs-separate",
    source: ["result_facts", "result_attempts"],
    stageSql: ATTEMPT_STAGE_SQL,
    plans,
    direct,
    shared,
    comparison: {
      separateTotalMs: average(direct.map(({ totalMs }) => totalMs)),
      sharedTotalMs: average(shared.map(({ totalMs }) => totalMs)),
      sharedStageRows: shared[0]?.stage.rows ?? null,
    },
  };
}

async function worldCohortId(connection) {
  const [rows] = await connection.query(
    "SELECT cohort_id FROM person_year_ranking_cohorts WHERE scope = 'world' AND COALESCE(region_id, '') = '' ORDER BY cohort_id LIMIT 1",
  );
  return Number(rows[0]?.cohort_id ?? 0);
}

async function measureMaterializedAggregation(connection, definition) {
  const plan = await explain(connection, definition.sql);
  const runs = [];
  for (
    let repetition = 1;
    repetition <= definition.repetitions;
    repetition += 1
  ) {
    const materialized = await materialize(
      connection,
      `${TEMP_TABLE_PREFIX}${definition.key.replaceAll("-", "_")}`,
      definition.sql,
    );
    const consumer = await timedQuery(
      connection,
      `SELECT * FROM ${identifier(`${TEMP_TABLE_PREFIX}${definition.key.replaceAll("-", "_")}`)} ORDER BY ${definition.orderBy} LIMIT 100`,
    );
    await dropTempTable(
      connection,
      `${TEMP_TABLE_PREFIX}${definition.key.replaceAll("-", "_")}`,
    );
    runs.push({
      repetition,
      materialized,
      consumerMs: consumer.durationMs,
      consumerRows: consumer.rows.length,
      totalMs: materialized.durationMs + consumer.durationMs,
    });
  }
  return {
    name: definition.key,
    source: definition.source,
    plan,
    runs,
    averageTotalMs: average(runs.map(({ totalMs }) => totalMs)),
  };
}

function historicalStageSql() {
  return `
    SELECT result_id, event_id, person_id, competition_start_date,
      best, average, regional_single_record, regional_average_record
    FROM result_facts
    WHERE best > 0 OR average > 0
  `;
}

function historicalRecordSql(source) {
  return `
    WITH record_candidates AS (
      SELECT event_id, person_id, result_id, competition_start_date, best AS result_value
      FROM ${source}
      WHERE best > 0 AND regional_single_record = 'WR'
    ), standing_values AS (
      SELECT event_id, MIN(result_value) AS result_value
      FROM record_candidates
      GROUP BY event_id
    )
    SELECT candidates.event_id, candidates.person_id,
      MIN(candidates.competition_start_date) AS oldest_standing_date,
      COUNT(*) AS standing_claim_rows
    FROM record_candidates candidates
    INNER JOIN standing_values standing
      ON standing.event_id = candidates.event_id
      AND standing.result_value = candidates.result_value
    GROUP BY candidates.event_id, candidates.person_id
  `;
}

function recordsInMostEventsSql(source) {
  return `
    SELECT person_id, COUNT(DISTINCT event_id) AS record_event_count
    FROM ${source}
    WHERE regional_single_record = 'WR' OR regional_average_record = 'WR'
    GROUP BY person_id
  `;
}

function asOfRankingSql(source, date) {
  return `
    SELECT event_id, person_id, world_rank
    FROM (
      SELECT event_id, person_id,
        RANK() OVER (PARTITION BY event_id ORDER BY best) AS world_rank
      FROM ${source}
      WHERE best > 0 AND competition_start_date <= ${sqlDate(date)}
    ) ranked
    WHERE world_rank <= 100
  `;
}

async function historicalDates(connection, requested) {
  if (requested.length > 0) return requested;
  const [rows] = await connection.query(
    "SELECT MIN(competition_start_date) AS first_date, MAX(competition_start_date) AS last_date FROM result_facts WHERE best > 0",
  );
  const first =
    rows[0]?.first_date instanceof Date
      ? rows[0].first_date.toISOString().slice(0, 10)
      : String(rows[0]?.first_date ?? "2003-01-01").slice(0, 10);
  const last =
    rows[0]?.last_date instanceof Date
      ? rows[0].last_date.toISOString().slice(0, 10)
      : String(rows[0]?.last_date ?? "2026-01-01").slice(0, 10);
  const firstMs = Date.parse(`${first}T00:00:00Z`);
  const lastMs = Date.parse(`${last}T00:00:00Z`);
  const middle = new Date(firstMs + Math.floor((lastMs - firstMs) / 2))
    .toISOString()
    .slice(0, 10);
  return [...new Set([first, middle, last])];
}

async function measureHistorical(connection, { repetitions, dates }) {
  const stageSql = historicalStageSql();
  const directQueries = {
    records: historicalRecordSql("result_facts"),
    recordsInMostEvents: recordsInMostEventsSql("result_facts"),
  };
  const asOfQueries = Object.fromEntries(
    dates.map((date) => [date, asOfRankingSql("result_facts", date)]),
  );
  const sharedRecords = {
    records: historicalRecordSql(
      identifier(`${TEMP_TABLE_PREFIX}historical_facts`),
    ),
    recordsInMostEvents: recordsInMostEventsSql(
      identifier(`${TEMP_TABLE_PREFIX}historical_facts`),
    ),
  };
  const sharedAsOfQueries = Object.fromEntries(
    dates.map((date) => [
      date,
      asOfRankingSql(identifier(`${TEMP_TABLE_PREFIX}historical_facts`), date),
    ]),
  );
  const plans = {
    stage: await explain(connection, stageSql),
    direct: {},
    shared: {},
  };
  for (const [key, query] of Object.entries(directQueries))
    plans.direct[key] = await explain(connection, query);
  for (const [date, query] of Object.entries(asOfQueries))
    plans.direct[`as-of:${date}`] = await explain(connection, query);

  const direct = [];
  for (let repetition = 1; repetition <= repetitions; repetition += 1) {
    const scans = [];
    for (const [key, query] of Object.entries({
      ...directQueries,
      ...Object.fromEntries(
        Object.entries(asOfQueries).map(([date, sql]) => [
          `as-of:${date}`,
          sql,
        ]),
      ),
    })) {
      const tableName = `${TEMP_TABLE_PREFIX}historical_direct_${key.replaceAll(/[^a-z0-9]/gi, "_")}`;
      const measured = await materialize(connection, tableName, query);
      scans.push({ key, ...measured });
      await dropTempTable(connection, tableName);
    }
    direct.push({
      repetition,
      scans,
      totalMs: scans.reduce((total, scan) => total + scan.durationMs, 0),
    });
  }

  const shared = [];
  for (let repetition = 1; repetition <= repetitions; repetition += 1) {
    const stage = await materialize(
      connection,
      `${TEMP_TABLE_PREFIX}historical_facts`,
      stageSql,
    );
    if (Object.keys(plans.shared).length === 0) {
      for (const [key, query] of Object.entries(sharedRecords))
        plans.shared[key] = await explain(connection, query);
      for (const [date, query] of Object.entries(sharedAsOfQueries))
        plans.shared[`as-of:${date}`] = await explain(connection, query);
    }
    const consumers = [];
    for (const [key, query] of Object.entries({
      ...sharedRecords,
      ...Object.fromEntries(
        Object.entries(sharedAsOfQueries).map(([date, sql]) => [
          `as-of:${date}`,
          sql,
        ]),
      ),
    })) {
      const measured = await timedQuery(
        connection,
        `SELECT COUNT(*) AS result_count FROM (${query}) consumer`,
      );
      consumers.push({
        key,
        durationMs: measured.durationMs,
        rows: Number(measured.rows[0]?.result_count ?? 0),
      });
    }
    await dropTempTable(connection, `${TEMP_TABLE_PREFIX}historical_facts`);
    shared.push({
      repetition,
      stage,
      consumers,
      totalMs:
        stage.durationMs +
        consumers.reduce((total, consumer) => total + consumer.durationMs, 0),
    });
  }

  return {
    name: "historical-record-and-as-of-ranking-stages",
    source: ["result_facts"],
    dates,
    stageSql,
    plans,
    direct,
    shared,
    comparison: {
      separateTotalMs: average(direct.map(({ totalMs }) => totalMs)),
      sharedTotalMs: average(shared.map(({ totalMs }) => totalMs)),
      sharedStageRows: shared[0]?.stage.rows ?? null,
    },
  };
}

function average(values) {
  return values.length > 0
    ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
    : null;
}

function currentBranch() {
  try {
    return execFileSync("git", ["branch", "--show-current"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return null;
  }
}

async function main(argv = process.argv) {
  if (argv.includes("--help")) {
    process.stdout.write(
      "Usage: node scripts/benchmark-proposed-stats.mjs [--output=path] [--sub-x=10] [--repetitions=1] [--as-of=YYYY-MM-DD,...]\n",
    );
    return;
  }
  const outputPath = argumentValue("output", argv);
  const subX = numericArgument("sub-x", DEFAULT_SUB_X, argv);
  const repetitions = numericArgument("repetitions", DEFAULT_REPETITIONS, argv);
  const requestedDates = parseDates(argumentValue("as-of", argv));
  const mysql = await import("mysql2/promise");
  const connection = await mysql.default.createConnection(databaseOptions());
  try {
    process.stderr.write("[proposed-stats] collecting inventory\n");
    const inventory = await readInventory(connection);
    process.stderr.write("[proposed-stats] inventory complete\n");
    const cohortId = await worldCohortId(connection);
    const aggregationDefinitions = [
      {
        key: "medal-collection",
        source: ["competition_podium_members"],
        sql: `SELECT person_id, SUM(podium_position = 1) AS gold_medals, SUM(podium_position = 2) AS silver_medals, SUM(podium_position = 3) AS bronze_medals, COUNT(*) AS medal_count FROM competition_podium_members GROUP BY person_id`,
        orderBy: "medal_count DESC, person_id",
        repetitions,
      },
      {
        key: "rank-events-per-person",
        source: ["person_event_rankings"],
        sql: `SELECT person_id, COUNT(DISTINCT event_id) AS ranked_event_count FROM person_event_rankings WHERE result_type = 'single' GROUP BY person_id`,
        orderBy: "ranked_event_count DESC, person_id",
        repetitions,
      },
      {
        key: "top-100-appearances",
        source: ["person_year_rankings_single", "person_year_ranking_cohorts"],
        sql: `SELECT person_id, COUNT(*) AS top_100_appearances FROM person_year_rankings_single WHERE cohort_id = ${cohortId} AND position <= 100 GROUP BY person_id`,
        orderBy: "top_100_appearances DESC, person_id",
        repetitions,
      },
    ];
    const historicalAsOfDates = await historicalDates(
      connection,
      requestedDates,
    );
    const report = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      branch: currentBranch(),
      configuration: {
        subX,
        repetitions,
        historicalAsOfDates,
        worldCohortId: cohortId,
      },
      catalog: PROPOSED_STATS,
      inventory,
      materializedAggregations: [],
      attemptFacts: null,
      historical: null,
    };
    for (const definition of aggregationDefinitions) {
      process.stderr.write(`[proposed-stats] measuring ${definition.key}\n`);
      report.materializedAggregations.push(
        await measureMaterializedAggregation(connection, definition),
      );
    }
    process.stderr.write("[proposed-stats] measuring shared attempt stage\n");
    report.attemptFacts = await measureAttemptScans(connection, {
      repetitions,
      subX,
    });
    process.stderr.write("[proposed-stats] measuring historical stages\n");
    report.historical = await measureHistorical(connection, {
      repetitions,
      dates: historicalAsOfDates,
    });
    report.conclusions = {
      dailyBuildPolicy:
        "Do not add any proposed statistic to the production projection registry from this experiment.",
      attemptStage:
        "Compare sharedTotalMs with separateTotalMs; a shared stage is not a win if its materialization plus repeated consumers is slower or adds large persistent storage pressure.",
      historicalStages:
        "Treat as-of rankings and standing-record history as lazy or batch-only until a bounded snapshot design beats repeated full result-fact scans.",
      productValueGate:
        "Only promote a candidate after a product owner confirms the use case and the measured incremental build cost is acceptable.",
    };
    const serialized = `${JSON.stringify(report, null, 2)}\n`;
    if (outputPath) await writeFile(outputPath, serialized);
    process.stdout.write(serialized);
  } finally {
    await connection.end();
  }
}

export {
  asOfRankingSql,
  directAttemptQueries as buildAttemptQueries,
  historicalRecordSql,
  historicalStageSql,
  recordsInMostEventsSql,
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();

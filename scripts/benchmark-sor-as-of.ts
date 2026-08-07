#!/usr/bin/env bun

import { readFile } from "node:fs/promises";
import mysql from "mysql2/promise";

const EVENT_IDS = [
  "333",
  "222",
  "444",
  "555",
  "666",
  "777",
  "333bf",
  "333fm",
  "333oh",
  "clock",
  "minx",
  "pyram",
  "skewb",
  "sq1",
  "444bf",
  "555bf",
  "333mbf",
];

function option(name: string) {
  const prefix = `--${name}=`;
  return process.argv
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length);
}

function cutoffDate() {
  const value = option("cutoff");
  if (value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
      throw new Error("--cutoff must use YYYY-MM-DD.");
    return value;
  }
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 7);
  return date.toISOString().slice(0, 10);
}

function databaseOptions() {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL is required.");
  const url = new URL(value);
  return {
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, "")),
    multipleStatements: true,
  };
}

function elapsed(start: number) {
  return Math.round((performance.now() - start) * 100) / 100;
}

const cutoff = cutoffDate();
const connection = await mysql.createConnection(databaseOptions());

try {
  const startedAt = performance.now();
  const eventPlaceholders = EVENT_IDS.map(() => "?").join(", ");
  await connection.query(
    `CREATE TEMPORARY TABLE result_facts_last_week AS
     SELECT facts.*
     FROM result_facts facts
     INNER JOIN competitions competition ON competition.id = facts.competition_id
     WHERE STR_TO_DATE(
       CONCAT(competition.end_year, '-', LPAD(competition.end_month, 2, '0'), '-',
         LPAD(competition.end_day, 2, '0')), '%Y-%m-%d') <= ?`,
    [cutoff],
  );

  const rankingSql = (resultColumn: "best" | "average", name: string) => `
    CREATE TEMPORARY TABLE ${name} AS
    WITH bests AS (
      SELECT event_id, person_id, MIN(${resultColumn}) AS best,
        MAX(person_country_id) AS country_id, MAX(person_continent_id) AS continent_id
      FROM result_facts_last_week
      WHERE event_id IN (${eventPlaceholders}) AND ${resultColumn} > 0
      GROUP BY event_id, person_id
    )
    SELECT person_id, event_id, best,
      RANK() OVER (PARTITION BY event_id ORDER BY best) AS world_rank,
      RANK() OVER (PARTITION BY event_id, continent_id ORDER BY best) AS continent_rank,
      RANK() OVER (PARTITION BY event_id, country_id ORDER BY best) AS country_rank
    FROM bests`;

  await connection.query(
    rankingSql("best", "ranks_single_last_week"),
    EVENT_IDS,
  );
  await connection.query(
    rankingSql("average", "ranks_average_last_week"),
    EVENT_IDS,
  );
  console.log(`As-of cutoff: ${cutoff}`);
  console.log(
    `Temporary historical sources built in ${elapsed(startedAt)} ms.`,
  );

  const projectionPath = new URL(
    "../data-tools/projection-catalog/people/sum-of-ranks/person_sum_of_ranks_scores.sql",
    import.meta.url,
  );
  let projectionSql = await readFile(projectionPath, "utf8");
  projectionSql = projectionSql
    .replaceAll(/\bresult_facts\b/g, "result_facts_last_week")
    .replaceAll(/\branks_single\b/g, "ranks_single_last_week")
    .replaceAll(/\branks_average\b/g, "ranks_average_last_week")
    .replaceAll(
      /\bperson_sum_of_ranks_scores\b/g,
      "person_sum_of_ranks_scores_last_week",
    );

  await connection.query(
    "CREATE TEMPORARY TABLE person_sum_of_ranks_scores_last_week LIKE person_sum_of_ranks_scores",
  );
  const projectionStartedAt = performance.now();
  await connection.query(projectionSql);
  console.log(
    `Temporary SoR projection built in ${elapsed(projectionStartedAt)} ms.`,
  );

  const [counts] = await connection.query<mysql.RowDataPacket[]>(`SELECT
    (SELECT COUNT(*) FROM person_sum_of_ranks_scores) AS current_rows,
    (SELECT COUNT(*) FROM person_sum_of_ranks_scores_last_week) AS as_of_rows,
    (SELECT COUNT(*) FROM person_sum_of_ranks_scores current_scores
      INNER JOIN person_sum_of_ranks_scores_last_week previous_scores
        ON previous_scores.metric_version = current_scores.metric_version
       AND previous_scores.event_set_version = current_scores.event_set_version
       AND previous_scores.result_type = current_scores.result_type
       AND previous_scores.scope = current_scores.scope
       AND previous_scores.region_id = current_scores.region_id
       AND previous_scores.person_id = current_scores.person_id
       AND previous_scores.gender = current_scores.gender
      WHERE current_scores.score <> previous_scores.score) AS changed_rows`);
  console.log("Row counts:", counts[0]);

  const [changes] = await connection.query<mysql.RowDataPacket[]>(`SELECT
    current_scores.result_type, current_scores.scope, current_scores.region_id,
    current_scores.person_id, current_scores.gender,
    previous_scores.score AS previous_score, current_scores.score AS current_score,
    previous_scores.rank AS previous_rank, current_scores.rank AS current_rank,
    previous_scores.score - current_scores.score AS score_improvement
    FROM person_sum_of_ranks_scores current_scores
    INNER JOIN person_sum_of_ranks_scores_last_week previous_scores
      ON previous_scores.metric_version = current_scores.metric_version
     AND previous_scores.event_set_version = current_scores.event_set_version
     AND previous_scores.result_type = current_scores.result_type
     AND previous_scores.scope = current_scores.scope
     AND previous_scores.region_id = current_scores.region_id
     AND previous_scores.person_id = current_scores.person_id
     AND previous_scores.gender = current_scores.gender
    WHERE current_scores.score <> previous_scores.score
    ORDER BY score_improvement DESC, current_scores.scope, current_scores.region_id
    LIMIT 25`);
  console.log("Largest score improvements:");
  console.table(changes);
} finally {
  await connection.end();
}

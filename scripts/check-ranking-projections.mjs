import mysql from "mysql2/promise";
import { PUBLISHED_PROJECTION_TABLES } from "./mysql-schema.mjs";
import { databaseOptions } from "./lib/database.mjs";

const TABLES = [...PUBLISHED_PROJECTION_TABLES, "export_metadata"];
const ENTRY_COLUMNS = [
  "event_id",
  "world_rank",
  "world_sub_rank",
  "continent_id",
  "continent_rank",
  "continent_sub_rank",
  "country_id",
  "country_rank",
  "country_sub_rank",
];
const ENTRY_INDEXES = [
  "idx_ranking_entries_world",
  "idx_ranking_entries_continent",
  "idx_ranking_entries_country",
];
const RESULT_RANKING_COLUMNS = [
  "result_id",
  "event_id",
  "result_value",
  "gender",
  "world_rank",
  "world_position",
  "continent_rank",
  "continent_position",
  "country_rank",
  "country_position",
];
const RESULT_FACT_COLUMNS = ["result_id", "gender"];
const RESULT_RANKING_INDEXES = [
  "PRIMARY",
  "idx_results_single_world",
  "idx_results_single_continent",
  "idx_results_single_country",
  "idx_results_single_person",
  "idx_results_single_lazy_gender",
  "idx_results_average_world",
  "idx_results_average_continent",
  "idx_results_average_country",
  "idx_results_average_person",
];
const SUM_OF_RANKS_COLUMNS = [
  "metric_version",
  "event_set_version",
  "result_type",
  "scope",
  "region_id",
  "person_id",
  "gender",
  "score",
  "coverage",
  "required_coverage",
  "rank",
  "position",
  "kinch_score",
  "kinch_coverage",
  "kinch_rank",
  "kinch_position",
];
const SUM_OF_RANKS_INDEXES = [
  "PRIMARY",
  "idx_person_sum_of_ranks_page",
  "idx_person_kinch_page",
  "idx_person_kinch_continent_page",
  "idx_person_metric_gender_values",
];
const COMPETITION_EVENT_COLUMNS = [
  "competition_id",
  "event_id",
  "fastest_single",
  "fastest_single_result_id",
  "fastest_single_rank",
  "fastest_single_position",
  "fastest_average",
  "fastest_average_result_id",
  "fastest_average_rank",
  "fastest_average_position",
  "podium_score",
  "podium_rank",
  "podium_position",
];
const COMPETITION_EVENT_INDEXES = [
  "PRIMARY",
  "idx_competition_event_fastest_single",
  "idx_competition_event_fastest_average",
  "idx_competition_event_podium",
];
const COMPETITION_PODIUM_COLUMNS = [
  "competition_id",
  "event_id",
  "result_type",
  "podium_position",
  "person_id",
  "result_id",
  "result_value",
];
const COMPETITION_PODIUM_INDEXES = [
  "PRIMARY",
  "idx_comp_podium_members_person",
];

async function main() {
  const connection = await mysql.createConnection(databaseOptions());
  try {
    const [tableRows] = await connection.query(
      `SELECT table_name AS name FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name IN (${TABLES.map(() => "?").join(", ")})`,
      TABLES,
    );
    const tables = new Set(tableRows.map((row) => row.name));
    const [columnRows, indexRows] = await Promise.all([
      connection.query(
        `SELECT table_name, column_name FROM information_schema.columns
         WHERE table_schema = DATABASE()
           AND table_name IN (?, ?, ?, ?, ?, ?, ?, ?)
           AND column_name IN (${[...ENTRY_COLUMNS, ...RESULT_RANKING_COLUMNS, ...RESULT_FACT_COLUMNS, ...SUM_OF_RANKS_COLUMNS, ...COMPETITION_EVENT_COLUMNS, ...COMPETITION_PODIUM_COLUMNS].map(() => "?").join(", ")})`,
        ["ranking_entries_single", "ranking_entries_average", "result_rankings_single", "result_rankings_average", "result_facts", "person_sum_of_ranks_scores", "competition_event_stats", "competition_podium_members", ...ENTRY_COLUMNS, ...RESULT_RANKING_COLUMNS, ...RESULT_FACT_COLUMNS, ...SUM_OF_RANKS_COLUMNS, ...COMPETITION_EVENT_COLUMNS, ...COMPETITION_PODIUM_COLUMNS],
      ).then(([rows]) => rows),
      connection.query(
        `SELECT table_name, index_name FROM information_schema.statistics
         WHERE table_schema = DATABASE()
           AND table_name IN (?, ?, ?, ?, ?, ?, ?)
           AND index_name IN (${[...ENTRY_INDEXES, ...RESULT_RANKING_INDEXES, ...SUM_OF_RANKS_INDEXES, ...COMPETITION_EVENT_INDEXES, ...COMPETITION_PODIUM_INDEXES].map(() => "?").join(", ")})`,
        ["ranking_entries_single", "ranking_entries_average", "result_rankings_single", "result_rankings_average", "person_sum_of_ranks_scores", "competition_event_stats", "competition_podium_members", ...ENTRY_INDEXES, ...RESULT_RANKING_INDEXES, ...SUM_OF_RANKS_INDEXES, ...COMPETITION_EVENT_INDEXES, ...COMPETITION_PODIUM_INDEXES],
      ).then(([rows]) => rows),
    ]);
    const metadataRows = tables.has("export_metadata")
      ? (await connection.query("SELECT `key`, value FROM export_metadata WHERE `key` = 'fetched_at'"))[0]
      : [];
    const columns = new Set(columnRows.map((row) => `${row.table_name}.${row.column_name}`));
    const indexes = new Set(indexRows.map((row) => `${row.table_name}.${row.index_name}`));
    const issues = [
      ...TABLES.filter((table) => !tables.has(table)).map((table) => `missing table ${table}`),
      ...["ranking_entries_single", "ranking_entries_average"].flatMap((table) =>
        ENTRY_COLUMNS.filter((column) => !columns.has(`${table}.${column}`)).map((column) => `missing column ${table}.${column}`),
      ),
      ...["result_rankings_single", "result_rankings_average"].flatMap((table) =>
        RESULT_RANKING_COLUMNS.filter((column) => !columns.has(`${table}.${column}`)).map((column) => `missing column ${table}.${column}`),
      ),
      ...RESULT_FACT_COLUMNS.filter((column) => !columns.has(`result_facts.${column}`)).map((column) => `missing column result_facts.${column}`),
      ...SUM_OF_RANKS_COLUMNS.filter((column) => !columns.has(`person_sum_of_ranks_scores.${column}`)).map((column) => `missing column person_sum_of_ranks_scores.${column}`),
      ...COMPETITION_EVENT_COLUMNS.filter((column) => !columns.has(`competition_event_stats.${column}`)).map((column) => `missing column competition_event_stats.${column}`),
      ...COMPETITION_PODIUM_COLUMNS.filter((column) => !columns.has(`competition_podium_members.${column}`)).map((column) => `missing column competition_podium_members.${column}`),
      ...["ranking_entries_single", "ranking_entries_average"].flatMap((table) =>
        ENTRY_INDEXES.filter((index) => !indexes.has(`${table}.${index}`)).map((index) => `missing index ${table}.${index}`),
      ),
      ...RESULT_RANKING_INDEXES.filter((index) => {
        const table = index.includes("_average_")
          ? "result_rankings_average"
          : "result_rankings_single";
        return index !== "PRIMARY" && !indexes.has(`${table}.${index}`);
      }).map((index) => `missing result ranking index ${index}`),
      ...["result_rankings_single", "result_rankings_average"]
        .filter((table) => !indexes.has(`${table}.PRIMARY`))
        .map((table) => `missing index ${table}.PRIMARY`),
      ...SUM_OF_RANKS_INDEXES.filter((index) => !indexes.has(`person_sum_of_ranks_scores.${index}`)).map((index) => `missing index person_sum_of_ranks_scores.${index}`),
      ...COMPETITION_EVENT_INDEXES.filter((index) => !indexes.has(`competition_event_stats.${index}`)).map((index) => `missing index competition_event_stats.${index}`),
      ...COMPETITION_PODIUM_INDEXES.filter((index) => !indexes.has(`competition_podium_members.${index}`)).map((index) => `missing index competition_podium_members.${index}`),
      ...(metadataRows[0]?.value ? [] : ["missing export_metadata.fetched_at"]),
    ];
    if (issues.length > 0) {
      throw new Error(`Ranking projections need rebuilding:\n- ${issues.join("\n- ")}`);
    }
    process.stdout.write("Ranking projections are ready.\n");
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
  process.stderr.write("Run Flyway migrations, then backfill the missing active projection or rebuild all projections with /app/scripts/refresh-rankings.mjs.\n");
  process.exitCode = 1;
});

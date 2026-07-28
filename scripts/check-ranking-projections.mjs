import mysql from "mysql2/promise";

const TABLES = ["ranking_entries_single", "ranking_entries_average", "ranking_counts", "result_entries_single", "result_counts", "export_metadata"];
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
const RESULT_ENTRY_COLUMNS = [
  "result_id",
  "event_id",
  "best",
  "world_rank",
  "world_sub_rank",
  "continent_id",
  "continent_rank",
  "continent_sub_rank",
  "country_id",
  "country_rank",
  "country_sub_rank",
];
const RESULT_ENTRY_INDEXES = [
  "PRIMARY",
  "idx_result_entries_single_world",
  "idx_result_entries_single_continent",
  "idx_result_entries_single_country",
];

function databaseOptions(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const url = new URL(connectionString);
  return {
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, "")),
  };
}

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
           AND table_name IN (?, ?, ?)
           AND column_name IN (${[...ENTRY_COLUMNS, ...RESULT_ENTRY_COLUMNS].map(() => "?").join(", ")})`,
        ["ranking_entries_single", "ranking_entries_average", "result_entries_single", ...ENTRY_COLUMNS, ...RESULT_ENTRY_COLUMNS],
      ).then(([rows]) => rows),
      connection.query(
        `SELECT table_name, index_name FROM information_schema.statistics
         WHERE table_schema = DATABASE()
           AND table_name IN (?, ?, ?)
           AND index_name IN (${[...ENTRY_INDEXES, ...RESULT_ENTRY_INDEXES].map(() => "?").join(", ")})`,
        ["ranking_entries_single", "ranking_entries_average", "result_entries_single", ...ENTRY_INDEXES, ...RESULT_ENTRY_INDEXES],
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
      ...RESULT_ENTRY_COLUMNS.filter((column) => !columns.has(`result_entries_single.${column}`)).map((column) => `missing column result_entries_single.${column}`),
      ...["ranking_entries_single", "ranking_entries_average"].flatMap((table) =>
        ENTRY_INDEXES.filter((index) => !indexes.has(`${table}.${index}`)).map((index) => `missing index ${table}.${index}`),
      ),
      ...RESULT_ENTRY_INDEXES.filter((index) => !indexes.has(`result_entries_single.${index}`)).map((index) => `missing index result_entries_single.${index}`),
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
  process.stderr.write("Run Flyway migrations, then: docker compose run --rm app node /app/scripts/backfill-result-entries.mjs (or rebuild all projections with /app/scripts/refresh-rankings.mjs)\n");
  process.exitCode = 1;
});

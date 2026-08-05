import { argumentPresent, argumentValue } from "./lib/arguments.ts";
import { databaseOptions } from "./lib/database.ts";
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { access, mkdir, rename, rm } from "node:fs/promises";
import { basename, join } from "node:path";
import { pipeline } from "node:stream/promises";
import mysql from "mysql2/promise";
import type {
  Connection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";
import * as unzipper from "unzipper";
import {
  dropManagedObject,
  ensureWcaPersonLookupIndex,
} from "../data-tools/projections/shared/database.ts";
import { buildProjectionTables } from "../data-tools/projections/build/builder.ts";
import { publishProjectionTables } from "../data-tools/projections/build/publish.ts";
import { enqueueAllListRankingRebuilds } from "./lib/list-ranking-jobs.ts";
import { refreshBoardList, refreshDelegatesList } from "./lib/board-lists.ts";
import { refreshSystemLists } from "./lib/system-lists.ts";
import { resolveWcaExport } from "./lib/wca-export.ts";
import type {
  ExportMetadataRow,
  ImportCoverageRow,
  ImportRunFields,
  MariaDbImportResult,
  SyncWcaOptions,
  WcaExportMetadata,
} from "./lib/wca-sync-types.ts";

function syncWcaOptions(): SyncWcaOptions {
  return {
    force: argumentPresent("force"),
    dryRun: argumentPresent("dry-run"),
    rawOnly: argumentPresent("raw-only"),
    selectedProjectionNames: argumentValue("projection-names")
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean),
    canonicalExportDate:
      argumentValue("canonical-export-date") ||
      process.env.CANONICAL_EXPORT_DATE ||
      "",
    suppliedPath: argumentValue("sql-path") || process.env.WCA_SQL_EXPORT_PATH,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function getSuppliedExportMetadata(
  path: string,
): Promise<WcaExportMetadata> {
  const archive = await unzipper.Open.file(path);
  const entry = archive.files.find(
    (file) => basename(file.path).toLowerCase() === "metadata.json",
  );
  if (!entry)
    throw new Error("The supplied WCA SQL export is missing metadata.json.");
  const metadata: unknown = JSON.parse((await entry.buffer()).toString("utf8"));
  if (!isRecord(metadata)) {
    throw new Error("The supplied WCA SQL export metadata is invalid.");
  }
  const exportDate = metadata.export_date ?? metadata.exportDate;
  const version =
    metadata.export_format_version ?? metadata.exportFormatVersion ?? "2";
  if (!exportDate)
    throw new Error(
      "The supplied WCA SQL export metadata is missing export_date.",
    );
  return {
    exportDate: String(exportDate),
    sqlUrl: "",
    version: String(version),
  };
}

async function download(url: string, destination: string): Promise<void> {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body)
    throw new Error(`Export download returned ${response.status}.`);
  const output = createWriteStream(destination);
  await pipeline(responseChunks(response.body), output);
}

async function* responseChunks(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<Uint8Array> {
  const reader = body.getReader();
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) return;
      yield result.value;
    }
  } finally {
    reader.releaseLock();
  }
}

async function getCachedExport(
  latest: WcaExportMetadata,
  options: SyncWcaOptions,
): Promise<string> {
  if (options.suppliedPath) {
    await access(options.suppliedPath);
    process.stdout.write(
      `Using supplied WCA SQL export: ${options.suppliedPath}\n`,
    );
    return options.suppliedPath;
  }

  const cacheDirectory =
    process.env.WCA_EXPORT_CACHE_DIR || "/var/cache/wcarankings";
  await mkdir(cacheDirectory, { recursive: true });
  const cacheDate = String(latest.exportDate).slice(0, 10);
  const cachePath = join(cacheDirectory, `wca-export-${cacheDate}.sql.zip`);
  try {
    await access(cachePath);
    process.stdout.write(`Using cached WCA SQL export: ${cachePath}\n`);
    return cachePath;
  } catch {
    const partialPath = `${cachePath}.part`;
    await rm(partialPath, { force: true });
    process.stdout.write(`Downloading WCA SQL export to ${cachePath}…\n`);
    try {
      await download(latest.sqlUrl, partialPath);
      await rename(partialPath, cachePath);
    } catch (error) {
      await rm(partialPath, { force: true });
      throw error;
    }
    return cachePath;
  }
}

async function getCachedExportForToday(): Promise<string | null> {
  const cacheDirectory =
    process.env.WCA_EXPORT_CACHE_DIR || "/var/cache/wcarankings";
  const cachePath = join(
    cacheDirectory,
    `wca-export-${new Date().toISOString().slice(0, 10)}.sql.zip`,
  );
  try {
    await access(cachePath);
    return cachePath;
  } catch {
    return null;
  }
}

function sqlEntry(archive: unzipper.CentralDirectory): unzipper.File {
  const entry = archive.files.find(
    (file) => basename(file.path).toLowerCase() === "wca_export.sql",
  );
  if (!entry)
    throw new Error("Could not find WCA_export.sql in the WCA SQL export.");
  return entry;
}

async function dropRankingViews(): Promise<void> {
  const connection = await mysql.createConnection(
    databaseOptions(undefined, {
      databaseName: process.env.DATABASE_NAME_OVERRIDE,
    }),
  );
  try {
    for (const name of [
      "ranking_counts_source",
      "ranking_entries_source",
      "ranking_entries_single_source",
      "ranking_entries_average_source",
      "wca_best_single",
      "wca_best_average",
    ]) {
      await dropManagedObject(connection, name);
    }
  } finally {
    await connection.end();
  }
}

function now(): Date {
  return new Date();
}

function elapsedMilliseconds(startedAt: Date, completedAt = now()): number {
  return Math.max(0, completedAt.getTime() - startedAt.getTime());
}

function safeFailureMessage(error: unknown): string {
  return String(error instanceof Error ? error.message : error)
    .replace(/mysql:\/\/[^\s]+/gi, "mysql://[redacted]")
    .replace(/MYSQL_PWD\s*[=:]\s*[^\s]+/gi, "MYSQL_PWD=[redacted]")
    .slice(0, 2000);
}

async function updateImportRun(
  id: number,
  fields: ImportRunFields,
): Promise<void> {
  const connection = await mysql.createConnection(
    databaseOptions(undefined, {
      databaseName: process.env.DATABASE_NAME_OVERRIDE,
    }),
  );
  try {
    const entries = Object.entries(fields);
    if (entries.length === 0) return;
    const values = entries.map(([, value]) => value);
    const assignments = entries.map(([key]) => `\`${key}\` = ?`).join(", ");
    await connection.query(
      `UPDATE import_runs SET ${assignments} WHERE id = ?`,
      [...values, id],
    );
  } finally {
    await connection.end();
  }
}

async function createImportRun(
  latest: WcaExportMetadata,
  startedAt: Date,
): Promise<number> {
  const connection = await mysql.createConnection(
    databaseOptions(undefined, {
      databaseName: process.env.DATABASE_NAME_OVERRIDE,
    }),
  );
  try {
    const [result] = await connection.query<ResultSetHeader>(
      `INSERT INTO import_runs
        (export_date, export_format_version, export_url, status, started_at, fetch_started_at)
       VALUES (?, ?, ?, 'running', ?, ?)`,
      [
        String(latest.exportDate).slice(0, 10),
        latest.version,
        latest.sqlUrl || null,
        startedAt,
        startedAt,
      ],
    );
    return result.insertId;
  } finally {
    await connection.end();
  }
}

async function collectImportCounts(): Promise<ImportRunFields> {
  const connection = await mysql.createConnection(
    databaseOptions(undefined, {
      databaseName: process.env.DATABASE_NAME_OVERRIDE,
    }),
  );
  try {
    const [coverage] = await connection.query<ImportCoverageRow[]>(`
      SELECT
        (SELECT COUNT(*) FROM persons WHERE sub_id = 1) AS people,
        (SELECT COUNT(*) FROM results) AS results,
        (SELECT COUNT(*) FROM ranking_entries_single_staging) +
          (SELECT COUNT(*) FROM ranking_entries_average_staging) AS rankings,
        (SELECT COUNT(*) FROM result_rankings_single_staging) +
          (SELECT COUNT(*) FROM result_rankings_average_staging) AS result_entries,
        (SELECT COUNT(*) FROM (
          SELECT event_id FROM ranking_entries_single_staging
          UNION
          SELECT event_id FROM ranking_entries_average_staging
        ) AS ranking_events) AS events,
        (SELECT COUNT(*) FROM (
          SELECT country_id FROM ranking_entries_single_staging WHERE country_id <> ''
          UNION
          SELECT country_id FROM ranking_entries_average_staging WHERE country_id <> ''
        ) AS ranking_regions) AS regions,
        (SELECT COUNT(*) FROM ranking_counts_staging) AS aggregates,
        (SELECT COUNT(*) FROM result_ranking_counts_staging) AS result_aggregates
    `);
    return {
      source_person_count: Number(coverage[0]?.people ?? 0),
      source_result_count: Number(coverage[0]?.results ?? 0),
      published_ranking_count: Number(coverage[0]?.rankings ?? 0),
      published_result_count: Number(coverage[0]?.result_entries ?? 0),
      event_count: Number(coverage[0]?.events ?? 0),
      region_count: Number(coverage[0]?.regions ?? 0),
      aggregate_count: Number(coverage[0]?.aggregates ?? 0),
      result_aggregate_count: Number(coverage[0]?.result_aggregates ?? 0),
    };
  } finally {
    await connection.end();
  }
}

async function tableExists(
  connection: Connection,
  name: string,
): Promise<boolean> {
  const [rows] = await connection.query<RowDataPacket[]>(
    "SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1",
    [name],
  );
  return rows.length > 0;
}

async function promoteRankings(): Promise<void> {
  const connection = await mysql.createConnection(
    databaseOptions(undefined, {
      databaseName: process.env.DATABASE_NAME_OVERRIDE,
    }),
  );
  try {
    const hasLegacyProjection = await tableExists(
      connection,
      "ranking_entries",
    );
    if (hasLegacyProjection) {
      await dropManagedObject(connection, "ranking_entries_legacy_previous");
      await connection.query(
        "RENAME TABLE ranking_entries TO ranking_entries_legacy_previous",
      );
    }
    await publishProjectionTables(connection);
    await dropManagedObject(connection, "ranking_entries_legacy_previous");
  } finally {
    await connection.end();
  }
}

async function importSqlExport(zipPath: string): Promise<void> {
  const archive = await unzipper.Open.file(zipPath);
  const entry = sqlEntry(archive);
  const options = databaseOptions(undefined, {
    databaseName: process.env.DATABASE_NAME_OVERRIDE,
  });
  const child = spawn(
    "mariadb",
    [
      "--protocol=TCP",
      "--host",
      options.host,
      "--port",
      String(options.port),
      "--user",
      options.user,
      "--database",
      options.database,
      "--binary-mode",
    ],
    {
      env: { ...process.env, MYSQL_PWD: options.password },
      stdio: ["pipe", "ignore", "pipe"],
    },
  );
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));
  const exit = new Promise<MariaDbImportResult>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  await pipeline(entry.stream(), child.stdin);
  const result = await exit;
  if (result.code !== 0)
    throw new Error(
      `MariaDB import failed with exit code ${result.code ?? result.signal}.`,
    );
}

function hasMariaDbCode(value: unknown): value is { code: string } {
  return isRecord(value) && typeof value.code === "string";
}

async function getImportedDate(): Promise<string | null> {
  const connection = await mysql.createConnection(
    databaseOptions(undefined, {
      databaseName: process.env.DATABASE_NAME_OVERRIDE,
    }),
  );
  try {
    const [rows] = await connection.query<ExportMetadataRow[]>(
      "SELECT value FROM export_metadata WHERE `key` = 'export_date' LIMIT 1",
    );
    return rows[0]?.value ?? null;
  } catch (error) {
    if (hasMariaDbCode(error) && error.code === "ER_NO_SUCH_TABLE") return null;
    throw error;
  } finally {
    await connection.end();
  }
}

async function writeExportMetadata(latest: WcaExportMetadata): Promise<void> {
  const connection = await mysql.createConnection(
    databaseOptions(undefined, {
      databaseName: process.env.DATABASE_NAME_OVERRIDE,
    }),
  );
  try {
    await connection.query(
      "INSERT INTO export_metadata (`key`, `value`) VALUES (?, ?), (?, ?), (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)",
      [
        "export_date",
        String(latest.exportDate),
        "export_format_version",
        String(latest.version),
        "fetched_at",
        new Date().toISOString(),
      ],
    );
  } finally {
    await connection.end();
  }
}

async function refreshRankingsSchema(
  selectedProjectionNames: readonly string[],
): Promise<void> {
  const connection = await mysql.createConnection(
    databaseOptions(undefined, {
      databaseName: process.env.DATABASE_NAME_OVERRIDE,
    }),
  );
  try {
    await buildProjectionTables(connection, {
      projectionSuffix: "_staging",
      projectionNames:
        selectedProjectionNames.length > 0
          ? selectedProjectionNames
          : undefined,
      createConnection: () =>
        mysql.createConnection(
          databaseOptions(undefined, {
            databaseName: process.env.DATABASE_NAME_OVERRIDE,
          }),
        ),
    });
  } finally {
    await connection.end();
  }
}

async function refreshRawPersonLookupIndex(): Promise<void> {
  const connection = await mysql.createConnection(
    databaseOptions(undefined, {
      databaseName: process.env.DATABASE_NAME_OVERRIDE,
    }),
  );
  try {
    await ensureWcaPersonLookupIndex(connection);
  } finally {
    await connection.end();
  }
}

async function main(): Promise<void> {
  const options = syncWcaOptions();
  if (options.dryRun && options.rawOnly)
    throw new Error("--dry-run and --raw-only cannot be used together.");
  let latest: WcaExportMetadata;
  if (options.suppliedPath) {
    latest = await getSuppliedExportMetadata(options.suppliedPath);
  } else {
    const cachedPath = await getCachedExportForToday();
    latest = cachedPath
      ? await getSuppliedExportMetadata(cachedPath)
      : await resolveWcaExport();
  }
  if (options.canonicalExportDate) {
    latest = { ...latest, exportDate: options.canonicalExportDate };
  }
  process.stdout.write(
    `Latest WCA export: ${latest.exportDate} (v${String(latest.version).replace(/^v/i, "")})\n`,
  );

  if (options.dryRun) {
    await getCachedExport(latest, options);
    process.stdout.write(
      "Dry run complete. The cached SQL export is available for import.\n",
    );
    return;
  }

  if (
    !options.force &&
    (await getImportedDate()) === String(latest.exportDate)
  ) {
    process.stdout.write("Database is already current. Nothing to do.\n");
    return;
  }

  const startedAt = now();
  const runId = await createImportRun(latest, startedAt);
  try {
    await updateImportRun(runId, { fetch_started_at: startedAt });
    const zipPath = await getCachedExport(latest, options);
    await dropRankingViews();
    process.stdout.write("Importing WCA SQL tables into MariaDB…\n");
    await importSqlExport(zipPath);
    if (options.rawOnly) {
      await refreshRawPersonLookupIndex();
      const completedAt = now();
      await writeExportMetadata(latest);
      await updateImportRun(runId, {
        status: "succeeded",
        projection_swap_status: "not_applicable",
        completed_at: completedAt,
        duration_ms: elapsedMilliseconds(startedAt, completedAt),
      });
      process.stdout.write(
        `WCA raw tables are current through ${latest.exportDate}; projection publication skipped by --raw-only.\n`,
      );
      return;
    }
    const projectionBuildStartedAt = now();
    await updateImportRun(runId, {
      fetched_at: projectionBuildStartedAt,
      projection_build_started_at: projectionBuildStartedAt,
      projection_swap_status: "building",
    });
    process.stdout.write("Refreshing staging ranking projections…\n");
    await refreshRankingsSchema(options.selectedProjectionNames);
    const counts = await collectImportCounts();
    const projectionBuiltAt = now();
    await updateImportRun(runId, {
      ...counts,
      projection_built_at: projectionBuiltAt,
      projection_build_duration_ms: elapsedMilliseconds(
        projectionBuildStartedAt,
        projectionBuiltAt,
      ),
      projection_swap_status: "swapping",
    });
    await promoteRankings();
    await writeExportMetadata(latest);
    const systemListConnection = await mysql.createConnection(
      databaseOptions(undefined, {
        databaseName: process.env.DATABASE_NAME_OVERRIDE,
      }),
    );
    try {
      await refreshSystemLists(systemListConnection);
      await refreshBoardList(systemListConnection);
      await refreshDelegatesList(systemListConnection);
      await enqueueAllListRankingRebuilds(systemListConnection);
    } finally {
      await systemListConnection.end();
    }
    const completedAt = now();
    await updateImportRun(runId, {
      status: "succeeded",
      projection_swap_status: "published",
      completed_at: completedAt,
      duration_ms: elapsedMilliseconds(startedAt, completedAt),
    });
    process.stdout.write(
      `WCA rankings are current through ${latest.exportDate}.\n`,
    );
  } catch (error) {
    const completedAt = now();
    await updateImportRun(runId, {
      status: "failed",
      projection_swap_status: "failed",
      completed_at: completedAt,
      duration_ms: elapsedMilliseconds(startedAt, completedAt),
      failure_message: safeFailureMessage(error),
    });
    throw error;
  }
}

if (import.meta.main) {
  await main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.stack : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}

import { argumentPresent, argumentValue } from "./lib/arguments.ts";
import { databaseOptions } from "./lib/database.ts";
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { access, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { pipeline } from "node:stream/promises";
import mysql from "mysql2/promise";
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
import { sourceManifestFromSql } from "../data-tools/projections/release/source-manifest-sql.ts";
import { compareSourceManifests, type SourceManifest } from "../data-tools/projections/release/source-manifest.ts";
import type {
  ExportMetadataRow,
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

async function promoteRankings(): Promise<void> {
  const connection = await mysql.createConnection(
    databaseOptions(undefined, {
      databaseName: process.env.DATABASE_NAME_OVERRIDE,
    }),
  );
  try {
    await publishProjectionTables(connection);
  } finally {
    await connection.end();
  }
}

async function importSqlExport(zipPath: string, exportId: string, previous?: SourceManifest): Promise<SourceManifest> {
  const archive = await unzipper.Open.file(zipPath);
  const entry = sqlEntry(archive);
  const manifestPromise = sourceManifestFromSql(entry.stream(), exportId, previous);
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
  return manifestPromise;
}

async function publishSourceManifest(manifest: SourceManifest, previous?: SourceManifest): Promise<void> {
  const cacheDirectory = process.env.WCA_EXPORT_CACHE_DIR || "/var/cache/wcarankings";
  const path = process.env.WCA_SOURCE_MANIFEST_PATH || join(cacheDirectory, `wca-source-manifest-${String(manifest.exportId).slice(0, 10)}.json`);
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
  const comparison = compareSourceManifests(manifest, previous, new Date(manifest.exportId).getUTCFullYear());
  process.stdout.write(`Source manifest: ${path} (${Object.keys(manifest.competitions).length} competitions; dirty years: ${comparison.dirtyYears.join(",") || "none"})\n`);
}

async function previousSourceManifest(exportId: string): Promise<SourceManifest | undefined> {
  const explicit = process.env.WCA_SOURCE_MANIFEST_PREVIOUS_PATH;
  if (explicit) {
    try { return JSON.parse(await readFile(explicit, "utf8")) as SourceManifest; } catch { return undefined; }
  }
  const directory = process.env.WCA_EXPORT_CACHE_DIR || "/var/cache/wcarankings";
  try {
    const current = `wca-source-manifest-${String(exportId).slice(0, 10)}.json`;
    const candidates = (await readdir(directory)).filter((file) => file.startsWith("wca-source-manifest-") && file.endsWith(".json") && file !== current).sort().reverse();
    const candidate = candidates[0];
    return candidate ? JSON.parse(await readFile(join(directory, candidate), "utf8")) as SourceManifest : undefined;
  } catch { return undefined; }
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

  const zipPath = await getCachedExport(latest, options);
  const previousManifest = await previousSourceManifest(latest.exportDate);
  await dropRankingViews();
  process.stdout.write("Importing WCA SQL tables into MariaDB…\n");
  const sourceManifest = await importSqlExport(zipPath, latest.exportDate, previousManifest);
  if (options.rawOnly) {
    await refreshRawPersonLookupIndex();
    await publishSourceManifest(sourceManifest, previousManifest);
    await writeExportMetadata(latest);
    process.stdout.write(
      `WCA raw tables are current through ${latest.exportDate}; projection publication skipped by --raw-only.\n`,
    );
    return;
  }
  process.stdout.write("Refreshing staging ranking projections…\n");
  await refreshRankingsSchema(options.selectedProjectionNames);
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
  process.stdout.write(
    `WCA rankings are current through ${latest.exportDate}.\n`,
  );
}

if (import.meta.main) {
  await main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.stack : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}

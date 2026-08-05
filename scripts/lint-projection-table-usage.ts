import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { PROJECTION_JOBS } from "../data-tools/projection-catalog/registry.ts";
import {
  unusedProjectionTables,
  type ProjectionTableUsageSource,
  type ProjectionTableUsageSourceKind,
} from "./lib/projection-table-usage.ts";

interface SourceDirectory {
  directory: string;
  extension: string;
  kind: ProjectionTableUsageSourceKind;
}

const SOURCE_DIRECTORIES: readonly SourceDirectory[] = [
  {
    directory: "data-tools/projection-catalog",
    extension: ".sql",
    kind: "projection-sql",
  },
  {
    directory: "services/lists",
    extension: ".ts",
    kind: "runtime-reference",
  },
  {
    directory: "services/rankings",
    extension: ".ts",
    kind: "runtime-reference",
  },
  { directory: "lib", extension: ".ts", kind: "runtime-sql" },
];

const IGNORED_RUNTIME_FILES = new Set(["services/rankings/metadata.ts"]);

async function filesBelow(
  rootDirectory: string,
  directory: string,
  extension: string,
): Promise<string[]> {
  const paths: string[] = [];
  for (const entry of await readdir(resolve(rootDirectory, directory), {
    withFileTypes: true,
  })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      paths.push(...(await filesBelow(rootDirectory, path, extension)));
    } else if (entry.isFile() && path.endsWith(extension)) {
      paths.push(path);
    }
  }
  return paths;
}

async function usageSources(
  rootDirectory: string,
): Promise<ProjectionTableUsageSource[]> {
  const sources: ProjectionTableUsageSource[] = [];
  for (const sourceDirectory of SOURCE_DIRECTORIES) {
    const paths = await filesBelow(
      rootDirectory,
      sourceDirectory.directory,
      sourceDirectory.extension,
    );
    for (const path of paths) {
      if (
        sourceDirectory.kind.startsWith("runtime-") &&
        IGNORED_RUNTIME_FILES.has(path)
      ) {
        continue;
      }
      sources.push({
        path,
        kind: sourceDirectory.kind,
        content: await readFile(resolve(rootDirectory, path), "utf8"),
      });
    }
  }
  return sources;
}

async function main(): Promise<void> {
  const rootDirectory = process.cwd();
  const tables = PROJECTION_JOBS.flatMap((job) => job.tables);
  const unusedTables = unusedProjectionTables(
    tables,
    await usageSources(rootDirectory),
  );

  for (const table of unusedTables) {
    const message = `${table} is generated but has no runtime or projection SQL consumer.`;
    console.warn(
      process.env.GITHUB_ACTIONS === "true"
        ? `::warning title=Unused projection table::${message}`
        : `[projection-table-usage] Warning: ${message}`,
    );
  }
}

await main();

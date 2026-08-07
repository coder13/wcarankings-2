import { readFile } from "node:fs/promises";
import { argumentList, argumentValue } from "../../lib/arguments.ts";
import { projectionReleasePlan } from "../../../data-tools/projections/release/plan.ts";
import { projectionSemanticPlan } from "../../../data-tools/projections/release/semantic-plan.ts";
import type { SourceManifest } from "../../../data-tools/projections/release/source-manifest.ts";

async function readJsonFile(path: string): Promise<unknown> {
  return path ? JSON.parse(await readFile(path, "utf8")) : {};
}

function objectOrUndefined(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

async function main(): Promise<void> {
  const command = process.argv[2] === "semantic" ? "semantic" : "release";
  const productionState = await readJsonFile(argumentValue("state-file"));
  const sourceManifest = objectOrUndefined(await readJsonFile(argumentValue("source-manifest-file")));
  const previousSourceManifest = objectOrUndefined(await readJsonFile(argumentValue("previous-source-manifest-file")));
  const selectedGroups = argumentList("groups");
  const forceRebuild = argumentValue("force-rebuild") === "true";
  if (command === "semantic") {
    const plan = await projectionSemanticPlan({
      productionState,
      selectedGroups: selectedGroups.length > 0 ? selectedGroups : undefined,
      forceRebuild,
    });
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    return;
  }

  const plan = await projectionReleasePlan({
    exportId: argumentValue("export-id"),
    productionExportId: argumentValue("production-export-id"),
    productionState,
    availableArtifacts: await readJsonFile(
      argumentValue("available-artifacts-file"),
    ),
    selectedGroups: selectedGroups.length > 0 ? selectedGroups : undefined,
    forceRebuild,
    sourceManifest: sourceManifest && Object.keys(sourceManifest).length > 0 ? sourceManifest as unknown as SourceManifest : undefined,
    previousSourceManifest: previousSourceManifest && Object.keys(previousSourceManifest).length > 0 ? previousSourceManifest as unknown as SourceManifest : undefined,
    currentYear: argumentValue("current-year") ? Number(argumentValue("current-year")) : undefined,
  });
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
}

if (import.meta.main) await main();

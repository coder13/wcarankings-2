import { readFile } from "node:fs/promises";
import { argumentList, argumentValue } from "../../lib/arguments.ts";
import { projectionReleasePlan } from "../../../data-tools/projections/release/plan.ts";
import { projectionSemanticPlan } from "../../../data-tools/projections/release/semantic-plan.ts";

async function readJsonFile(path: string): Promise<unknown> {
  return path ? JSON.parse(await readFile(path, "utf8")) : {};
}

async function main(): Promise<void> {
  const command = process.argv[2] === "semantic" ? "semantic" : "release";
  const productionState = await readJsonFile(argumentValue("state-file"));
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
  });
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
}

if (import.meta.main) await main();

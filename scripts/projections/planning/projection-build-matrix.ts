import { argumentValue } from "../../lib/arguments.ts";
import { createProjectionBuildMatrix } from "../../../data-tools/projections/build/matrix.ts";

async function main(): Promise<void> {
  const selectedGroups = (process.env.BUILD_GROUPS ?? "")
    .split(",")
    .filter(Boolean);
  const wave = Number(argumentValue("wave") || 1);
  const matrix = createProjectionBuildMatrix({ selectedGroups, wave });
  process.stdout.write(`${JSON.stringify(matrix)}\n`);
}

if (import.meta.main) await main();

import { resolve } from "node:path";
import { argumentValue } from "../../lib/arguments.ts";
import { planProjectionDeployment } from "../../../data-tools/projections/deployment/plan.ts";

async function main(): Promise<void> {
  const directory = resolve(argumentValue("directory") || ".");
  const plan = await planProjectionDeployment({ directory });
  process.stdout.write(`${JSON.stringify(plan)}\n`);
}

if (import.meta.main) await main();

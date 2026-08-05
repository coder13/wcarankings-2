import { argumentList } from "../../lib/arguments.ts";
import { projectionBuildPlan } from "../../../data-tools/projections/build/plan.ts";

async function main(): Promise<void> {
  const groups = argumentList("groups");
  const satisfiedGroups = argumentList("satisfied-groups");
  const plan = projectionBuildPlan(
    groups.length > 0 ? groups : undefined,
    satisfiedGroups,
  );
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
}

if (import.meta.main) await main();

import { projectionBuildPlan } from "./mysql-schema.mjs";
import { listArgument } from "./lib/cli.mjs";

const groups = listArgument("groups");
const satisfiedGroups = listArgument("satisfied-groups");

const plan = projectionBuildPlan(
  groups.length > 0 ? groups : undefined,
  satisfiedGroups,
);
process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);

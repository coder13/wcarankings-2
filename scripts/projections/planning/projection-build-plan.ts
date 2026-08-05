import { argumentValue } from "../../lib/arguments.ts";
import { projectionBuildPlan } from "../../../data-tools/projections/build.ts";

const groups = argumentValue("groups")
  .split(",")
  .map((name) => name.trim())
  .filter(Boolean);
const satisfiedGroups = argumentValue("satisfied-groups")
  .split(",")
  .map((name) => name.trim())
  .filter(Boolean);

const plan = projectionBuildPlan(
  groups.length > 0 ? groups : undefined,
  satisfiedGroups,
);
process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);

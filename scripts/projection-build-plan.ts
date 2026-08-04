// @ts-nocheck
import { projectionBuildPlan } from "../data-tools/projections/build.ts";

const groups = listArgument("groups");
const satisfiedGroups = listArgument("satisfied-groups");

const plan = projectionBuildPlan(
  groups.length > 0 ? groups : undefined,
  satisfiedGroups,
);
process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);

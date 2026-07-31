import { projectionBuildPlan } from "./mysql-schema.mjs";

function argumentValue(name) {
  const prefix = `--${name}=`;
  const argument = process.argv.find((value) => value.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : "";
}

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

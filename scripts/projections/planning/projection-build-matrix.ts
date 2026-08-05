import { argumentValue } from "../../lib/arguments.ts";
import {
  groupDependencyClosure,
  projectionGroup,
} from "../../../data-tools/projections/jobs.ts";

const selected = (process.env.BUILD_GROUPS || "").split(",").filter(Boolean);
const wave = Number(argumentValue("wave") || 1);
if (![1, 2].includes(wave)) throw new Error("--wave must be 1 or 2");
const selectedSet = new Set(selected);

function builtDependencies(name) {
  return groupDependencyClosure([name], { includeSelected: false })
    .map((group) => group.name)
    .filter((dependency) => selectedSet.has(dependency));
}

const entries = selected.map((name) => {
  projectionGroup(name);
  const dependencies = groupDependencyClosure([name], {
    includeSelected: false,
  }).map((group) => group.name);
  return {
    group: name,
    hydrateGroups: dependencies.join(","),
    builtDependencies: builtDependencies(name),
  };
});
const waveOneNames = new Set(
  entries
    .filter(({ builtDependencies: dependencies }) => dependencies.length === 0)
    .map(({ group }) => group),
);
const waveTwo = entries.filter(
  ({ builtDependencies: dependencies }) => dependencies.length > 0,
);
for (const entry of waveTwo) {
  if (
    entry.builtDependencies.some((dependency) => !waveOneNames.has(dependency))
  ) {
    throw new Error(
      `Projection dependency graph requires more than two build waves for ${entry.group}`,
    );
  }
}
const include = (
  wave === 1 ? entries.filter(({ group }) => waveOneNames.has(group)) : waveTwo
).map(({ group, hydrateGroups }) => ({ group, hydrate_groups: hydrateGroups }));
process.stdout.write(`${JSON.stringify({ include })}\n`);

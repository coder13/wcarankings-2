import { groupDependencyClosure, projectionGroup } from "./projection-groups.mjs";
import { argumentValue } from "./lib/cli.mjs";

const selected = (process.env.BUILD_GROUPS || "").split(",").filter(Boolean);
const wave = Number(argumentValue("wave") || 1);
if (!Number.isInteger(wave) || wave < 1) throw new Error("--wave must be a positive integer");
const selectedSet = new Set(selected);

const entries = selected.map((name) => {
  const group = projectionGroup(name);
  const dependencies = groupDependencyClosure([name], { includeSelected: false })
    .map((group) => group.name);
  return {
    group: name,
    hydrateGroups: dependencies.join(","),
    builtDependencies: group.dependencies.filter((dependency) => selectedSet.has(dependency)),
  };
});

const levels = new Map();
const visiting = new Set();
function buildLevel(name) {
  if (levels.has(name)) return levels.get(name);
  if (visiting.has(name)) throw new Error(`Projection dependency graph has a cycle at ${name}`);
  visiting.add(name);
  const entry = entries.find(({ group }) => group === name);
  const level = entry?.builtDependencies.length
    ? Math.max(...entry.builtDependencies.map(buildLevel)) + 1
    : 1;
  visiting.delete(name);
  levels.set(name, level);
  return level;
}

for (const { group } of entries) buildLevel(group);
const maxWave = Math.max(0, ...levels.values());
if (maxWave > 3) {
  throw new Error(`Projection dependency graph requires more than three build waves for wave ${maxWave}`);
}

const include = entries
  .filter(({ group }) => levels.get(group) === wave)
  .map(({ group, hydrateGroups }) => ({ group, hydrate_groups: hydrateGroups }));
process.stdout.write(`${JSON.stringify({ include })}\n`);

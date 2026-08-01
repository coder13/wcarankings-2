import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  projectionFingerprints,
  projectionReleasePlan,
  projectionSemanticPlan,
  semanticProjectionFingerprints,
} from "../scripts/projection-release-plan.mjs";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const exportId = "2026-07-30 00:00:23 UTC";

function productionState(fingerprints) {
  return {
    semanticFingerprints: Object.fromEntries(Object.entries(fingerprints.groups)
      .map(([name, group]) => [name, group.semanticFingerprint])),
    artifactFingerprints: Object.fromEntries(Object.entries(fingerprints.groups)
      .map(([name, group]) => [name, group.artifactFingerprint])),
  };
}

function availableArtifacts(fingerprints, names = Object.keys(fingerprints.groups)) {
  return Object.fromEntries(names.map((name) => [name, {
    valid: true,
    artifactFingerprint: fingerprints.groups[name].artifactFingerprint,
    digest: `sha256:${name}`,
  }]));
}

async function copySemanticInputs(destination, semantics) {
  for (const group of Object.values(semantics.groups)) {
    for (const path of group.inputs) {
      const target = join(destination, path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, await readFile(join(repositoryRoot, path)));
    }
  }
}

test("separates source-only semantic fingerprints from export artifacts", async () => {
  const semantics = await semanticProjectionFingerprints({ repositoryRoot });
  const first = await projectionFingerprints({ exportId, repositoryRoot, semanticFingerprints: semantics });
  const second = await projectionFingerprints({ exportId, repositoryRoot, semanticFingerprints: semantics });
  assert.deepEqual(first, second);
  assert.ok(semantics.groups["result-facts"].inputs.includes("sql/ranking-projections/result_facts.sql"));
  assert.ok(!semantics.groups["sum-of-ranks"].inputs.includes("migrations/mysql/app/V13__person_ranking_lookup.sql"));
  assert.ok(!semantics.groups["result-facts"].inputs.includes("package-lock.json"));
  assert.ok(!semantics.groups["result-facts"].inputs.includes("docker-compose.yml"));
  assert.equal(
    first.groups["result-rankings"].dependencies["result-facts"],
    first.groups["result-facts"].artifactFingerprint,
  );
});

test("a cosmetic change finishes semantic planning without an export", async () => {
  const desired = await projectionFingerprints({ exportId, repositoryRoot });
  const plan = await projectionSemanticPlan({
    productionState: productionState(desired),
    repositoryRoot,
  });
  assert.equal(plan.required, false);
  assert.deepEqual(plan.changedGroups, []);
});

test("a new city group hydrates cached dependencies and builds only city-owned tasks", async () => {
  const desired = await projectionFingerprints({ exportId, repositoryRoot });
  const state = productionState(desired);
  state.semanticFingerprints["city-rankings"] = "stale";
  state.artifactFingerprints["city-rankings"] = "stale";
  const plan = await projectionReleasePlan({
    exportId,
    productionExportId: exportId,
    productionState: state,
    availableArtifacts: availableArtifacts(desired, ["result-facts", "competition-rankings"]),
    repositoryRoot,
  });
  assert.deepEqual(plan.releaseGroups, ["city-rankings"]);
  assert.deepEqual(plan.buildGroups, ["city-rankings"]);
  assert.deepEqual(plan.hydrateGroups, ["result-facts", "competition-rankings"]);
});

test("a result-facts semantic change selects only its downstream closure", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "projection-plan-"));
  const baselineSemantics = await semanticProjectionFingerprints({ repositoryRoot });
  await copySemanticInputs(temporaryRoot, baselineSemantics);
  const baseline = await projectionFingerprints({ exportId, repositoryRoot });
  const factsPath = join(temporaryRoot, "sql/ranking-projections/result_facts.sql");
  await writeFile(factsPath, `${await readFile(factsPath, "utf8")}\n-- semantic test\n`);
  const plan = await projectionSemanticPlan({
    productionState: productionState(baseline),
    repositoryRoot: temporaryRoot,
  });
  assert.deepEqual(plan.changedGroups, [
    "result-facts",
    "result-rankings",
    "city-rankings",
    "yearly-person-rankings",
  ]);
  assert.ok(!plan.changedGroups.includes("competition-rankings"));
  assert.ok(!plan.changedGroups.includes("sum-of-ranks"));
});

test("an exact same-export artifact is restored without SQL execution", async () => {
  const desired = await projectionFingerprints({ exportId, repositoryRoot });
  const state = productionState(desired);
  state.semanticFingerprints["sum-of-ranks"] = "stale";
  state.artifactFingerprints["sum-of-ranks"] = "stale";
  const plan = await projectionReleasePlan({
    exportId,
    productionExportId: exportId,
    productionState: state,
    availableArtifacts: availableArtifacts(desired, ["sum-of-ranks"]),
    repositoryRoot,
  });
  assert.deepEqual(plan.cachedGroups, ["sum-of-ranks"]);
  assert.deepEqual(plan.buildGroups, []);
  assert.deepEqual(plan.releaseGroups, ["sum-of-ranks"]);
});

test("a new export selects every group while reusing exact artifacts", async () => {
  const desired = await projectionFingerprints({ exportId, repositoryRoot });
  const plan = await projectionReleasePlan({
    exportId,
    productionExportId: "2026-07-29T00:00:23Z",
    productionState: productionState(desired),
    availableArtifacts: availableArtifacts(desired),
    repositoryRoot,
  });
  assert.equal(plan.exportChanged, true);
  assert.equal(plan.releaseGroups.length, 7);
  assert.equal(plan.cachedGroups.length, 7);
  assert.deepEqual(plan.buildGroups, []);
});

test("a corrupt exact artifact is quarantined and rebuilt", async () => {
  const desired = await projectionFingerprints({ exportId, repositoryRoot });
  const state = productionState(desired);
  state.semanticFingerprints.compatibility = "stale";
  state.artifactFingerprints.compatibility = "stale";
  const plan = await projectionReleasePlan({
    exportId,
    productionExportId: exportId,
    productionState: state,
    availableArtifacts: {
      compatibility: {
        valid: false,
        artifactFingerprint: desired.groups.compatibility.artifactFingerprint,
      },
    },
    repositoryRoot,
  });
  assert.deepEqual(plan.buildGroups, ["compatibility"]);
});

import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "bun:test";
import {
  projectionFingerprints,
  semanticProjectionFingerprints,
} from "../data-tools/projections/release/fingerprints.ts";
import { projectionReleasePlan } from "../data-tools/projections/release/plan.ts";
import { projectionSemanticPlan } from "../data-tools/projections/release/semantic-plan.ts";

const repositoryRoot = join(import.meta.dirname, "..");
const exportId = "2026-07-30T00:00:30Z";

function productionState(fingerprints) {
  return {
    exportId,
    semanticFingerprints: Object.fromEntries(
      Object.entries(fingerprints.groups).map(([name, group]) => [
        name,
        group.semanticFingerprint,
      ]),
    ),
    artifactFingerprints: Object.fromEntries(
      Object.entries(fingerprints.groups).map(([name, group]) => [
        name,
        group.artifactFingerprint,
      ]),
    ),
  };
}

function availableArtifacts(
  fingerprints,
  names = Object.keys(fingerprints.groups),
) {
  return Object.fromEntries(
    names.map((name) => [
      name,
      {
        valid: true,
        artifactFingerprint: fingerprints.groups[name].artifactFingerprint,
        ref: `ghcr.io/coder13/wcarankings-projection-${name}:test`,
        digest: `sha256:${"a".repeat(64)}`,
      },
    ]),
  );
}

async function copySemanticInputs(targetRoot, semantics) {
  for (const group of Object.values(semantics.groups)) {
    for (const relativePath of group.inputs) {
      const source = join(repositoryRoot, relativePath);
      const target = join(targetRoot, relativePath);
      await mkdir(dirname(target), { recursive: true });
      await cp(source, target);
    }
  }
}

test("unchanged projection semantics do not resolve or build a release", async () => {
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
    availableArtifacts: availableArtifacts(desired, ["result-facts"]),
    repositoryRoot,
  });
  assert.deepEqual(plan.releaseGroups, ["city-rankings"]);
  assert.deepEqual(plan.buildGroups, ["city-rankings"]);
  assert.deepEqual(plan.hydrateGroups, ["result-facts"]);
});

test("a result-facts semantic change selects only its downstream closure", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "projection-plan-"));
  const baselineSemantics = await semanticProjectionFingerprints({
    repositoryRoot,
  });
  await copySemanticInputs(temporaryRoot, baselineSemantics);
  const baseline = await projectionFingerprints({ exportId, repositoryRoot });
  const factsPath = join(
    temporaryRoot,
    "data-tools/projection-catalog/core/result-facts/result_facts.sql",
  );
  await writeFile(
    factsPath,
    `${await readFile(factsPath, "utf8")}\n-- semantic test\n`,
  );
  const plan = await projectionSemanticPlan({
    productionState: productionState(baseline),
    repositoryRoot: temporaryRoot,
  });
  assert.deepEqual(plan.changedGroups, [
    "result-facts",
    "ranking-tables",
    "person-shared-grains",
    "result-rankings",
    "person-event-rankings",
    "person-competition-rankings",
    "person-pr-streak-rankings",
    "person-activity-rankings",
    "city-rankings",
    "sum-of-ranks",
    "yearly-person-rankings",
    "person-medal-rankings",
  ]);
  assert.ok(!plan.changedGroups.includes("competition-rankings"));
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
  assert.deepEqual(
    [...plan.releaseGroups].sort(),
    Object.keys(desired.groups).sort(),
  );
  assert.deepEqual(
    [...plan.cachedGroups].sort(),
    Object.keys(desired.groups).sort(),
  );
  assert.deepEqual(plan.buildGroups, []);
});

test("a corrupt exact artifact is quarantined and rebuilt", async () => {
  const desired = await projectionFingerprints({ exportId, repositoryRoot });
  const state = productionState(desired);
  state.semanticFingerprints["ranking-tables"] = "stale";
  state.artifactFingerprints["ranking-tables"] = "stale";
  const plan = await projectionReleasePlan({
    exportId,
    productionExportId: exportId,
    productionState: state,
    availableArtifacts: {
      "ranking-tables": {
        valid: false,
        artifactFingerprint:
          desired.groups["ranking-tables"].artifactFingerprint,
      },
      "result-facts": {
        valid: true,
        artifactFingerprint: desired.groups["result-facts"].artifactFingerprint,
      },
    },
    repositoryRoot,
  });
  assert.deepEqual(plan.buildGroups, ["ranking-tables"]);
  assert.deepEqual(plan.hydrateGroups, ["result-facts"]);
});

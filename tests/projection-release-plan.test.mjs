import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  projectionFingerprints,
  projectionReleasePlan,
} from "../scripts/projection-release-plan.mjs";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));

test("produces stable deployment fingerprints with transitive dependencies", async () => {
  const first = await projectionFingerprints({
    exportId: "2026-07-30 00:00:23 UTC",
    repositoryRoot,
  });
  const second = await projectionFingerprints({
    exportId: "2026-07-30 00:00:23 UTC",
    repositoryRoot,
  });
  assert.deepEqual(first, second);
  assert.ok(first.groups.core.inputs.includes("sql/ranking-projections/result_facts.sql"));
  assert.ok(first.groups["yearly-person-rankings"].inputs.includes("sql/ranking-projections/result_facts.sql"));
  assert.ok(first.groups["yearly-person-rankings"].inputs.includes("sql/ranking-projections/person_year_rankings_single.sql"));
  assert.ok(!first.groups["sum-of-ranks"].inputs.includes("sql/ranking-projections/result_facts.sql"));
});

test("selects only production groups whose fingerprints differ", async () => {
  const desired = await projectionFingerprints({
    exportId: "2026-07-30 00:00:23 UTC",
    repositoryRoot,
  });
  const productionState = {
    version: 1,
    groups: {
      core: { fingerprint: desired.groups.core.fingerprint },
      "sum-of-ranks": { fingerprint: "stale" },
      "yearly-person-rankings": {
        fingerprint: desired.groups["yearly-person-rankings"].fingerprint,
      },
    },
  };
  const plan = await projectionReleasePlan({
    exportId: desired.exportId,
    productionState,
    repositoryRoot,
  });
  assert.deepEqual(plan.requiredGroups, ["sum-of-ranks"]);
});

test("changes dependent fingerprints when result facts change", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "projection-plan-"));
  const baseline = await projectionFingerprints({
    exportId: "2026-07-30 00:00:23 UTC",
    repositoryRoot,
  });
  for (const group of Object.values(baseline.groups)) {
    for (const path of group.inputs) {
      const destination = join(temporaryRoot, path);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, await readFile(new URL(`../${path}`, import.meta.url)));
    }
  }
  const factsPath = join(temporaryRoot, "sql/ranking-projections/result_facts.sql");
  await writeFile(factsPath, `${await readFile(factsPath, "utf8")}\n-- fingerprint test\n`);
  const changed = await projectionFingerprints({
    exportId: baseline.exportId,
    repositoryRoot: temporaryRoot,
  });
  assert.notEqual(changed.groups.core.fingerprint, baseline.groups.core.fingerprint);
  assert.notEqual(
    changed.groups["yearly-person-rankings"].fingerprint,
    baseline.groups["yearly-person-rankings"].fingerprint,
  );
  assert.equal(
    changed.groups["sum-of-ranks"].fingerprint,
    baseline.groups["sum-of-ranks"].fingerprint,
  );
});

test("a new raw export expands a partial request to every projection group", async () => {
  const plan = await projectionReleasePlan({
    exportId: "2026-07-30 00:00:23 UTC",
    productionExportId: "2026-07-29 00:00:22 UTC",
    productionState: {},
    selectedGroups: ["sum-of-ranks"],
    repositoryRoot,
  });
  assert.equal(plan.exportChanged, true);
  assert.equal(plan.expandedToAllGroups, true);
  assert.deepEqual(plan.requiredGroups, [
    "core",
    "sum-of-ranks",
    "yearly-person-rankings",
  ]);
});

test("a UI-only change invalidates no projection group", async () => {
  const desired = await projectionFingerprints({
    exportId: "2026-07-30 00:00:23 UTC",
    repositoryRoot,
  });
  const productionState = {
    fingerprints: Object.fromEntries(
      Object.entries(desired.groups).map(([group, value]) => [group, value.fingerprint]),
    ),
  };
  const plan = await projectionReleasePlan({
    exportId: desired.exportId,
    productionExportId: desired.exportId,
    productionState,
    repositoryRoot,
  });
  assert.equal(plan.required, false);
  assert.deepEqual(plan.requiredGroups, []);
});

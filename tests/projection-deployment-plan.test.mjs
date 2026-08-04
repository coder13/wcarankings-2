import assert from "node:assert/strict";
import { test } from "bun:test";
import {
  deploymentInput,
  validateArtifactMetadata,
  validateRawRequirement,
} from "../scripts/projections/planning/plan-projection-deployment.ts";

function environment(overrides = {}) {
  return {
    ARTIFACT_ID: "42",
    ARTIFACT_NAME: "projection-release-42",
    ARTIFACT_RUN_ID: "24",
    DATA_TOOLS_IMAGE: `ghcr.io/coder13/wcarankings@sha256:${"a".repeat(64)}`,
    EXPECTED_MANIFEST_SHA256: "b".repeat(64),
    EXPECTED_SOURCE_SHA: "c".repeat(40),
    FLYWAY_IMAGE: `ghcr.io/coder13/flyway@sha256:${"d".repeat(64)}`,
    GITHUB_REPOSITORY: "coder13/wcarankings-2",
    PRODUCTION_WCA_EXPORT_VALUE: "2026-08-04T00:00:00Z",
    PROJECTION_GROUPS: "ranking-tables,result-facts",
    WCA_EXPORT_DATE: "2026-08-04",
    WCA_EXPORT_VALUE: "2026-08-04T00:00:00Z",
    ...overrides,
  };
}

test("deployment input parses immutable release values", () => {
  const input = deploymentInput(environment());
  assert.deepEqual(input.groups, ["ranking-tables", "result-facts"]);
  assert.equal(input.artifactId, "42");
  assert.equal(input.wcaExportValue, "2026-08-04T00:00:00.000Z");
});

test("deployment input rejects an unknown projection group", () => {
  assert.throws(
    () => deploymentInput(environment({ PROJECTION_GROUPS: "unknown" })),
    /Unknown deployment projection group/,
  );
});

test("deployment input normalizes equivalent export identities", () => {
  const input = deploymentInput(
    environment({
      PRODUCTION_WCA_EXPORT_VALUE: "2026-08-04 00:00:00 UTC",
    }),
  );
  assert.equal(input.productionExportValue, input.wcaExportValue);
});

test("a changed export requires a raw artifact", () => {
  assert.throws(
    () =>
      validateRawRequirement({
        hasRaw: false,
        normalizedBuildExport: "2026-08-04T00:00:00.000Z",
        normalizedProductionExport: "2026-08-03T00:00:00.000Z",
      }),
    /must include the raw export/,
  );
});

test("artifact metadata must match the immutable coordinate", () => {
  const input = deploymentInput(environment());
  validateArtifactMetadata(
    { name: input.artifactName, workflow_run: { id: 24 }, expired: false },
    input,
  );
  assert.throws(
    () =>
      validateArtifactMetadata(
        { name: input.artifactName, workflow_run: { id: 25 }, expired: false },
        input,
      ),
    /does not match/,
  );
});

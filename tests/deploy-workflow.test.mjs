import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  SERVER_COMPONENT_PATHS,
  serverComponentFingerprints,
} from "../scripts/server-component-fingerprints.mjs";

async function workflow(name) {
  return readFile(new URL(`../.github/workflows/${name}`, import.meta.url), "utf8");
}

const [
  serverRelease,
  projectionRelease,
  planner,
  builder,
  serverBuild,
  serverDeploy,
  projectionDeploy,
  pullRequest,
  flywayHistoryRepair,
] = await Promise.all([
  workflow("server-production.yml"),
  workflow("projection-release.yml"),
  workflow("plan-projections.yml"),
  workflow("build-projections.yml"),
  workflow("build-server.yml"),
  workflow("deploy-server.yml"),
  workflow("deploy-projections.yml"),
  workflow("pull-request.yml"),
  readFile(new URL("../scripts/prepare-flyway-history.mjs", import.meta.url), "utf8"),
]);

test("server and projection releases have independent triggers and queues", () => {
  assert.match(serverRelease, /push:[\s\S]*branches: \[main\]/);
  assert.match(projectionRelease, /push:[\s\S]*schedule:[\s\S]*workflow_dispatch:/);
  assert.match(serverRelease, /production-server-release/);
  assert.match(projectionRelease, /production-projection-release/);
  assert.match(serverRelease, /cancel-in-progress: false/);
  assert.match(projectionRelease, /cancel-in-progress: false/);
  assert.doesNotMatch(serverRelease, /plan-projections|build-projections|deploy-projections/);
  assert.doesNotMatch(projectionRelease, /deploy-server\.yml/);
});

test("semantic detection precedes and gates WCA export resolution", () => {
  const semanticIndex = planner.indexOf("Detect semantic projection changes before contacting WCA");
  const wcaIndex = planner.indexOf("Resolve latest WCA export");
  assert.ok(semanticIndex >= 0 && wcaIndex > semanticIndex);
  assert.match(planner, /steps\.semantic\.outputs\.required == 'true'/);
  assert.match(planner, /No semantic projection inputs changed; the WCA export was not resolved/);
  assert.match(projectionRelease, /refresh_export: \$\{\{ github\.event_name != 'push' \}\}/);
});

test("incremental planning classifies active, cached, build, and hydrate groups", () => {
  assert.match(planner, /Finalize active, cached, build, and hydrate groups/);
  assert.match(planner, /available_artifacts/);
  assert.match(planner, /build_groups/);
  assert.match(planner, /hydrate_groups/);
  assert.match(planner, /Quarantining corrupt projection artifact/);
  assert.match(projectionRelease, /supersession:/);
  assert.match(projectionRelease, /ref: main/);
});

test("group artifacts use GHCR and cached dependencies hydrate before a two-worker build", () => {
  assert.match(builder, /oras pull "\$\{repository\}@\$\{digest\}"/);
  assert.match(builder, /oras push "\$ref"/);
  assert.doesNotMatch(builder, /projection-release-group-/);
  assert.match(builder, /publish-projection-transfer\.mjs --hydrate/);
  assert.match(builder, /--satisfied-groups="\$HYDRATE_GROUPS"/);
  assert.match(builder, /WCA_PROJECTION_BUILD_CONCURRENCY=2/);
  assert.match(builder, /repair-\$\{GITHUB_RUN_ID\}-\$\{GITHUB_RUN_ATTEMPT\}/);
});

test("component images are independently identified and production requires PR validation", () => {
  const componentFingerprints = serverComponentFingerprints();
  assert.match(componentFingerprints.app, /^[0-9a-f]{64}$/);
  assert.match(componentFingerprints.flyway, /^[0-9a-f]{64}$/);
  assert.match(componentFingerprints.dataTools, /^[0-9a-f]{64}$/);
  assert.equal(new Set(Object.values(componentFingerprints)).size, 3);
  for (const buildInput of [".dockerignore", "vite.config.ts", "vite-env.d.ts", "postcss.config.mjs"]) {
    assert.ok(SERVER_COMPONENT_PATHS.app.includes(buildInput));
  }
  assert.match(serverBuild, /Resolve independent component identities/);
  assert.match(serverBuild, /component-\$\{APP_HASH\}/);
  assert.match(serverBuild, /component-\$\{FLYWAY_HASH\}/);
  assert.match(serverBuild, /component-\$\{DATA_TOOLS_HASH\}/);
  assert.match(serverRelease, /require_existing: \$\{\{ inputs\.emergency_rebuild != true \}\}/);
  assert.match(projectionRelease, /components: flyway,data-tools/);
  assert.match(pullRequest, /Restore unchanged component images/);
  assert.match(pullRequest, /Publish changed verified component images/);
  assert.doesNotMatch(serverBuild, /APP_COMMIT_SHA=/);
  assert.match(serverDeploy, /DEPLOYED_MAIN_SHA='\$SOURCE_SHA'/);
});

test("candidate staging is monitored and the activation lock stays short", () => {
  const importIndex = projectionDeploy.indexOf("during_projection_import");
  const lockIndex = projectionDeploy.indexOf("projection-activation.lock");
  assert.ok(importIndex >= 0 && lockIndex > importIndex);
  assert.match(projectionDeploy, /--max-time 2/);
  assert.match(projectionDeploy, /while sleep 5/);
  assert.match(projectionDeploy, /failures.*-ge 3/);
  assert.match(projectionDeploy, /"rolledBack":true/);
  assert.match(projectionDeploy, /production-mutation\.lock/);
  assert.match(serverDeploy, /server-release\.lock/);
  assert.match(serverDeploy, /production-mutation\.lock/);
  assert.match(projectionDeploy, /wait_for_database_cooldown/);
  assert.match(serverDeploy, /wait_for_database_cooldown/);
  assert.match(projectionDeploy, /verify-active/);
  assert.match(serverDeploy, /flyway_schema_history_results/);
  assert.match(projectionDeploy, /flyway_schema_history_results/);
  assert.match(serverDeploy, /wcarankings-data-tools:artifact-\*\) continue/);
  assert.match(serverDeploy, /FLYWAY_IMAGE_CHANGED.*\|\|.*DATA_TOOLS_IMAGE_CHANGED/);
  assert.match(projectionDeploy, /compose_base=.*\.projection-compose-/);
  assert.match(projectionDeploy, /no longer matches this release; marking it superseded/);
  assert.doesNotMatch(projectionDeploy, /stale; rebuilding its candidate/);
  const composeBackup = serverDeploy.indexOf("cp /srv/wcarankings/docker-compose.yml");
  const composeChange = serverDeploy.indexOf('if [ "$COMPOSE_CONFIG_CHANGED" = true ]');
  const caddyBackup = serverDeploy.indexOf("cp /srv/wcarankings/ops/Caddyfile");
  const caddyChange = serverDeploy.indexOf('if [ "$PROXY_CONFIG_CHANGED" = true ]');
  assert.ok(composeBackup >= 0 && composeBackup < composeChange);
  assert.ok(caddyBackup >= 0 && caddyBackup < caddyChange);
  assert.match(flywayHistoryRepair, /script NOT IN/);
  assert.match(flywayHistoryRepair, /script IN/);
  assert.match(flywayHistoryRepair, /type = 'BASELINE' AND version IN/);
  assert.match(flywayHistoryRepair, /type = 'BASELINE'[\s\S]*version NOT IN/);
  assert.doesNotMatch(flywayHistoryRepair, /SELECT \* FROM .* WHERE version IS NULL OR version IN/);
  assert.match(pullRequest, /Exercise legacy Flyway baseline history split/);
  assert.match(pullRequest, /V8__system_list_definitions\.sql/);
  assert.match(pullRequest, /V8__result_attempts_lookup\.sql/);
  assert.match(pullRequest, /type = 'BASELINE'/);
});

test("production staging remains sequential and activation is atomic", () => {
  assert.match(projectionDeploy, /for group in \$\(printf '%s' "\$PROJECTION_GROUPS"/);
  assert.match(projectionDeploy, /publish-projection-transfer\.mjs[\s\S]*--prepare-only/);
  assert.match(projectionDeploy, /activate-ranking-generation\.mjs activate/);
  assert.match(projectionDeploy, /activate-ranking-generation\.mjs rollback/);
});

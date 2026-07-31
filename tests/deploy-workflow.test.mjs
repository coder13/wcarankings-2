import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function workflow(name) {
  return readFile(
    new URL(`../.github/workflows/${name}`, import.meta.url),
    "utf8",
  );
}

const [
  release,
  refresh,
  planner,
  serverBuild,
  projectionBuild,
  pullRequest,
  serverDeploy,
  projectionDeploy,
  approvedDataTools,
  activation,
  syncService,
  prProjectionRelease,
] = await Promise.all([
  workflow("deploy.yml"),
  workflow("refresh-rankings.yml"),
  workflow("plan-projections.yml"),
  workflow("build-server.yml"),
  workflow("build-projections.yml"),
  workflow("pull-request.yml"),
  workflow("deploy-server.yml"),
  workflow("deploy-projections.yml"),
  workflow("resolve-approved-data-tools.yml"),
  readFile(new URL("../scripts/activate-ranking-generation.mjs", import.meta.url), "utf8"),
  readFile(new URL("../ops/wcarankings-sync.service", import.meta.url), "utf8"),
  workflow("pr-projection-release.yml"),
]);

test("composes the main release from independently callable workflow blocks", () => {
  const deployServer = release.match(/deploy_server:[\s\S]*?(?=\n  deploy_projections:)/)?.[0];
  assert.ok(deployServer, "the main release must define a server deployment job");
  assert.match(release, /'production-mutation'/);
  assert.match(release, /github\.repository == 'coder13\/wcarankings-2'/);
  assert.match(release, /'production-mutation'[\s\S]*cancel-in-progress: false/);
  assert.doesNotMatch(release, /queue: max/);
  assert.match(release, /uses: \.\/\.github\/workflows\/plan-projections\.yml/);
  assert.match(release, /uses: \.\/\.github\/workflows\/build-server\.yml/);
  assert.match(release, /uses: \.\/\.github\/workflows\/build-projections\.yml/);
  assert.match(release, /uses: \.\/\.github\/workflows\/deploy-server\.yml/);
  assert.match(release, /uses: \.\/\.github\/workflows\/deploy-projections\.yml/);
  assert.match(
    deployServer,
    /needs:[\s\S]*- build_server/,
    "server deployment must wait for server images",
  );
  assert.doesNotMatch(
    deployServer,
    /needs\.build_projections\.result|- build_projections|- plan_projections/,
    "server deployment must not wait for projection planning or artifacts",
  );
  assert.match(
    release,
    /deploy_projections:[\s\S]*needs:[\s\S]*- deploy_server/,
    "the compatible server must pass smoke checks before projections publish",
  );
  assert.match(release, /needs\.plan_projections\.outputs\.required == 'true'/);
});

test("daily refresh reuses only the projection lego blocks", () => {
  assert.match(refresh, /workflow_dispatch:/);
  assert.match(refresh, /github\.repository == 'coder13\/wcarankings-2'/);
  assert.match(refresh, /schedule:/);
  assert.match(refresh, /cron: "17 5 \* \* \*"/);
  assert.match(refresh, /'production-mutation'/);
  assert.match(refresh, /'production-mutation'[\s\S]*cancel-in-progress: false/);
  assert.doesNotMatch(refresh, /queue: max/);
  assert.match(refresh, /plan-projections\.yml/);
  assert.match(refresh, /build-projections\.yml/);
  assert.match(refresh, /deploy-projections\.yml/);
  assert.match(refresh, /resolve-approved-data-tools\.yml/);
  assert.match(refresh, /ref: \$\{\{ needs\.resolve_approved_data_tools\.outputs\.source_sha \}\}/);
  assert.match(approvedDataTools, /server-release-state\.json/);
  assert.doesNotMatch(refresh, /build-server\.yml/);
  assert.doesNotMatch(refresh, /deploy-server\.yml/);
});

test("plans projection changes from one dependency-aware fingerprint implementation", () => {
  assert.match(planner, /projection-release-plan\.mjs/);
  assert.match(planner, /--production-export-id=\$PRODUCTION_EXPORT_VALUE/);
  assert.match(planner, /Expanded partial request for new export/);
  for (const source of [release, refresh, planner, projectionBuild]) {
    assert.doesNotMatch(source, /hashFiles\(/);
  }
});

test("builds one checksummed artifact containing only selected groups", () => {
  assert.match(projectionBuild, /workflow_call:/);
  assert.match(projectionBuild, /projection-build-plan\.mjs --groups="\$SELECTED_GROUPS"/);
  assert.match(projectionBuild, /projection-release-artifact\.mjs create/);
  assert.match(projectionBuild, /actions\/cache\/restore@v4/);
  assert.match(projectionBuild, /projection-release-group-core-/);
  assert.match(projectionBuild, /Determine projection cache misses/);
  assert.match(projectionBuild, /actions\/upload-artifact@v4/);
  assert.match(projectionBuild, /artifact_retention_days:/);
  assert.match(projectionBuild, /retention-days: \$\{\{ inputs\.artifact_retention_days \}\}/);
  assert.match(projectionBuild, /artifact_id:/);
  assert.match(projectionBuild, /artifact_run_id:/);
  assert.match(projectionBuild, /wca-export\.sql\.zip/);
  assert.match(projectionBuild, /docker compose down --volumes --remove-orphans/);
  assert.match(projectionBuild, /CREATE TABLE IF NOT EXISTS result_attempts/);
  assert.match(projectionDeploy, /Projection compatibility: artifact format=/);
  assert.match(projectionDeploy, /Projection artifact compatibility does not match/);
});

test("keeps applied migrations immutable while preparing disposable validation databases", () => {
  assert.match(pullRequest, /CREATE TABLE IF NOT EXISTS export_metadata/);
  assert.match(pullRequest, /CREATE TABLE IF NOT EXISTS result_attempts/);
  assert.match(pullRequest, /docker compose run --rm[\s\S]*flyway migrate/);
});

test("builds labeled PR projections and deploys the exact merged artifact", () => {
  assert.match(prProjectionRelease, /types:[\s\S]*- labeled[\s\S]*- closed/);
  assert.match(prProjectionRelease, /github\.repository == 'coder13\/wcarankings-2'/);
  assert.match(prProjectionRelease, /github\.event\.label\.name == 'build-projections'/);
  assert.match(prProjectionRelease, /force_rebuild: true/);
  assert.match(prProjectionRelease, /include_raw: true/);
  assert.match(prProjectionRelease, /artifact_retention_days: 90/);
  assert.match(prProjectionRelease, /actions\/workflows\/pr-projection-release\.yml\/runs/);
  assert.match(prProjectionRelease, /head_sha == \$sha/);
  assert.match(prProjectionRelease, /actions\/download-artifact@v4/);
  assert.match(prProjectionRelease, /artifact_id:/);
  assert.match(prProjectionRelease, /deploy-projections\.yml/);
  assert.match(prProjectionRelease, /'production-mutation'/);
  assert.match(
    prProjectionRelease,
    /github\.event\.action == 'labeled'[\s\S]*github\.event\.label\.name == 'build-projections'[\s\S]*production-mutation/,
  );
  assert.match(prProjectionRelease, /format\('pr-projection-noop-\{0\}', github\.run_id\)/);
  assert.match(prProjectionRelease, /cancel-in-progress: false/);
  assert.doesNotMatch(prProjectionRelease, /queue: max/);
  assert.match(projectionDeploy, /Projection export identity: build=/);
  assert.match(projectionDeploy, /if \[ "\$WCA_EXPORT_VALUE" != "\$PRODUCTION_WCA_EXPORT_VALUE" \]; then/);
  assert.doesNotMatch(
    projectionDeploy,
    /\.raw == null/,
    "same-export releases may still carry a coherent PR raw export",
  );
});

test("builds and verifies digest-addressed server images", () => {
  assert.match(serverBuild, /workflow_call:/);
  assert.match(serverBuild, /tree-\$\{SOURCE_TREE\}/);
  assert.match(serverBuild, /docker\/build-push-action@v6/);
  assert.match(serverBuild, /push: true/);
  assert.match(serverBuild, /RepoDigests/);
  assert.match(serverBuild, /app_image:/);
  assert.match(serverBuild, /flyway_image:/);
  assert.match(serverBuild, /data_tools_image:/);
  assert.match(serverBuild, /Dockerfile\.data-tools/);
  assert.match(serverBuild, /require_existing/);
  assert.match(
    release,
    /build_server:[\s\S]*uses: \.\/\.github\/workflows\/build-server\.yml[\s\S]*require_existing: false/,
    "production releases may build missing verified images for the exact release commit",
  );
  assert.match(serverBuild, /config_checksum:/);
});

test("server deployment retries real endpoints and rolls back with diagnostics", () => {
  assert.match(serverDeploy, /github\.repository == 'coder13\/wcarankings-2'/);
  assert.match(projectionDeploy, /github\.repository == 'coder13\/wcarankings-2'/);
  assert.match(serverDeploy, /@sha256:\[0-9a-f\]\{64\}/);
  assert.match(serverDeploy, /retry_endpoint "\/api\/health\/ready" 30 2/);
  assert.match(serverDeploy, /retry_endpoint "\/api\/rankings\?eventId=333&result=single&start=0&limit=1" 10 3 "Core ranking"/);
  assert.doesNotMatch(serverDeploy, /year=2024/);
  assert.doesNotMatch(serverDeploy, /eventId=SOR/);
  assert.match(projectionDeploy, /retry_endpoint "\/api\/rankings\?eventId=333&result=single&year=2024/);
  assert.match(serverDeploy, /HTTP \$\{status:-curl-error\}/);
  assert.match(serverDeploy, /docker compose logs --tail=200 app proxy flyway/);
  assert.match(serverDeploy, /docker tag wcarankings-app:previous wcarankings-app:latest/);
  assert.match(serverDeploy, /Rollback readiness check passed/);
  assert.match(serverDeploy, /Previous app image retained for the next rollback/);
  assert.match(serverDeploy, /check-release-compatibility\.mjs/);
  assert.match(
    serverDeploy,
    /if \[\[ ! "\$dataset_schema_version" =~ \^\[1-9\]\[0-9\]\*\$ \]\]; then[\s\S]*dataset_schema_version=1/,
    "an empty or invalid pre-cutover state must use the baseline dataset schema",
  );
  assert.match(serverDeploy, /PROXY_CONFIG_CHANGED/);
  assert.match(serverDeploy, /server-release-state\.json/);
  assert.match(serverDeploy, /production-mutation\.lock/);
  assert.match(serverDeploy, /after_migrations_before_server_switch/);
  assert.match(serverDeploy, /after_server_switch_before_public_verification/);
});

test("runs app and result migrations in separate deployment lanes", async () => {
  const [dockerfile, compose, dataToolsDockerfile] = await Promise.all([
    readFile(new URL("../Dockerfile.flyway", import.meta.url), "utf8"),
    readFile(new URL("../docker-compose.yml", import.meta.url), "utf8"),
    readFile(new URL("../Dockerfile.data-tools", import.meta.url), "utf8"),
  ]);
  assert.match(dockerfile, /COPY migrations\/mysql\/app \/flyway\/migrations\/app/);
  assert.match(dockerfile, /COPY migrations\/mysql\/results \/flyway\/migrations\/results/);
  assert.match(dataToolsDockerfile, /COPY --chown=data-tools:data-tools migrations\/mysql \.\/migrations\/mysql/);
  assert.match(compose, /FLYWAY_LOCATIONS: filesystem:\/flyway\/migrations\/app/);
  assert.match(compose, /FLYWAY_TABLE: flyway_schema_history_app/);
  assert.match(serverDeploy, /docker compose run --rm flyway migrate/);
  assert.match(serverDeploy, /prepare-flyway-history\.mjs/);
  assert.match(projectionBuild, /FLYWAY_LOCATIONS=filesystem:\/flyway\/migrations\/results/);
  assert.match(projectionBuild, /FLYWAY_TABLE=flyway_schema_history_results/);
  assert.match(projectionDeploy, /FLYWAY_LOCATIONS=filesystem:\/flyway\/migrations\/results/);
  assert.match(projectionDeploy, /CREATE TABLE IF NOT EXISTS result_attempts/);
  assert.match(projectionDeploy, /FLYWAY_TABLE=flyway_schema_history_results/);
  assert.match(pullRequest, /FLYWAY_LOCATIONS=filesystem:\/flyway\/migrations\/results/);
});

test("projection deployment uses exact artifacts and atomically activates a coherent generation", () => {
  assert.match(projectionDeploy, /projection-release-artifact\.mjs verify/);
  assert.match(projectionDeploy, /actions\/artifacts\/\$\{ARTIFACT_ID\}/);
  assert.match(projectionDeploy, /workflow_run\.id == \$run/);
  assert.match(projectionDeploy, /run-id: \$\{\{ inputs\.artifact_run_id \}\}/);
  assert.match(projectionDeploy, /gzip -t/);
  assert.match(projectionDeploy, /--prepare-only/);
  assert.match(projectionDeploy, /--expected-export-date="\$WCA_EXPORT_VALUE"/);
  assert.match(projectionDeploy, /sync-wca-export\.mjs[\s\S]*--raw-only/);
  assert.match(projectionDeploy, /publish-projection-transfer\.mjs/);
  assert.match(projectionDeploy, /check-ranking-projections\.mjs/);
  assert.match(projectionDeploy, /activate-ranking-generation\.mjs activate/);
  assert.match(projectionDeploy, /activate-ranking-generation\.mjs rollback/);
  assert.match(projectionDeploy, /production-mutation\.lock/);
  assert.match(projectionDeploy, /flock -w 60/);
  assert.match(activation, /GET_LOCK/);
  assert.match(projectionDeploy, /projection-deploy-\$\{ARTIFACT_ID\}\.phase/);
  assert.match(projectionDeploy, /DROP DATABASE IF EXISTS \\`\$PREVIOUS_SCHEMA\\`/);
  assert.doesNotMatch(projectionDeploy, /force-recreate app/);
});

test("failure injection covers every critical server and data boundary", () => {
  for (const boundary of [
    "after_raw_import",
    "during_projection_import",
    "before_production_state_update",
    "after_atomic_table_rename",
    "after_projection_activation_before_smoke",
  ]) {
    assert.match(
      `${projectionDeploy}\n${serverDeploy}\n${activation}`,
      new RegExp(boundary),
    );
  }
  assert.match(serverDeploy, /after_migrations_before_server_switch/);
  assert.match(serverDeploy, /after_server_switch_before_public_verification/);
});

test("code-only and data-only control flow stays isolated", () => {
  assert.match(release, /needs\.plan_projections\.outputs\.required == 'true'/);
  assert.match(release, /deploy_projections:[\s\S]*needs:[\s\S]*- deploy_server/);
  assert.doesNotMatch(refresh, /deploy_server|build_server|force-recreate app/);
  assert.match(release, /cancel-in-progress: false/);
  assert.match(refresh, /cancel-in-progress: false/);
});

test("external role API refreshes cannot fail an activated dataset", () => {
  assert.match(projectionDeploy, /Refresh WCA Board list[\s\S]*continue-on-error: true/);
  assert.match(projectionDeploy, /Refresh WCA Delegates list[\s\S]*continue-on-error: true/);
});

test("keeps the old server-side refresh timer disabled", () => {
  assert.match(syncService, /Deprecated/);
  assert.match(
    syncService,
    /ConditionPathExists=\/srv\/wcarankings\/ENABLE_DEPRECATED_SERVER_REFRESH/,
  );
  assert.doesNotMatch(syncService, /sync-wca-export\.mjs/);
});

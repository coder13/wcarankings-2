import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

function serverCooldownFunctions() {
  const start = serverDeploy.indexOf("            read_database_cpu() {");
  const end = serverDeploy.indexOf("            exec 9>/srv/wcarankings/server-release.lock", start);
  assert.ok(start >= 0 && end > start);
  return serverDeploy.slice(start, end).split("\n")
    .map((line) => line.replace(/^ {12}/, ""))
    .join("\n");
}

function preSwitchTagRecoveryFunction() {
  const start = serverDeploy.indexOf("            restore_previous_app_tag() {");
  const end = serverDeploy.indexOf("            restore_previous_app_tag\n", start);
  assert.ok(start >= 0 && end > start);
  return serverDeploy.slice(start, end).split("\n")
    .map((line) => line.replace(/^ {12}/, ""))
    .join("\n");
}

function exercisePreSwitchTagRecovery(appImageChanged) {
  return spawnSync("sh", ["-eu", "-c", `${preSwitchTagRecoveryFunction()}
docker() { printf 'docker %s\\n' "$*"; }
APP_IMAGE_CHANGED=${appImageChanged}
restore_previous_app_tag
`], { encoding: "utf8" });
}

function preSwitchConfigRecoveryFunction() {
  const start = serverDeploy.indexOf("            restore_staged_config() {");
  const end = serverDeploy.indexOf("            restore_staged_config \\\n", start);
  assert.ok(start >= 0 && end > start);
  return serverDeploy.slice(start, end).split("\n")
    .map((line) => line.replace(/^ {12}/, ""))
    .join("\n");
}

async function exercisePreSwitchConfigRecovery(hasMarker, approvedSourceSha = "") {
  const directory = await mkdtemp(join(tmpdir(), "wcarankings-config-recovery-"));
  const marker = join(directory, "config-staging");
  const composeTarget = join(directory, "compose");
  const composeBackup = join(directory, "compose.previous");
  const caddyTarget = join(directory, "Caddyfile");
  const caddyBackup = join(directory, "Caddyfile.previous");
  const releaseState = join(directory, "server-release-state.json");
  const sourceSha = "c".repeat(40);
  await Promise.all([
    writeFile(composeTarget, "active-compose-C\n"),
    writeFile(composeBackup, "approved-compose-B\n"),
    writeFile(caddyTarget, "active-caddy-C\n"),
    writeFile(caddyBackup, "approved-caddy-B\n"),
    ...(hasMarker ? [writeFile(marker, "staged\n")] : []),
    ...(approvedSourceSha ? [writeFile(releaseState, JSON.stringify({ sourceSha: approvedSourceSha }))] : []),
  ]);
  const result = spawnSync("sh", ["-eu", "-c", `${preSwitchConfigRecoveryFunction()}
restore_staged_config "$1" "$2" "$3" "$4" "$5" "$6" "$7"
`, "sh", marker, releaseState, sourceSha, composeTarget, composeBackup, caddyTarget, caddyBackup], { encoding: "utf8" });
  const state = {
    result,
    composeTarget: await readFile(composeTarget, "utf8"),
    composeBackup: await readFile(composeBackup, "utf8"),
    caddyTarget: await readFile(caddyTarget, "utf8"),
    caddyBackup: await readFile(caddyBackup, "utf8"),
    markerExists: await readFile(marker, "utf8").then(() => true, () => false),
    sourceSha,
  };
  await rm(directory, { recursive: true, force: true });
  return state;
}

function caddyFileChecksumResolverFunction() {
  const start = serverDeploy.indexOf("          resolve_approved_caddy_file_checksum() {");
  const end = serverDeploy.indexOf("          current_caddy_file=$(resolve_approved_caddy_file_checksum", start);
  assert.ok(start >= 0 && end > start);
  return serverDeploy.slice(start, end).split("\n")
    .map((line) => line.replace(/^ {10}/, ""))
    .join("\n");
}

function resolveCaddyFileChecksum(rawChecksum, compositeChecksum, sourceSha) {
  return spawnSync("bash", ["-e", "-o", "pipefail", "-c", `${caddyFileChecksumResolverFunction()}
resolve_approved_caddy_file_checksum "$1" "$2" "$3"
`, "bash", rawChecksum, compositeChecksum, sourceSha], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
  });
}

function approvedConfigRecoveryFunction() {
  const start = serverDeploy.indexOf("            recover_approved_config() {");
  const end = serverDeploy.indexOf("            recover_approved_config \\\n", start);
  assert.ok(start >= 0 && end > start);
  return serverDeploy.slice(start, end).split("\n")
    .map((line) => line.replace(/^ {12}/, ""))
    .join("\n");
}

async function exerciseApprovedConfigRecovery(targetContents, backupContents, expectedChecksum) {
  const directory = await mkdtemp(join(tmpdir(), "wcarankings-approved-config-"));
  const target = join(directory, "Caddyfile");
  const backup = join(directory, "Caddyfile.previous");
  await Promise.all([
    writeFile(target, targetContents),
    writeFile(backup, backupContents),
  ]);
  const result = spawnSync("sh", ["-eu", "-c", `${approvedConfigRecoveryFunction()}
recover_approved_config "$1" "$2" "$3" "Caddy configuration"
`, "sh", target, backup, expectedChecksum], { encoding: "utf8" });
  const finalContents = await readFile(target, "utf8");
  await rm(directory, { recursive: true, force: true });
  return { result, finalContents };
}

async function exerciseServerCooldown(cpuSamples) {
  const directory = await mkdtemp(join(tmpdir(), "wcarankings-cooldown-"));
  const sequenceFile = join(directory, "sequence");
  const indexFile = join(directory, "index");
  const docker = join(directory, "docker");
  await writeFile(sequenceFile, `${cpuSamples.join("\n")}\n`);
  await writeFile(indexFile, "1\n");
  await writeFile(docker, `#!/bin/sh
if [ "$1" = "compose" ]; then
  if [ "$2" = "ps" ]; then printf 'db\\n'; fi
  exit 0
fi
if [ "$1" = "stats" ]; then
  case " $* " in
    *" --format "*)
      index=$(cat "$CPU_INDEX_FILE")
      value=$(sed -n "\${index}p" "$CPU_SEQUENCE_FILE")
      if [ -z "$value" ]; then value=$(tail -n 1 "$CPU_SEQUENCE_FILE"); fi
      next=$((index + 1))
      printf '%s\\n' "$next" > "$CPU_INDEX_FILE"
      printf '%s%%%%\\n' "$value"
      ;;
    *) printf 'diagnostic\\n' ;;
  esac
  exit 0
fi
exit 1
`);
  await chmod(docker, 0o755);
  const script = `${serverCooldownFunctions()}
sleep() { :; }
measure_database_cpu_baseline
wait_for_database_cooldown
printf 'result baseline=%s delta=%s ceiling=%s\\n' "$DATABASE_CPU_BASELINE" "$DATABASE_CPU_DELTA" "$DATABASE_CPU_CEILING"
`;
  try {
    return spawnSync("sh", ["-eu", "-c", script], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${directory}:${process.env.PATH}`,
        CPU_SEQUENCE_FILE: sequenceFile,
        CPU_INDEX_FILE: indexFile,
      },
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

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
  const publishStart = builder.indexOf("      - name: Publish newly built group artifacts to GHCR");
  const publishEnd = builder.indexOf("      - name: Compose exact production release bundle", publishStart);
  assert.ok(publishStart >= 0 && publishEnd > publishStart);
  const publish = builder.slice(publishStart, publishEnd);
  assert.match(publish, /pushd "\$directory" >\/dev\/null/);
  assert.match(publish, /"projection-release\.json:application\/vnd\.cuberanks\.projection\.manifest\.v3\+json"/);
  assert.match(publish, /"\$archive:application\/vnd\.cuberanks\.projection\.sql\+gzip"/);
  assert.match(publish, /"\$metadata:application\/vnd\.cuberanks\.projection\.transfer\+json"/);
  assert.match(publish, /popd >\/dev\/null/);
  const orasPush = publish.match(/oras push "\$ref"[\s\S]*?popd >\/dev\/null/);
  assert.ok(orasPush, "the artifact publish must run from the artifact directory");
  assert.doesNotMatch(orasPush[0], /"\$directory\//);
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
  for (const workflow of [serverDeploy, projectionDeploy]) {
    assert.match(workflow, /measure_database_cpu_baseline/);
    assert.match(workflow, /DATABASE_CPU_BASELINE \* 0\.15/);
    assert.match(workflow, /delta < 10/);
    assert.match(workflow, /delta > 25/);
    assert.match(workflow, /cool_samples.*-ge 3/);
    assert.match(workflow, /while \[ "\$attempt" -le 60 \]/);
    assert.match(workflow, /Threads_running/);
    assert.doesNotMatch(workflow, /cpu < 50|cool below 50%/);
  }
  assert.match(projectionDeploy, /verify-active/);
  assert.match(serverDeploy, /flyway_schema_history_results/);
  const bootstrapIndex = serverDeploy.indexOf("activate-ranking-generation.mjs bootstrap");
  const mutationLockIndex = serverDeploy.lastIndexOf("production-mutation.lock", bootstrapIndex);
  const lastFlywayIndex = serverDeploy.lastIndexOf("flyway migrate", bootstrapIndex);
  const serverBaselineIndex = serverDeploy.lastIndexOf("measure_database_cpu_baseline", lastFlywayIndex);
  const serverCooldownIndex = serverDeploy.indexOf("wait_for_database_cooldown", lastFlywayIndex);
  const migrationConditionalEndIndex = serverDeploy.lastIndexOf("            fi", bootstrapIndex);
  const serverSwitchIndex = serverDeploy.indexOf("- name: Switch production server", bootstrapIndex);
  assert.ok(mutationLockIndex >= 0 && bootstrapIndex > mutationLockIndex);
  assert.ok(lastFlywayIndex >= 0 && bootstrapIndex > lastFlywayIndex);
  assert.ok(serverBaselineIndex > mutationLockIndex && serverBaselineIndex < lastFlywayIndex);
  assert.ok(serverCooldownIndex > lastFlywayIndex && bootstrapIndex > serverCooldownIndex);
  assert.ok(migrationConditionalEndIndex >= 0 && bootstrapIndex > migrationConditionalEndIndex);
  assert.ok(serverSwitchIndex > bootstrapIndex);
  assert.match(projectionDeploy, /flyway_schema_history_results/);
  assert.match(serverDeploy, /wcarankings-data-tools:artifact-\*\) continue/);
  assert.match(serverDeploy, /running_app_image=.*docker inspect.*\.Image/);
  assert.match(serverDeploy, /running_app_image.*=.*CANDIDATE_APP_IMAGE_ID/);
  assert.match(serverDeploy, /docker tag "\$running_app_image" wcarankings-app:previous/);
  assert.doesNotMatch(serverDeploy, /docker tag wcarankings-app:latest wcarankings-app:previous/);
  const candidateImageIdIndex = serverDeploy.indexOf("candidate_app_image_id=$(docker image inspect");
  const stageTransferIndex = serverDeploy.indexOf('docker save "${changed_images[@]}"');
  const runningImageCheckIndex = serverDeploy.indexOf('if [ "$running_app_image" = "$CANDIDATE_APP_IMAGE_ID" ]');
  assert.ok(candidateImageIdIndex >= 0 && candidateImageIdIndex < runningImageCheckIndex);
  assert.ok(stageTransferIndex > runningImageCheckIndex);
  assert.match(serverDeploy, /always\(\).*cancelled\(\).*SERVICES_SWITCHED != 'true'/);
  assert.match(serverDeploy, /recover_approved_config/);
  assert.match(serverDeploy, /PREVIOUS_COMPOSE_CHECKSUM/);
  assert.match(serverDeploy, /FLYWAY_IMAGE_CHANGED.*\|\|.*DATA_TOOLS_IMAGE_CHANGED/);
  assert.match(projectionDeploy, /compose_base=.*\.projection-compose-/);
  const projectionFirstMutationIndex = projectionDeploy.indexOf("dc run --rm data-tools /app/scripts/prepare-flyway-history.mjs");
  const projectionImportIndex = projectionDeploy.indexOf("publish-projection-transfer.mjs");
  const projectionResetIndex = projectionDeploy.indexOf("reset_candidate() {");
  const projectionBaselineIndex = projectionDeploy.lastIndexOf("load_or_measure_database_cpu_baseline", projectionFirstMutationIndex);
  const projectionMutationLockIndex = projectionDeploy.lastIndexOf("production-mutation.lock", projectionBaselineIndex);
  const projectionCooldownIndex = projectionDeploy.lastIndexOf("wait_for_database_cooldown");
  assert.ok(projectionMutationLockIndex >= 0 && projectionBaselineIndex > projectionMutationLockIndex);
  assert.ok(projectionBaselineIndex < projectionFirstMutationIndex);
  assert.ok(projectionFirstMutationIndex < projectionResetIndex && projectionResetIndex < projectionImportIndex);
  assert.ok(projectionCooldownIndex > projectionImportIndex && lockIndex > projectionCooldownIndex);
  assert.match(projectionDeploy, /projection-deploy-\$\{ARTIFACT_ID\}\.baseline/);
  assert.match(projectionDeploy, /baseline_tmp=.*\.tmp\.\$\$/);
  assert.match(projectionDeploy, /mv "\$baseline_tmp" "\$baseline_file"/);
  assert.equal([...projectionDeploy.matchAll(/^\s+load_or_measure_database_cpu_baseline$/gm)].length, 1);
  assert.equal([...projectionDeploy.matchAll(/^\s+load_persisted_database_cpu_baseline$/gm)].length, 2);
  assert.equal([...projectionDeploy.matchAll(/mv "\$baseline_tmp" "\$baseline_file"/g)].length, 1);
  const projectionPersistedLoadIndex = projectionDeploy.indexOf("load_persisted_database_cpu_baseline", projectionFirstMutationIndex);
  assert.ok(projectionPersistedLoadIndex > projectionFirstMutationIndex);
  assert.match(projectionDeploy, /no longer matches this release; marking it superseded/);
  assert.doesNotMatch(projectionDeploy, /stale; rebuilding its candidate/);
  const composeBackup = serverDeploy.indexOf("cp /srv/wcarankings/docker-compose.yml");
  const composeChange = serverDeploy.indexOf('if [ "$COMPOSE_CONFIG_CHANGED" = true ]');
  const caddyBackup = serverDeploy.indexOf("cp /srv/wcarankings/ops/Caddyfile");
  const caddyChange = serverDeploy.indexOf('if [ "$PROXY_CONFIG_CHANGED" = true ]');
  assert.ok(composeBackup >= 0 && composeBackup < composeChange);
  assert.ok(caddyBackup >= 0 && caddyBackup < caddyChange);
  const configMarkerPrepared = serverDeploy.indexOf("write_config_marker prepared");
  const configMarkerLock = serverDeploy.lastIndexOf("production-mutation.lock", configMarkerPrepared);
  const firstConfigMove = serverDeploy.indexOf('mv "/tmp/wcarankings-compose-${SOURCE_SHA}.yml"');
  const configMarkerStaged = serverDeploy.indexOf("write_config_marker staged");
  assert.ok(configMarkerLock >= 0 && configMarkerLock < configMarkerPrepared);
  assert.ok(configMarkerPrepared < firstConfigMove && firstConfigMove < configMarkerStaged);
  assert.match(serverDeploy, /if \[ ! -f "\$marker" \][\s\S]*retaining active files/);
  assert.match(serverDeploy, /server-release-\$\{SOURCE_SHA\}\.config-staging/);
  assert.match(serverDeploy, /current_caddy_file=.*\.caddyFileChecksum/);
  assert.match(serverDeploy, /PREVIOUS_CADDY_FILE_CHECKSUM='\$current_caddy_file'/);
  assert.match(serverDeploy, /"\$current_caddy" != "\$CADDY_CHECKSUM"/);
  assert.match(serverDeploy, /caddyFileChecksum: \$caddyFileChecksum/);
  assert.match(serverDeploy, /version: 2/);
  const recordApprovedIndex = serverDeploy.indexOf("- name: Record approved server release");
  const recordStateTemp = serverDeploy.indexOf("/srv/wcarankings/server-release-state-${SOURCE_SHA}.json.tmp", recordApprovedIndex);
  const recordStateMove = serverDeploy.indexOf('mv "/srv/wcarankings/server-release-state-${SOURCE_SHA}.json.tmp"', recordApprovedIndex);
  const recordMarkerRemoval = serverDeploy.indexOf('rm -f "/srv/wcarankings/server-release-${SOURCE_SHA}.config-staging"', recordApprovedIndex);
  const recordMutationLock = serverDeploy.lastIndexOf("production-mutation.lock", recordStateMove);
  assert.ok(recordStateTemp > recordApprovedIndex && recordStateTemp < recordMutationLock);
  assert.ok(recordMutationLock < recordStateMove && recordStateMove < recordMarkerRemoval);
  assert.doesNotMatch(serverDeploy.slice(recordApprovedIndex), /cat > \/tmp\/wcarankings-server-release/);
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

test("relative MariaDB cooldown accepts a stable high production baseline", async () => {
  const result = await exerciseServerCooldown([98, 100, 96, 96, 100, 99]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /baseline=98\.00 delta=14\.70 ceiling=112\.70/);
  assert.match(result.stdout, /cooldown sample 3\/3/);
});

test("relative MariaDB cooldown resets after a transient spike", async () => {
  const result = await exerciseServerCooldown([10, 12, 11, 60, 20, 21, 20]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /above its pre-migration band: 60%/);
  assert.match(result.stdout, /cooldown sample 3\/3/);
});

test("relative MariaDB cooldown times out under sustained above-band load", async () => {
  const result = await exerciseServerCooldown([98, 100, 96, ...Array(60).fill(130)]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /did not return to its pre-migration CPU band/);
  assert.match(result.stderr, /diagnostic/);
});

test("relative MariaDB cooldown fails closed on invalid or unstable baselines", async () => {
  const invalid = await exerciseServerCooldown(["unknown"]);
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /Could not read MariaDB CPU usage/);

  const unstable = await exerciseServerCooldown([0, 100, 0]);
  assert.notEqual(unstable.status, 0);
  assert.match(unstable.stderr, /pre-migration CPU was unstable/);
  assert.doesNotMatch(unstable.stdout, /cooldown sample/);
});

test("config-only cancellation keeps the current app tag despite a stale previous tag", () => {
  const configOnly = exercisePreSwitchTagRecovery("false");
  assert.equal(configOnly.status, 0, configOnly.stderr);
  assert.match(configOnly.stdout, /App image was unchanged/);
  assert.doesNotMatch(configOnly.stdout, /docker tag/);

  const imageRelease = exercisePreSwitchTagRecovery("true");
  assert.equal(imageRelease.status, 0, imageRelease.stderr);
  assert.match(imageRelease.stdout, /docker tag wcarankings-app:previous wcarankings-app:latest/);
});

test("pre-switch cleanup preserves unmarked config and restores only this run's staged config", async () => {
  const beforeStage = await exercisePreSwitchConfigRecovery(false);
  assert.equal(beforeStage.result.status, 0, beforeStage.result.stderr);
  assert.match(beforeStage.result.stdout, /did not stage deployment configuration/);
  assert.equal(beforeStage.composeTarget, "active-compose-C\n");
  assert.equal(beforeStage.composeBackup, "approved-compose-B\n");
  assert.equal(beforeStage.caddyTarget, "active-caddy-C\n");
  assert.equal(beforeStage.caddyBackup, "approved-caddy-B\n");
  assert.equal(beforeStage.markerExists, false);

  const afterStage = await exercisePreSwitchConfigRecovery(true);
  assert.equal(afterStage.result.status, 0, afterStage.result.stderr);
  assert.equal(afterStage.composeTarget, "approved-compose-B\n");
  assert.equal(afterStage.composeBackup, "approved-compose-B\n");
  assert.equal(afterStage.caddyTarget, "approved-caddy-B\n");
  assert.equal(afterStage.caddyBackup, "approved-caddy-B\n");
  assert.equal(afterStage.markerExists, false);

  const alreadyApproved = await exercisePreSwitchConfigRecovery(true, "c".repeat(40));
  assert.equal(alreadyApproved.result.status, 0, alreadyApproved.result.stderr);
  assert.match(alreadyApproved.result.stdout, /already approved/);
  assert.equal(alreadyApproved.composeTarget, "active-compose-C\n");
  assert.equal(alreadyApproved.composeBackup, "approved-compose-B\n");
  assert.equal(alreadyApproved.caddyTarget, "active-caddy-C\n");
  assert.equal(alreadyApproved.caddyBackup, "approved-caddy-B\n");
  assert.equal(alreadyApproved.markerExists, false);
});

test("Caddy recovery resolves raw checksums from new and legacy release state", async () => {
  const recordedRawChecksum = "a".repeat(64);
  const newState = resolveCaddyFileChecksum(recordedRawChecksum, "b".repeat(64), "unavailable");
  assert.equal(newState.status, 0, newState.stderr);
  assert.equal(newState.stdout.trim(), recordedRawChecksum);

  const head = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
  }).stdout.trim();
  const caddyContents = await readFile(new URL("../ops/Caddyfile", import.meta.url));
  const expectedRawChecksum = createHash("sha256").update(caddyContents).digest("hex");
  const legacyState = resolveCaddyFileChecksum("", "b".repeat(64), head);
  assert.equal(legacyState.status, 0, legacyState.stderr);
  assert.equal(legacyState.stdout.trim(), expectedRawChecksum);

  const missingLegacySource = resolveCaddyFileChecksum("", "b".repeat(64), "unknown");
  assert.notEqual(missingLegacySource.status, 0);
  assert.match(missingLegacySource.stderr, /lacks a source commit/);
});

test("Caddy recovery compares raw file checksums and fails closed on a stale backup", async () => {
  const approved = "approved-caddy-B\n";
  const candidate = "candidate-caddy-C\n";
  const stale = "stale-caddy-A\n";
  const approvedChecksum = createHash("sha256").update(approved).digest("hex");

  const activeApproved = await exerciseApprovedConfigRecovery(approved, stale, approvedChecksum);
  assert.equal(activeApproved.result.status, 0, activeApproved.result.stderr);
  assert.equal(activeApproved.finalContents, approved);

  const recoverable = await exerciseApprovedConfigRecovery(candidate, approved, approvedChecksum);
  assert.equal(recoverable.result.status, 0, recoverable.result.stderr);
  assert.match(recoverable.result.stdout, /Recovered approved Caddy configuration/);
  assert.equal(recoverable.finalContents, approved);

  const ambiguous = await exerciseApprovedConfigRecovery(candidate, stale, approvedChecksum);
  assert.notEqual(ambiguous.result.status, 0);
  assert.match(ambiguous.result.stderr, /recovery copy does not match approved state/);
  assert.equal(ambiguous.finalContents, candidate);
});

test("server smoke tests retry the emitted local stylesheet after core readiness", () => {
  const coreIndex = serverDeploy.indexOf('retry_endpoint "/api/rankings?');
  const rootIndex = serverDeploy.indexOf('retry_endpoint "/" 5 2 "SSR root" "$html_file"');
  const cssExtractionIndex = serverDeploy.indexOf('css=$(printf "%s" "$html"');
  const stylesheetIndex = serverDeploy.indexOf('retry_endpoint "$css"');

  assert.ok(
    coreIndex >= 0 &&
      rootIndex > coreIndex &&
      cssExtractionIndex > rootIndex &&
      stylesheetIndex > cssExtractionIndex,
  );
  assert.match(serverDeploy, /output_file=\$\{5:-\}/);
  assert.match(serverDeploy, /mv "\$response_file" "\$output_file"/);
  assert.doesNotMatch(serverDeploy, /html=\$\(curl --fail/);
  assert.match(serverDeploy, /\/assets\/\*\.css\) ;;/);
  assert.match(serverDeploy, /assets\/\*\.css\) css="\/\$css" ;;/);
  assert.match(serverDeploy, /retry_endpoint "\$css" 5 2 "Stylesheet \$css"/);
});

test("production staging remains sequential and activation is atomic", () => {
  assert.match(projectionDeploy, /for group in \$\(printf '%s' "\$PROJECTION_GROUPS"/);
  assert.match(projectionDeploy, /publish-projection-transfer\.mjs[\s\S]*--prepare-only/);
  assert.match(projectionDeploy, /activate-ranking-generation\.mjs activate/);
  assert.match(projectionDeploy, /activate-ranking-generation\.mjs rollback/);
});

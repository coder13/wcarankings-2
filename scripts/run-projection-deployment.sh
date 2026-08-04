#!/usr/bin/env bash
set -euo pipefail

capture_failed_generation_diagnostics() (
  set +e
  ssh -o BatchMode=yes "$SERVER_USER@$SERVER_IP" \
    'cd /srv/wcarankings && docker compose ps && docker compose logs --tail=200 app db'
)
trap capture_failed_generation_diagnostics ERR

# Validate immutable release coordinates.
[[ "$EXPECTED_MANIFEST_SHA256" =~ ^[0-9a-f]{64}$ ]]
[[ "$EXPECTED_SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]]
[[ "$ARTIFACT_RUN_ID" =~ ^[0-9]+$ ]]
[[ "$ARTIFACT_ID" =~ ^[0-9]+$ ]]
[[ "$DATA_TOOLS_IMAGE" =~ ^ghcr\.io/.+@sha256:[0-9a-f]{64}$ ]]
[[ "$FLYWAY_IMAGE" =~ ^ghcr\.io/.+@sha256:[0-9a-f]{64}$ ]]
[[ "$WCA_EXPORT_DATE" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]
[[ "$WCA_EXPORT_VALUE" =~ ^[0-9TZUTC:+.\ -]+$ ]]
[[ "$PRODUCTION_WCA_EXPORT_VALUE" =~ ^[0-9TZUTC:+.\ -]+$ ]]
for group in $(printf '%s' "$PROJECTION_GROUPS" | tr ',' ' '); do
  case "$group" in
    compatibility | result-facts | result-rankings | competition-rankings | person-competition-rankings | city-rankings | sum-of-ranks | yearly-person-rankings) ;;
    *)
      echo "Unknown projection group: $group" >&2
      exit 1
      ;;
  esac
done
gh api "repos/${GITHUB_REPOSITORY}/actions/artifacts/${ARTIFACT_ID}" \
  > /tmp/artifact-coordinate.json
jq -e \
  --arg name "$ARTIFACT_NAME" \
  --argjson run "$ARTIFACT_RUN_ID" \
  '.name == $name and .workflow_run.id == $run and .expired == false' \
  /tmp/artifact-coordinate.json > /dev/null

# Verify the lightweight release coordinate and compatibility contract.
node scripts/projection-release-coordinate.mjs verify \
  --directory="$PROJECTION_ARTIFACT_DIR" \
  --sha256="$EXPECTED_MANIFEST_SHA256" \
  --groups="$PROJECTION_GROUPS" \
  --export-id="$WCA_EXPORT_VALUE" \
  --source-sha="$EXPECTED_SOURCE_SHA"
normalize_export_identity() {
  node --input-type=module --eval '
    import { normalizeExportDate } from "./scripts/lib/projection-transfer-date.mjs";
    const normalized = normalizeExportDate(process.argv[1]);
    if (!normalized) {
      console.error(`Invalid projection export identity: ${process.argv[1]}`);
      process.exit(1);
    }
    process.stdout.write(normalized);
  ' "$1"
}
normalized_build_export=$(normalize_export_identity "$WCA_EXPORT_VALUE")
normalized_production_export=$(normalize_export_identity "$PRODUCTION_WCA_EXPORT_VALUE")
echo "Projection export identity: build=$normalized_build_export; production=$normalized_production_export"
if [ "$normalized_build_export" != "$normalized_production_export" ]; then
  echo "Projection artifact must include the raw export because the build and production exports differ." >&2
  jq -e '.raw != null' "$PROJECTION_ARTIFACT_DIR/projection-release.json" > /dev/null
fi
artifact_format=$(jq -r '.compatibility.artifactFormatVersion // "missing"' \
  "$PROJECTION_ARTIFACT_DIR/projection-release.json")
artifact_schema=$(jq -r '.compatibility.datasetSchemaVersion // "missing"' \
  "$PROJECTION_ARTIFACT_DIR/projection-release.json")
expected_format=$(jq -r '.artifactFormatVersion // "missing"' release-compatibility.json)
expected_schema=$(jq -r '.datasetSchemaVersion // "missing"' release-compatibility.json)
echo "Projection compatibility: artifact format=$artifact_format, schema=$artifact_schema; expected format=$expected_format, schema=$expected_schema"
if [ "$artifact_format" != "$expected_format" ] || [ "$artifact_schema" != "$expected_schema" ]; then
  echo "Projection artifact compatibility does not match the deployed server compatibility contract." >&2
  exit 1
fi

# Stage exact generation directly from GHCR.
set -euo pipefail
scp -q -o BatchMode=yes \
  "$PROJECTION_ARTIFACT_DIR/projection-release.json" \
  "$SERVER_USER@$SERVER_IP:/tmp/wcarankings-${ARTIFACT_ID}-release.json"
scp -q -o BatchMode=yes docker-compose.yml \
  "$SERVER_USER@$SERVER_IP:/srv/wcarankings/.projection-compose-${ARTIFACT_ID}.yml"
local_auth_directory=$(mktemp -d)
cleanup_local_auth() {
  docker --config "$local_auth_directory" logout ghcr.io > /dev/null 2>&1 || true
  rm -rf "$local_auth_directory"
}
trap cleanup_local_auth EXIT
printf '%s' "$GHCR_TOKEN" \
  | docker --config "$local_auth_directory" login ghcr.io \
    --username "$GHCR_ACTOR" --password-stdin > /dev/null
scp -q -o BatchMode=yes "$local_auth_directory/config.json" \
  "$SERVER_USER@$SERVER_IP:/tmp/wcarankings-${ARTIFACT_ID}-docker-config.json"
ssh -o BatchMode=yes "$SERVER_USER@$SERVER_IP" \
  "ARTIFACT_ID='$ARTIFACT_ID' \
   PROJECTION_GROUPS='$PROJECTION_GROUPS' \
   WCA_EXPORT_VALUE='$WCA_EXPORT_VALUE' \
   EXPECTED_SOURCE_SHA='$EXPECTED_SOURCE_SHA' \
   DATA_TOOLS_IMAGE='$DATA_TOOLS_IMAGE' \
   FLYWAY_IMAGE='$FLYWAY_IMAGE' sh -s" << 'REMOTE'
  set -eu
  release_file="/tmp/wcarankings-${ARTIFACT_ID}-release.json"
  auth_directory=$(mktemp -d)
  stage_directory=$(mktemp -d)
  cleanup_stage() {
    docker --config "$auth_directory" logout ghcr.io >/dev/null 2>&1 || true
    rm -rf "$auth_directory" "$stage_directory"
  }
  trap cleanup_stage EXIT TERM INT HUP
  install -m 600 "/tmp/wcarankings-${ARTIFACT_ID}-docker-config.json" \
    "$auth_directory/config.json"
  rm -f "/tmp/wcarankings-${ARTIFACT_ID}-docker-config.json"
  docker --config "$auth_directory" pull "$DATA_TOOLS_IMAGE"
  docker --config "$auth_directory" pull "$FLYWAY_IMAGE"
  docker --config "$auth_directory" pull ghcr.io/oras-project/oras:v1.3.0
  docker image inspect "$DATA_TOOLS_IMAGE" >/dev/null
  docker image inspect "$FLYWAY_IMAGE" >/dev/null
  docker run --rm --entrypoint sh "$DATA_TOOLS_IMAGE" -c \
    'test -f /app/release-compatibility.json && test -f /app/scripts/activate-ranking-generation.mjs && test -f /app/scripts/import-projection-transfer.mjs'
  docker run --rm --entrypoint cat "$DATA_TOOLS_IMAGE" \
    /app/release-compatibility.json > "$stage_directory/data-tools-compatibility.json"
  jq -e \
    --slurpfile manifest "$release_file" \
    '.artifactFormatVersion == $manifest[0].compatibility.artifactFormatVersion
     and .datasetSchemaVersion == $manifest[0].compatibility.datasetSchemaVersion' \
    "$stage_directory/data-tools-compatibility.json" >/dev/null

  docker tag "$DATA_TOOLS_IMAGE" "wcarankings-data-tools:artifact-${ARTIFACT_ID}"
  docker tag "$FLYWAY_IMAGE" "wcarankings-flyway:artifact-${ARTIFACT_ID}"
  cp "$auth_directory/config.json" "$stage_directory/docker-config.json"
  jq '{groups: (.groups | with_entries(.value = {
    semanticFingerprint: .value.semanticFingerprint,
    artifactFingerprint: .value.artifactFingerprint
  }))}' "$release_file" > "$stage_directory/fingerprints.json"

  oras() {
    docker run --rm \
      -v "$stage_directory/docker-config.json:/root/.docker/config.json:ro" \
      -v "$stage_directory:/workspace" \
      -w /workspace \
      ghcr.io/oras-project/oras:v1.3.0 "$@"
  }

  release_bytes=$(jq -r '.raw.bytes // 0' "$release_file")
  for group in $(printf '%s' "$PROJECTION_GROUPS" | tr ',' ' '); do
    ref=$(jq -r --arg group "$group" '.groups[$group].artifactRef' "$release_file")
    descriptor=$(oras manifest fetch "$ref")
    group_bytes=$(printf '%s' "$descriptor" | jq '[.layers[].size] | add')
    release_bytes=$((release_bytes + group_bytes))
  done
  required_tmp_kib=$((release_bytes / 1024 * 2 + 102400))
  available_tmp_kib=$(df -Pk /tmp | awk 'NR == 2 { print $4 }')
  if [ "$available_tmp_kib" -lt "$required_tmp_kib" ]; then
    echo "Remote /tmp has ${available_tmp_kib} KiB; at least ${required_tmp_kib} KiB is required." >&2
    exit 1
  fi
  required_db_kib=$((release_bytes / 1024 * 5 + 1048576))
  available_db_kib=$(cd /srv/wcarankings && docker compose exec -T db \
    df -Pk /var/lib/mysql | awk 'NR == 2 { print $4 }')
  if [ "$available_db_kib" -lt "$required_db_kib" ]; then
    echo "MariaDB storage has ${available_db_kib} KiB; at least ${required_db_kib} KiB is required." >&2
    exit 1
  fi

  for group in $(printf '%s' "$PROJECTION_GROUPS" | tr ',' ' '); do
    ref=$(jq -r --arg group "$group" '.groups[$group].artifactRef' "$release_file")
    destination="$stage_directory/$group"
    mkdir -p "$destination"
    oras pull "$ref" -o "/workspace/$group"
    docker run --rm \
      -v "$destination:/artifact:ro" \
      -v "$stage_directory/fingerprints.json:/fingerprints.json:ro" \
      "$DATA_TOOLS_IMAGE" \
      /app/scripts/projection-release-artifact.mjs verify \
        --directory=/artifact \
        --groups="$group" \
        --export-id="$WCA_EXPORT_VALUE" \
        --fingerprints-file=/fingerprints.json
    metadata=$(find "$destination" -maxdepth 1 -name '*-projection-transfer.json' -print -quit)
    test -n "$metadata"
    archive=$(jq -r '.archiveFile' "$metadata")
    test -f "$destination/$archive"
    prefix=$group
    if [ "$group" = yearly-person-rankings ]; then prefix=yearly; fi
    cp "$destination/$archive" "/tmp/wcarankings-${ARTIFACT_ID}-${prefix}.tar.gz"
    cp "$metadata" "/tmp/wcarankings-${ARTIFACT_ID}-${prefix}.json"
  done

  raw_ref=$(jq -r '.raw.ref // empty' "$release_file")
  if [ -n "$raw_ref" ]; then
    mkdir -p "$stage_directory/raw"
    oras pull "$raw_ref" -o /workspace/raw
    raw_file=$(jq -r '.raw.file' "$release_file")
    expected_bytes=$(jq -r '.raw.bytes' "$release_file")
    expected_sha=$(jq -r '.raw.sha256' "$release_file")
    actual_bytes=$(stat -c %s "$stage_directory/raw/$raw_file")
    actual_sha=$(sha256sum "$stage_directory/raw/$raw_file" | cut -d' ' -f1)
    test "$actual_bytes" = "$expected_bytes"
    test "$actual_sha" = "$expected_sha"
    cp "$stage_directory/raw/$raw_file" "/tmp/wcarankings-${ARTIFACT_ID}-raw.sql.zip"
  fi
REMOTE
cleanup_local_auth
trap - EXIT

# Prepare, verify, and atomically activate the candidate generation.
started_at=$(date +%s)
has_raw=$(jq -r '.raw != null' \
  "$PROJECTION_ARTIFACT_DIR/projection-release.json")
ssh -o BatchMode=yes "$SERVER_USER@$SERVER_IP" \
  "ARTIFACT_ID='$ARTIFACT_ID' \
   ARTIFACT_RUN_ID='$ARTIFACT_RUN_ID' \
   PROJECTION_GROUPS='$PROJECTION_GROUPS' \
   WCA_EXPORT_VALUE='$WCA_EXPORT_VALUE' \
   HAS_RAW='$has_raw' \
   DATA_TOOLS_IMAGE_REF='wcarankings-data-tools:artifact-${ARTIFACT_ID}' \
   FLYWAY_IMAGE_REF='wcarankings-flyway:artifact-${ARTIFACT_ID}' \
   FAILURE_INJECTION_POINT='$FAILURE_INJECTION_POINT' sh -s" << 'REMOTE'
  set -eu
  cd /srv/wcarankings
  compose_base="/srv/wcarankings/.projection-compose-${ARTIFACT_ID}.yml"
  compose_override="/tmp/wcarankings-${ARTIFACT_ID}-compose-override.yml"
  printf 'services:\n  data-tools:\n    image: wcarankings-data-tools:artifact-%s\n  flyway:\n    image: wcarankings-flyway:artifact-%s\n' \
    "$ARTIFACT_ID" "$ARTIFACT_ID" > "$compose_override"
  dc() {
    docker compose -f "$compose_base" -f "$compose_override" "$@" </dev/null
  }
  dc_with_stdin() {
    docker compose -f "$compose_base" -f "$compose_override" "$@"
  }
  candidate="wcarankings_candidate_${ARTIFACT_ID}"
  previous="${candidate}_previous"
  candidate_work_label="wcarankings.projection-artifact=${ARTIFACT_ID}"
  phase_file="/srv/wcarankings/projection-deploy-${ARTIFACT_ID}.phase"
  baseline_file="/srv/wcarankings/projection-deploy-${ARTIFACT_ID}.baseline"
  release_file="/tmp/wcarankings-${ARTIFACT_ID}-release.json"
  phase=$(cat "$phase_file" 2>/dev/null || printf "none")
  cleanup_files() {
    for group in $(printf '%s' "$PROJECTION_GROUPS" | tr ',' ' '); do
      prefix=$group
      if [ "$group" = yearly-person-rankings ]; then prefix=yearly; fi
      rm -f "/tmp/wcarankings-${ARTIFACT_ID}-${prefix}.tar.gz" \
        "/tmp/wcarankings-${ARTIFACT_ID}-${prefix}.json"
      rm -rf "/tmp/wcarankings-${ARTIFACT_ID}-${prefix}-transfer"
    done
    rm -f "/tmp/wcarankings-${ARTIFACT_ID}-raw.sql.zip" "$release_file" \
      "$compose_override"
  }
  trap cleanup_files EXIT

  if [ "$phase" = superseded ]; then
    echo "This projection release was already marked superseded."
    cleanup_files
    exit 0
  fi
  if [ "$phase" = activated ]; then
    set +e
    dc_with_stdin run --rm -T data-tools \
      /app/scripts/activate-ranking-generation.mjs verify-active \
        --artifact-run-id="$ARTIFACT_RUN_ID" \
        --artifact-id="$ARTIFACT_ID" \
        --manifest=- \
      < "$release_file"
    verify_status=$?
    set -e
    case "$verify_status" in
      0) ;;
      2)
        echo "Active production no longer matches this release; marking it superseded."
        printf "superseded\n" > "$phase_file"
        cleanup_files
        exit 0
        ;;
      *)
        echo "Could not verify active generation state." >&2
        cleanup_files
        exit "$verify_status"
        ;;
    esac
  fi

  read_database_cpu() {
    db_container=$(dc ps -q db)
    if ! cpu=$(timeout 5 docker stats --no-stream --format '{{.CPUPerc}}' "$db_container"); then
      echo "Timed out reading MariaDB CPU usage." >&2
      return 1
    fi
    cpu=$(printf '%s' "$cpu" | tr -d '%')
    if ! printf '%s\n' "$cpu" | grep -Eq '^[0-9]+([.][0-9]+)?$'; then
      echo "Could not read MariaDB CPU usage: ${cpu:-unknown}." >&2
      return 1
    fi
    printf '%s\n' "$cpu"
  }
  measure_database_cpu_baseline() {
    baseline_samples=0
    attempt=1
    while [ "$attempt" -le 12 ]; do
      cpu=$(read_database_cpu)
      echo "MariaDB pre-staging baseline attempt ${attempt}/12: ${cpu}% CPU."
      if [ "$baseline_samples" -eq 0 ]; then
        baseline_first=$cpu
        baseline_samples=1
      elif [ "$baseline_samples" -eq 1 ]; then
        baseline_second=$cpu
        baseline_samples=2
      elif [ "$baseline_samples" -eq 2 ]; then
        baseline_third=$cpu
        baseline_samples=3
      else
        baseline_first=$baseline_second
        baseline_second=$baseline_third
        baseline_third=$cpu
      fi
      if [ "$baseline_samples" -eq 3 ]; then
        candidate_baseline=$(awk "BEGIN { printf \"%.2f\", ($baseline_first + $baseline_second + $baseline_third) / 3 }")
        candidate_delta=$(awk "BEGIN { delta = $candidate_baseline * 0.15; if (delta < 10) delta = 10; if (delta > 25) delta = 25; printf \"%.2f\", delta }")
        candidate_min=$(awk "BEGIN { min = $baseline_first; if ($baseline_second < min) min = $baseline_second; if ($baseline_third < min) min = $baseline_third; printf \"%.2f\", min }")
        candidate_max=$(awk "BEGIN { max = $baseline_first; if ($baseline_second > max) max = $baseline_second; if ($baseline_third > max) max = $baseline_third; printf \"%.2f\", max }")
        candidate_spread=$(awk "BEGIN { printf \"%.2f\", $candidate_max - $candidate_min }")
        echo "MariaDB pre-staging baseline window: ${baseline_first}%, ${baseline_second}%, ${baseline_third}% (spread ${candidate_spread}, band ${candidate_delta})."
        if awk "BEGIN { exit !($candidate_spread <= $candidate_delta) }"; then
          DATABASE_CPU_BASELINE=$candidate_baseline
          DATABASE_CPU_DELTA=$candidate_delta
          DATABASE_CPU_CEILING=$(awk "BEGIN { printf \"%.2f\", $DATABASE_CPU_BASELINE + $DATABASE_CPU_DELTA }")
          echo "MariaDB pre-staging baseline is ${DATABASE_CPU_BASELINE}% CPU; cooldown ceiling is ${DATABASE_CPU_CEILING}%."
          return 0
        fi
      fi
      if [ "$attempt" -lt 12 ]; then sleep 5; fi
      attempt=$((attempt + 1))
    done
    echo "MariaDB pre-staging CPU did not produce three stable consecutive samples in 12 attempts; final window was ${baseline_first}%, ${baseline_second}%, ${baseline_third}%." >&2
    return 1
  }
  load_persisted_database_cpu_baseline() {
    if [ ! -f "$baseline_file" ]; then
      echo "Persisted MariaDB baseline for artifact ${ARTIFACT_ID} is missing." >&2
      return 1
    fi
    read -r DATABASE_CPU_BASELINE DATABASE_CPU_DELTA DATABASE_CPU_CEILING extra < "$baseline_file"
    baseline_invalid=false
    for value in "$DATABASE_CPU_BASELINE" "$DATABASE_CPU_DELTA" "$DATABASE_CPU_CEILING"; do
      if ! printf '%s\n' "$value" | grep -Eq '^[0-9]+([.][0-9]+)?$'; then
        baseline_invalid=true
      fi
    done
    if [ -n "${extra:-}" ] || [ "$baseline_invalid" = true ]; then
      echo "Persisted MariaDB baseline for artifact ${ARTIFACT_ID} is invalid." >&2
      return 1
    fi
    echo "Reusing MariaDB pre-staging baseline ${DATABASE_CPU_BASELINE}% CPU with ceiling ${DATABASE_CPU_CEILING}% for artifact ${ARTIFACT_ID}."
  }
  load_or_measure_database_cpu_baseline() {
    if [ -f "$baseline_file" ]; then
      load_persisted_database_cpu_baseline
      return
    fi
    measure_database_cpu_baseline
    baseline_tmp="${baseline_file}.tmp.$$"
    printf '%s %s %s\n' \
      "$DATABASE_CPU_BASELINE" "$DATABASE_CPU_DELTA" "$DATABASE_CPU_CEILING" \
      > "$baseline_tmp"
    mv "$baseline_tmp" "$baseline_file"
  }
  wait_for_database_cooldown() {
    cool_samples=0
    attempt=1
    while [ "$attempt" -le 60 ]; do
      cpu=$(read_database_cpu)
      if awk "BEGIN { exit !($cpu <= $DATABASE_CPU_CEILING) }"; then
        cool_samples=$((cool_samples + 1))
        echo "MariaDB cooldown sample ${cool_samples}/3: ${cpu}% CPU (baseline ${DATABASE_CPU_BASELINE}%, ceiling ${DATABASE_CPU_CEILING}%)."
        if [ "$cool_samples" -ge 3 ]; then return 0; fi
      else
        cool_samples=0
        echo "MariaDB is still above its pre-staging band: ${cpu}% CPU (ceiling ${DATABASE_CPU_CEILING}%)."
      fi
      attempt=$((attempt + 1))
      sleep 5
    done
    echo "MariaDB did not return to its pre-staging CPU band for three consecutive samples." >&2
    db_container=$(dc ps -q db)
    docker stats --no-stream "$db_container" >&2 || true
    dc exec -T db sh -c '
      mariadb --user="$MARIADB_USER" --password="$MARIADB_PASSWORD" "$MARIADB_DATABASE" \
        --execute="SHOW GLOBAL STATUS WHERE Variable_name IN ('\''Threads_connected'\'', '\''Threads_running'\'', '\''Innodb_buffer_pool_pages_dirty'\'');"
    ' >&2 || true
    return 1
  }
  (
    exec 8>/srv/wcarankings/production-mutation.lock
    flock -w 360 8
    flyway_history_repair_marker=/srv/wcarankings/flyway-history-repair-v1.complete
    load_or_measure_database_cpu_baseline
    dc run --rm data-tools /app/scripts/prepare-flyway-history.mjs
    if [ ! -f "$flyway_history_repair_marker" ]; then
      dc run --rm flyway repair
    fi
    dc run --rm flyway migrate
    dc exec -T db sh -c '
      mariadb --user="$MARIADB_USER" --password="$MARIADB_PASSWORD" "$MARIADB_DATABASE" --execute="
        CREATE TABLE IF NOT EXISTS result_attempts (
          result_id BIGINT NOT NULL,
          attempt_number INT NOT NULL,
          value INT NOT NULL
        );
      "
    '
    if [ ! -f "$flyway_history_repair_marker" ]; then
      dc run --rm \
        -e FLYWAY_LOCATIONS=filesystem:/flyway/migrations/results \
        -e FLYWAY_TABLE=flyway_schema_history_results \
        flyway repair
    fi
    dc run --rm \
      -e FLYWAY_LOCATIONS=filesystem:/flyway/migrations/results \
      -e FLYWAY_TABLE=flyway_schema_history_results \
      -e FLYWAY_OUT_OF_ORDER=true \
      flyway migrate
    if [ ! -f "$flyway_history_repair_marker" ]; then
      : > "$flyway_history_repair_marker"
    fi
  )
  load_persisted_database_cpu_baseline

  activated=false
  heartbeat_pid=
  monitor_pid=
  candidate_work_pid=
  stop_candidate_work() {
    if [ -n "$candidate_work_pid" ]; then
      kill "$candidate_work_pid" 2>/dev/null || true
      wait "$candidate_work_pid" 2>/dev/null || true
      candidate_work_pid=
    fi
    for container_id in $(docker ps -q --filter "label=${candidate_work_label}"); do
      echo "Stopping candidate container ${container_id} for artifact ${ARTIFACT_ID}." >&2
      docker kill "$container_id" >/dev/null 2>&1 || true
    done
  }
  wait_for_candidate_work() {
    candidate_work_pid=$1
    wait "$candidate_work_pid"
    candidate_work_pid=
  }
  stop_background_jobs() {
    if [ -n "$heartbeat_pid" ]; then
      kill "$heartbeat_pid" 2>/dev/null || true
      wait "$heartbeat_pid" 2>/dev/null || true
      heartbeat_pid=
    fi
    if [ -n "$monitor_pid" ]; then
      kill "$monitor_pid" 2>/dev/null || true
      wait "$monitor_pid" 2>/dev/null || true
      monitor_pid=
    fi
  }
  rollback_on_failure() {
    status=$?
    trap - EXIT TERM INT HUP
    stop_candidate_work
    stop_background_jobs
    if [ "$status" -ne 0 ]; then
      echo "Generation deployment failed; checking whether activation must be rolled back." >&2
      rollback_result=$(dc run --rm -T data-tools \
        /app/scripts/activate-ranking-generation.mjs rollback \
        --candidate-schema="$candidate" \
        --artifact-id="$ARTIFACT_ID" 2>/dev/null || printf '{}')
      if printf '%s' "$rollback_result" | grep -q '"rolledBack":true'; then
        printf "projections_prepared\n" > "$phase_file"
      fi
    fi
    cleanup_files
    exit "$status"
  }
  terminate_deployment() {
    trap - TERM INT HUP
    stop_candidate_work
    exit 143
  }
  trap rollback_on_failure EXIT
  trap terminate_deployment TERM INT HUP
  (while sleep 30; do echo "Ranking generation deployment is still running…"; done) &
  heartbeat_pid=$!

  reset_candidate() {
    dc exec -T \
      -e CANDIDATE_SCHEMA="$candidate" \
      -e PREVIOUS_SCHEMA="$previous" \
      db sh -c '
        mariadb --user=root --password="$MARIADB_ROOT_PASSWORD" --execute="
          DROP DATABASE IF EXISTS \`$CANDIDATE_SCHEMA\`;
          DROP DATABASE IF EXISTS \`$PREVIOUS_SCHEMA\`;
          CREATE DATABASE \`$CANDIDATE_SCHEMA\`;
          CREATE DATABASE \`$PREVIOUS_SCHEMA\`;
          GRANT ALL PRIVILEGES ON \`$CANDIDATE_SCHEMA\`.* TO \`$MARIADB_USER\`@\`%\`;
          GRANT ALL PRIVILEGES ON \`$PREVIOUS_SCHEMA\`.* TO \`$MARIADB_USER\`@\`%\`;
        "
      '
    dc run --rm \
      -e FLYWAY_URL="jdbc:mariadb://db:3306/${candidate}" \
      -e FLYWAY_TABLE=flyway_schema_history_app \
      flyway migrate
    dc exec -T \
      -e CANDIDATE_SCHEMA="$candidate" \
      db sh -c '
        mariadb --user=root --password="$MARIADB_ROOT_PASSWORD" "$CANDIDATE_SCHEMA" --execute="
          CREATE TABLE IF NOT EXISTS result_attempts (
            result_id BIGINT NOT NULL,
            attempt_number INT NOT NULL,
            value INT NOT NULL
          );
        "
      '
    dc run --rm \
      -e FLYWAY_URL="jdbc:mariadb://db:3306/${candidate}" \
      -e FLYWAY_LOCATIONS=filesystem:/flyway/migrations/results \
      -e FLYWAY_TABLE=flyway_schema_history_results \
      flyway migrate
    printf "initialized\n" > "$phase_file"
    phase=initialized
  }

  case "$phase" in
    raw_prepared|projections_prepared|activated) ;;
    *) reset_candidate ;;
  esac

  probe_core() {
    curl --fail --silent --show-error --max-time 2 \
      "http://127.0.0.1:3000/api/rankings?eventId=333&result=single&start=0&limit=1" \
      >/dev/null
  }
  for probe in 1 2 3; do
    if ! probe_core; then
      echo "Core ranking preflight failed ($probe/3)." >&2
      exit 1
    fi
  done
  deploy_pid=$$
  (
    failures=0
    while sleep 5; do
      if probe_core; then failures=0; else failures=$((failures + 1)); fi
      if [ "$failures" -ge 3 ]; then
        echo "Core ranking monitor failed three consecutive times; aborting candidate work." >&2
        stop_candidate_work
        kill -TERM "$deploy_pid"
        exit 1
      fi
    done
  ) &
  monitor_pid=$!

  if [ "$phase" = initialized ]; then
    if [ "$HAS_RAW" = true ]; then
      dc_with_stdin run --rm -T --label "$candidate_work_label" \
        --entrypoint sh data-tools -c \
        "cat > /var/cache/wcarankings/wca-export-${ARTIFACT_ID}.sql.zip" \
        < "/tmp/wcarankings-${ARTIFACT_ID}-raw.sql.zip" &
      wait_for_candidate_work "$!"
      dc run --rm --label "$candidate_work_label" \
        -e DATABASE_NAME_OVERRIDE="$candidate" \
        data-tools /app/scripts/sync-wca-export.mjs \
          --force \
          --raw-only \
          --canonical-export-date="$WCA_EXPORT_VALUE" \
          --sql-path="/var/cache/wcarankings/wca-export-${ARTIFACT_ID}.sql.zip" &
      wait_for_candidate_work "$!"
    else
      dc exec -T \
        -e CANDIDATE_SCHEMA="$candidate" \
        db sh -c '
          mariadb --user=root --password="$MARIADB_ROOT_PASSWORD" --execute="
            INSERT INTO \`$CANDIDATE_SCHEMA\`.export_metadata
            SELECT * FROM \`$MARIADB_DATABASE\`.export_metadata
            ON DUPLICATE KEY UPDATE value = VALUES(value);
          "
        '
    fi
    printf "raw_prepared\n" > "$phase_file"
    phase=raw_prepared
    if [ "$FAILURE_INJECTION_POINT" = after_raw_import ]; then
      echo "Injected failure after raw import." >&2
      exit 1
    fi
  fi

  if [ "$phase" = raw_prepared ]; then
    imported=0
    for group in $(printf '%s' "$PROJECTION_GROUPS" | tr ',' ' '); do
      prefix=$group
      if [ "$group" = yearly-person-rankings ]; then prefix=yearly; fi
      archive="/tmp/wcarankings-${ARTIFACT_ID}-${prefix}.tar.gz"
      metadata="/tmp/wcarankings-${ARTIFACT_ID}-${prefix}.json"
      transfer_directory="/tmp/wcarankings-${ARTIFACT_ID}-${prefix}-transfer"
      gzip -t "$archive"
      rm -rf "$transfer_directory"
      mkdir -p "$transfer_directory"
      tar -xzf "$archive" -C "$transfer_directory"
      dc run --rm -T --label "$candidate_work_label" \
        -v "$transfer_directory:/projection-transfer:ro" \
        -v "$metadata:/projection-transfer.json:ro" \
        -e DATABASE_NAME_OVERRIDE="$candidate" \
        -e WCA_PROJECTION_IMPORT_CONCURRENCY=2 \
        data-tools /app/scripts/import-projection-transfer.mjs \
          --directory=/projection-transfer \
          --metadata=/projection-transfer.json \
          --concurrency=2 &
      wait_for_candidate_work "$!"
      imported=$((imported + 1))
      if [ "$FAILURE_INJECTION_POINT" = during_projection_import ] \
        && [ "$imported" -eq 1 ]; then
        echo "Injected failure during projection import." >&2
        exit 1
      fi
    done
    dc run --rm --label "$candidate_work_label" \
      -e DATABASE_NAME_OVERRIDE="$candidate" \
      -e WCA_PROJECTION_INDEX_CONCURRENCY=2 \
      data-tools /app/scripts/publish-projection-transfer.mjs \
        --prepare-only \
        --expected-export-date="$WCA_EXPORT_VALUE" \
        --groups="$PROJECTION_GROUPS" &
    wait_for_candidate_work "$!"
    dc run --rm --label "$candidate_work_label" \
      -e DATABASE_NAME_OVERRIDE="$candidate" \
      data-tools /app/scripts/publish-projection-transfer.mjs \
        --groups="$PROJECTION_GROUPS" &
    wait_for_candidate_work "$!"
    if [ "$PROJECTION_GROUPS" = "compatibility,result-facts,result-rankings,competition-rankings,person-competition-rankings,city-rankings,sum-of-ranks,yearly-person-rankings" ]; then
      dc run --rm --label "$candidate_work_label" \
        -e DATABASE_NAME_OVERRIDE="$candidate" \
        data-tools /app/scripts/check-ranking-projections.mjs &
      wait_for_candidate_work "$!"
    fi
    printf "projections_prepared\n" > "$phase_file"
    phase=projections_prepared
  fi

  if [ "$phase" = projections_prepared ] || [ "$phase" = activated ]; then
    if [ "$phase" = projections_prepared ]; then
      wait_for_database_cooldown
    fi
    if [ -n "$monitor_pid" ]; then
      kill "$monitor_pid" 2>/dev/null || true
      wait "$monitor_pid" 2>/dev/null || true
      monitor_pid=
    fi
    exec 8>/srv/wcarankings/production-mutation.lock
    if ! flock -w 360 8; then
      echo "Another production mutation holds the lock." >&2
      exit 1
    fi
    exec 9>/srv/wcarankings/projection-activation.lock
    if ! flock -w 60 9; then
      echo "Another projection activation holds the lock." >&2
      exit 1
    fi
  fi

  if [ "$phase" = projections_prepared ]; then
    dc_with_stdin run --rm -T \
      -e FAILURE_INJECTION_POINT="$FAILURE_INJECTION_POINT" \
      data-tools /app/scripts/activate-ranking-generation.mjs activate \
        --candidate-schema="$candidate" \
        --artifact-run-id="$ARTIFACT_RUN_ID" \
        --artifact-id="$ARTIFACT_ID" \
        --manifest=- \
      < "$release_file"
    printf "activated\n" > "$phase_file"
    phase=activated
  fi

  if [ "$FAILURE_INJECTION_POINT" = after_projection_activation_before_smoke ]; then
    echo "Injected failure after activation and before smoke verification." >&2
    exit 1
  fi

  retry_endpoint() {
    endpoint=$1
    attempt=1
    while [ "$attempt" -le 10 ]; do
      if curl --fail --silent --show-error --max-time 15 \
        "http://127.0.0.1:3000${endpoint}" >/dev/null; then
        return 0
      fi
      echo "Generation smoke check failed for $endpoint ($attempt/10)." >&2
      attempt=$((attempt + 1))
      sleep 3
    done
    return 1
  }
  retry_endpoint "/api/rankings?eventId=333&result=single&start=0&limit=1"
  case ",$PROJECTION_GROUPS," in
    *,result-rankings,*) retry_endpoint "/api/rankings/results?eventId=333&result=single&start=0&limit=1" ;;
  esac
  case ",$PROJECTION_GROUPS," in
    *,yearly-person-rankings,*) retry_endpoint "/api/rankings?eventId=333&result=single&year=2024&start=0&limit=1&paged=1" ;;
  esac
  case ",$PROJECTION_GROUPS," in
    *,sum-of-ranks,*)
      retry_endpoint "/api/rankings?eventId=SOR&result=single&start=0&paged=1"
      retry_endpoint "/api/rankings?eventId=SOR&result=average&start=0&paged=1"
      retry_endpoint "/api/rankings?eventId=sor-kinch&start=0&paged=1"
      ;;
  esac
  case ",$PROJECTION_GROUPS," in
    *,competition-rankings,*) retry_endpoint "/api/rankings/competitions?ranking=competitor-count&start=0&limit=10" ;;
  esac
  case ",$PROJECTION_GROUPS," in
    *,person-competition-rankings,*) retry_endpoint "/api/rankings/people/competitions?start=0&limit=1" ;;
  esac

  dc exec -T \
    -e CANDIDATE_SCHEMA="$candidate" \
    -e PREVIOUS_SCHEMA="$previous" \
    db sh -c '
      mariadb --user=root --password="$MARIADB_ROOT_PASSWORD" --execute="
        DROP DATABASE IF EXISTS \`$PREVIOUS_SCHEMA\`;
        DROP DATABASE IF EXISTS \`$CANDIDATE_SCHEMA\`;
      "
    '
  rm -f "$phase_file"
  activated=true
  trap - EXIT TERM INT HUP
  stop_background_jobs
  cleanup_files
REMOTE
completed_at=$(date +%s)
duration=$((completed_at - started_at))
echo "duration_seconds=$duration" >> "$GITHUB_OUTPUT"
remote_phase=$(ssh -o BatchMode=yes "$SERVER_USER@$SERVER_IP" \
  "cat '/srv/wcarankings/projection-deploy-${ARTIFACT_ID}.phase' 2>/dev/null || true")
if [ "$remote_phase" = superseded ]; then
  echo "superseded=true" >> "$GITHUB_OUTPUT"
else
  echo "superseded=false" >> "$GITHUB_OUTPUT"
fi
{
  echo "### Ranking generation activation"
  echo "- Artifact: $ARTIFACT_ID from workflow run $ARTIFACT_RUN_ID"
  echo "- WCA export: $WCA_EXPORT_VALUE"
  echo "- Groups: $PROJECTION_GROUPS"
  if [ "$remote_phase" = superseded ]; then
    echo "- Superseded without changing production: ${duration}s"
  else
    echo "- Prepare, atomic activation, and smoke verification: ${duration}s"
  fi
  echo "- Application and Caddy containers were not restarted."
} >> "$GITHUB_STEP_SUMMARY"

# Refresh database-backed and externally sourced system lists after activation.
ssh -o BatchMode=yes "$SERVER_USER@$SERVER_IP" \
  "ARTIFACT_ID='$ARTIFACT_ID' sh -s" << 'REMOTE'
  set -eu
  cd /srv/wcarankings
  compose_base="/srv/wcarankings/.projection-compose-${ARTIFACT_ID}.yml"
  override=$(mktemp)
  trap 'rm -f "$override"' EXIT
  printf 'services:\n  data-tools:\n    image: wcarankings-data-tools:artifact-%s\n' \
    "$ARTIFACT_ID" > "$override"
  docker compose -f "$compose_base" -f "$override" run --rm \
    data-tools /app/scripts/refresh-system-lists.mjs
REMOTE
ssh -o BatchMode=yes "$SERVER_USER@$SERVER_IP" \
  "ARTIFACT_ID='$ARTIFACT_ID' sh -s" << 'REMOTE'
  set -eu
  cd /srv/wcarankings
  compose_base="/srv/wcarankings/.projection-compose-${ARTIFACT_ID}.yml"
  override=$(mktemp)
  trap 'rm -f "$override"' EXIT
  printf 'services:\n  data-tools:\n    image: wcarankings-data-tools:artifact-%s\n' \
    "$ARTIFACT_ID" > "$override"
  docker compose -f "$compose_base" -f "$override" run --rm \
    data-tools /app/scripts/refresh-board-list.mjs
REMOTE
ssh -o BatchMode=yes "$SERVER_USER@$SERVER_IP" \
  "ARTIFACT_ID='$ARTIFACT_ID' sh -s" << 'REMOTE'
  set -eu
  cd /srv/wcarankings
  compose_base="/srv/wcarankings/.projection-compose-${ARTIFACT_ID}.yml"
  override=$(mktemp)
  trap 'rm -f "$override"' EXIT
  printf 'services:\n  data-tools:\n    image: wcarankings-data-tools:artifact-%s\n' \
    "$ARTIFACT_ID" > "$override"
  docker compose -f "$compose_base" -f "$override" run --rm \
    data-tools /app/scripts/refresh-board-list.mjs --delegates
REMOTE

trap - ERR
ssh -o BatchMode=yes "$SERVER_USER@$SERVER_IP" \
  "rm -f '/srv/wcarankings/.projection-compose-${ARTIFACT_ID}.yml'; \
   docker image rm \
    'wcarankings-data-tools:artifact-${ARTIFACT_ID}' \
    'wcarankings-flyway:artifact-${ARTIFACT_ID}' || true"

#!/usr/bin/env bash
set -euo pipefail

deploy_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)

capture_failed_generation_diagnostics() {
  set +e
  ssh -o BatchMode=yes "$SERVER_USER@$SERVER_IP" \
    'cd /srv/wcarankings && docker compose ps && docker compose logs --tail=200 app db'
}
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
bun scripts/projection-release-coordinate.ts verify \
  --directory="$PROJECTION_ARTIFACT_DIR" \
  --sha256="$EXPECTED_MANIFEST_SHA256" \
  --groups="$PROJECTION_GROUPS" \
  --export-id="$WCA_EXPORT_VALUE" \
  --source-sha="$EXPECTED_SOURCE_SHA"
normalize_export_identity() {
  bun --eval '
    import { normalizeExportDate } from "./data-tools/shared/date.ts";
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
   FLYWAY_IMAGE='$FLYWAY_IMAGE' sh -s" < "$deploy_dir/remote/stage-projection-artifact.sh"
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
   FAILURE_INJECTION_POINT='$FAILURE_INJECTION_POINT' sh -s" < "$deploy_dir/remote/activate-projection-generation.sh"
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
for list_name in system board delegates; do
  ssh -o BatchMode=yes "$SERVER_USER@$SERVER_IP" \
    "ARTIFACT_ID='$ARTIFACT_ID' LIST_NAME='$list_name' sh -s" \
    < "$deploy_dir/remote/refresh-projection-lists.sh"
done

trap - ERR
ssh -o BatchMode=yes "$SERVER_USER@$SERVER_IP" \
  "rm -f '/srv/wcarankings/.projection-compose-${ARTIFACT_ID}.yml'; \
   docker image rm \
    'wcarankings-data-tools:artifact-${ARTIFACT_ID}' \
    'wcarankings-flyway:artifact-${ARTIFACT_ID}' || true"

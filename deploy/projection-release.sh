#!/usr/bin/env bash
set -euo pipefail

deploy_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)

capture_failed_generation_diagnostics() {
  set +e
  ssh -o BatchMode=yes "$SERVER_USER@$SERVER_IP" \
    'cd /srv/wcarankings && docker compose ps && docker compose logs --tail=200 app db'
}
trap capture_failed_generation_diagnostics ERR

# TypeScript owns release planning and validation. Bash only executes the plan.
deployment_plan=$(bun scripts/projections/planning/plan-projection-deployment.ts \
  --directory="$PROJECTION_ARTIFACT_DIR")
has_raw=$(printf '%s' "$deployment_plan" | jq -r '.hasRaw')
echo "Projection deployment plan: $deployment_plan"

# Stage exact generation directly from GHCR.
set -euo pipefail
scp -q -o BatchMode=yes \
  "$PROJECTION_ARTIFACT_DIR/projection-release.json" \
  "$SERVER_USER@$SERVER_IP:/tmp/wcarankings-${ARTIFACT_ID}-release.json"
scp -q -o BatchMode=yes docker-compose.yml \
  "$SERVER_USER@$SERVER_IP:/srv/wcarankings/.projection-compose-${ARTIFACT_ID}.yml"
remote_deployment_directory="/tmp/wcarankings-${ARTIFACT_ID}-deploy"
scp -qr -o BatchMode=yes "$deploy_dir/remote" \
  "$SERVER_USER@$SERVER_IP:$remote_deployment_directory"
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
  "DEPLOYMENT_DIRECTORY='$remote_deployment_directory' \
   ARTIFACT_ID='$ARTIFACT_ID' \
   PROJECTION_GROUPS='$PROJECTION_GROUPS' \
   WCA_EXPORT_VALUE='$WCA_EXPORT_VALUE' \
   EXPECTED_SOURCE_SHA='$EXPECTED_SOURCE_SHA' \
   DATA_TOOLS_IMAGE='$DATA_TOOLS_IMAGE' \
   FLYWAY_IMAGE='$FLYWAY_IMAGE' \
   sh '$remote_deployment_directory/projection-release.sh' stage"
cleanup_local_auth
trap - EXIT

# Prepare, verify, and atomically activate the candidate generation.
started_at=$(date +%s)
ssh -o BatchMode=yes "$SERVER_USER@$SERVER_IP" \
  "DEPLOYMENT_DIRECTORY='$remote_deployment_directory' \
   ARTIFACT_ID='$ARTIFACT_ID' \
   ARTIFACT_RUN_ID='$ARTIFACT_RUN_ID' \
   PROJECTION_GROUPS='$PROJECTION_GROUPS' \
   WCA_EXPORT_VALUE='$WCA_EXPORT_VALUE' \
   HAS_RAW='$has_raw' \
   DATA_TOOLS_IMAGE_REF='wcarankings-data-tools:artifact-${ARTIFACT_ID}' \
   FLYWAY_IMAGE_REF='wcarankings-flyway:artifact-${ARTIFACT_ID}' \
   FAILURE_INJECTION_POINT='$FAILURE_INJECTION_POINT' \
   sh '$remote_deployment_directory/projection-release.sh' activate"
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
  "DEPLOYMENT_DIRECTORY='$remote_deployment_directory' \
   ARTIFACT_ID='$ARTIFACT_ID' \
   sh '$remote_deployment_directory/projection-release.sh' refresh-lists"

trap - ERR
ssh -o BatchMode=yes "$SERVER_USER@$SERVER_IP" \
  "DEPLOYMENT_DIRECTORY='$remote_deployment_directory' \
   ARTIFACT_ID='$ARTIFACT_ID' \
   sh '$remote_deployment_directory/projection-release.sh' cleanup"

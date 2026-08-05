set -eu
release_file="/tmp/wcarankings-${ARTIFACT_ID}-release.json"
auth_directory=$(mktemp -d)
stage_directory=$(mktemp -d)
cleanup_stage() {
  docker --config "$auth_directory" logout ghcr.io > /dev/null 2>&1 || true
  rm -rf "$auth_directory" "$stage_directory"
}
trap cleanup_stage EXIT TERM INT HUP
install -m 600 "/tmp/wcarankings-${ARTIFACT_ID}-docker-config.json" \
  "$auth_directory/config.json"
rm -f "/tmp/wcarankings-${ARTIFACT_ID}-docker-config.json"
docker --config "$auth_directory" pull "$DATA_TOOLS_IMAGE"
docker --config "$auth_directory" pull "$FLYWAY_IMAGE"
docker --config "$auth_directory" pull ghcr.io/oras-project/oras:v1.3.0
docker image inspect "$DATA_TOOLS_IMAGE" > /dev/null
docker image inspect "$FLYWAY_IMAGE" > /dev/null
docker run --rm --entrypoint sh "$DATA_TOOLS_IMAGE" -c \
  'test -f /app/release-compatibility.json && test -f /app/scripts/projections/generation/activate-ranking-generation.ts && test -f /app/scripts/projections/transfer/import-projection-transfer.ts'
docker run --rm --entrypoint cat "$DATA_TOOLS_IMAGE" \
  /app/release-compatibility.json > "$stage_directory/data-tools-compatibility.json"
jq -e \
  --slurpfile manifest "$release_file" \
  '.artifactFormatVersion == $manifest[0].compatibility.artifactFormatVersion
   and .datasetSchemaVersion == $manifest[0].compatibility.datasetSchemaVersion' \
  "$stage_directory/data-tools-compatibility.json" > /dev/null

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
    /app/scripts/projections/release/projection-release-artifact.ts verify \
    --directory=/artifact \
    --groups="$group" \
    --export-id="$WCA_EXPORT_VALUE" \
    --source-sha="$EXPECTED_SOURCE_SHA" \
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

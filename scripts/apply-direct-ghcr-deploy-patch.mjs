const prefix = "${prefix}"; const required_db_kib = "${required_db_kib}"; const available_db_kib = "${available_db_kib}"; const required_tmp_kib = "${required_tmp_kib}"; const available_tmp_kib = "${available_tmp_kib}"; const SERVER_IP = "${SERVER_IP}"; const SERVER_USER = "${SERVER_USER}"; const ARTIFACT_ID = "${ARTIFACT_ID}";
import { readFile, writeFile } from "node:fs/promises";

const path = ".github/workflows/deploy-projections.yml";
let content = await readFile(path, "utf8");

function replaceOnce(before, after) {
  if (!content.includes(before)) throw new Error(`Could not find deploy workflow fragment: ${before.slice(0, 80)}`);
  content = content.replace(before, after);
}

function replaceBetween(start, end, replacement) {
  const startIndex = content.indexOf(start);
  const endIndex = content.indexOf(end, startIndex);
  if (startIndex < 0 || endIndex < 0) {
    throw new Error(`Could not replace deploy workflow section ${start} -> ${end}`);
  }
  content = `${content.slice(0, startIndex)}${replacement}${content.slice(endIndex)}`;
}

replaceOnce(
  "          node scripts/projection-release-artifact.mjs verify \\\n",
  "          node scripts/projection-release-coordinate.mjs verify \\\n",
);

replaceBetween(
  "      - name: Pull approved data-tools image\n",
  "      - name: Prepare and atomically activate ranking generation\n",
  `      - name: Stage exact generation directly from GHCR
        env:
          GHCR_TOKEN: \${{ github.token }}
          GHCR_ACTOR: \${{ github.actor }}
        run: |
          set -euo pipefail
          scp -q -o BatchMode=yes \\
            "$PROJECTION_ARTIFACT_DIR/projection-release.json" \\
            "$SERVER_USER@$SERVER_IP:/tmp/wcarankings-${ARTIFACT_ID}-release.json"
          scp -q -o BatchMode=yes docker-compose.yml \\
            "$SERVER_USER@$SERVER_IP:/srv/wcarankings/.projection-compose-${ARTIFACT_ID}.yml"
          ssh -o BatchMode=yes "$SERVER_USER@$SERVER_IP" \\
            "GHCR_TOKEN='$GHCR_TOKEN' \\
             GHCR_ACTOR='$GHCR_ACTOR' \\
             ARTIFACT_ID='$ARTIFACT_ID' \\
             PROJECTION_GROUPS='$PROJECTION_GROUPS' \\
             WCA_EXPORT_VALUE='$WCA_EXPORT_VALUE' \\
             EXPECTED_SOURCE_SHA='$EXPECTED_SOURCE_SHA' \\
             DATA_TOOLS_IMAGE='$DATA_TOOLS_IMAGE' \\
             FLYWAY_IMAGE='$FLYWAY_IMAGE' sh -s" <<'REMOTE'
            set -eu
            release_file="/tmp/wcarankings-${ARTIFACT_ID}-release.json"
            auth_directory=$(mktemp -d)
            stage_directory=$(mktemp -d)
            cleanup_stage() {
              docker --config "$auth_directory" logout ghcr.io >/dev/null 2>&1 || true
              rm -rf "$auth_directory" "$stage_directory"
            }
            trap cleanup_stage EXIT TERM INT HUP

            printf '%s' "$GHCR_TOKEN" \\
              | docker --config "$auth_directory" login ghcr.io \\
                  --username "$GHCR_ACTOR" --password-stdin >/dev/null
            docker --config "$auth_directory" pull "$DATA_TOOLS_IMAGE"
            docker --config "$auth_directory" pull "$FLYWAY_IMAGE"
            docker --config "$auth_directory" pull ghcr.io/oras-project/oras:v1.3.0
            docker image inspect "$DATA_TOOLS_IMAGE" >/dev/null
            docker image inspect "$FLYWAY_IMAGE" >/dev/null
            docker run --rm --entrypoint sh "$DATA_TOOLS_IMAGE" -c \\
              'test -f /app/release-compatibility.json && test -f /app/scripts/activate-ranking-generation.mjs && test -f /app/scripts/import-projection-transfer.mjs'
            docker run --rm --entrypoint cat "$DATA_TOOLS_IMAGE" \\
              /app/release-compatibility.json > "$stage_directory/data-tools-compatibility.json"
            jq -e \\
              --slurpfile manifest "$release_file" \\
              '.artifactFormatVersion == $manifest[0].compatibility.artifactFormatVersion
               and .datasetSchemaVersion == $manifest[0].compatibility.datasetSchemaVersion' \\
              "$stage_directory/data-tools-compatibility.json" >/dev/null

            docker tag "$DATA_TOOLS_IMAGE" "wcarankings-data-tools:artifact-${ARTIFACT_ID}"
            docker tag "$FLYWAY_IMAGE" "wcarankings-flyway:artifact-${ARTIFACT_ID}"
            cp "$auth_directory/config.json" "$stage_directory/docker-config.json"
            jq '{groups: (.groups | with_entries(.value = {
              semanticFingerprint: .value.semanticFingerprint,
              artifactFingerprint: .value.artifactFingerprint
            }))}' "$release_file" > "$stage_directory/fingerprints.json"

            oras() {
              docker run --rm \\
                -v "$stage_directory/docker-config.json:/root/.docker/config.json:ro" \\
                -v "$stage_directory:/workspace" \\
                -w /workspace \\
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
            available_db_kib=$(cd /srv/wcarankings && docker compose exec -T db \\
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
              docker run --rm \\
                -v "$destination:/artifact:ro" \\
                -v "$stage_directory/fingerprints.json:/fingerprints.json:ro" \\
                "$DATA_TOOLS_IMAGE" \\
                /app/scripts/projection-release-artifact.mjs verify \\
                  --directory=/artifact \\
                  --groups="$group" \\
                  --export-id="$WCA_EXPORT_VALUE" \\
                  --source-sha="$EXPECTED_SOURCE_SHA" \\
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

`,
);

replaceOnce(
  `                rm -f "/tmp/wcarankings-\${ARTIFACT_ID}-\${prefix}.sql.gz"
`,
  `                rm -f "/tmp/wcarankings-\${ARTIFACT_ID}-\${prefix}.tar.gz" \\
                  "/tmp/wcarankings-\${ARTIFACT_ID}-\${prefix}.json"
                rm -rf "/tmp/wcarankings-\${ARTIFACT_ID}-\${prefix}-transfer"
`,
);

replaceBetween(
  `            if [ "$phase" = raw_prepared ]; then
`,
  `            if [ "$phase" = projections_prepared ] || [ "$phase" = activated ]; then
`,
  `            if [ "$phase" = raw_prepared ]; then
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
                dc run --rm -T --label "$candidate_work_label" \\
                  -v "$transfer_directory:/projection-transfer:ro" \\
                  -v "$metadata:/projection-transfer.json:ro" \\
                  -e DATABASE_NAME_OVERRIDE="$candidate" \\
                  -e WCA_PROJECTION_IMPORT_CONCURRENCY=2 \\
                  data-tools /app/scripts/import-projection-transfer.mjs \\
                    --directory=/projection-transfer \\
                    --metadata=/projection-transfer.json \\
                    --concurrency=2 &
                wait_for_candidate_work "$!"
                imported=$((imported + 1))
                if [ "$FAILURE_INJECTION_POINT" = during_projection_import ] \\
                  && [ "$imported" -eq 1 ]; then
                  echo "Injected failure during projection import." >&2
                  exit 1
                fi
              done
              dc run --rm --label "$candidate_work_label" \\
                -e DATABASE_NAME_OVERRIDE="$candidate" \\
                -e WCA_PROJECTION_INDEX_CONCURRENCY=2 \\
                data-tools /app/scripts/publish-projection-transfer.mjs \\
                  --prepare-only \\
                  --expected-export-date="$WCA_EXPORT_VALUE" \\
                  --groups="$PROJECTION_GROUPS" &
              wait_for_candidate_work "$!"
              dc run --rm --label "$candidate_work_label" \\
                -e DATABASE_NAME_OVERRIDE="$candidate" \\
                data-tools /app/scripts/publish-projection-transfer.mjs \\
                  --groups="$PROJECTION_GROUPS" &
              wait_for_candidate_work "$!"
              if [ "$PROJECTION_GROUPS" = "compatibility,result-facts,result-rankings,competition-rankings,person-competition-rankings,city-rankings,sum-of-ranks,yearly-person-rankings" ]; then
                dc run --rm --label "$candidate_work_label" \\
                  -e DATABASE_NAME_OVERRIDE="$candidate" \\
                  data-tools /app/scripts/check-ranking-projections.mjs &
                wait_for_candidate_work "$!"
              fi
              printf "projections_prepared\\n" > "$phase_file"
              phase=projections_prepared
            fi

`,
);

await writeFile(path, content);

#!/usr/bin/env sh
set -eu

cd /srv/wcarankings

docker compose exec -T db sh -c '
  exec mariadb \
    --batch \
    --skip-column-names \
    --user="$MARIADB_USER" \
    --password="$MARIADB_PASSWORD" \
    "$MARIADB_DATABASE"
' << 'SQL'
SELECT JSON_OBJECT(
  'generationId', generation_id,
  'exportId', export_id,
  'artifactFormatVersion', artifact_format_version,
  'datasetSchemaVersion', dataset_schema_version,
  'semanticFingerprints', COALESCE(JSON_EXTRACT(fingerprints_json, '$.semantic'), JSON_OBJECT()),
  'artifactFingerprints', COALESCE(JSON_EXTRACT(fingerprints_json, '$.artifacts'), JSON_OBJECT()),
  'artifactDigests', COALESCE(JSON_EXTRACT(fingerprints_json, '$.digests'), JSON_OBJECT()),
  'capabilities', COALESCE(JSON_EXTRACT(capabilities_json, '$'), JSON_OBJECT()),
  'sourceSha', source_sha,
  'artifactRunId', artifact_run_id,
  'artifactId', artifact_id,
  'activationTables', JSON_EXTRACT(activation_tables_json, '$'),
  'previousTables', JSON_EXTRACT(previous_tables_json, '$')
)
FROM ranking_generation_state
WHERE id = 1;
SQL

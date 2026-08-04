#!/usr/bin/env bash
set -euo pipefail

set -euo pipefail
transfer_root=$(mktemp -d)
cleanup_transfer() {
  docker compose exec -T db mariadb \
    --user=root --password="$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" \
    --execute="DROP TABLE IF EXISTS bulk_transfer_alpha, bulk_transfer_beta;" \
    > /dev/null 2>&1 || true
  rm -rf "$transfer_root"
}
trap cleanup_transfer EXIT
docker compose exec -T db mariadb \
  --user=root --password="$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" \
  --execute="
    CREATE TABLE bulk_transfer_alpha (
      id INT NOT NULL PRIMARY KEY,
      label VARCHAR(100) NOT NULL,
      nullable_value INT NULL
    );
    CREATE TABLE bulk_transfer_beta (
      id INT NOT NULL PRIMARY KEY,
      enabled TINYINT NOT NULL
    );
    INSERT INTO bulk_transfer_alpha VALUES
      (1, 'alpha', NULL),
      (2, CONCAT('tab', CHAR(9), 'value'), 42),
      (3, CONCAT('line', CHAR(10), 'value'), 7);
    INSERT INTO bulk_transfer_beta VALUES (1, 1), (2, 0);
  "
cat > "$transfer_root/transfer.json" << 'JSON'
{
  "group": "compatibility",
  "tables": ["bulk_transfer_alpha", "bulk_transfer_beta"]
}
JSON
node scripts/export-projection-transfer.mjs \
  --metadata="$transfer_root/transfer.json" \
  --output="$transfer_root/transfer.tar.gz"
docker compose exec -T db mariadb \
  --user=root --password="$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" \
  --execute="DROP TABLE bulk_transfer_alpha, bulk_transfer_beta"
mkdir -p "$transfer_root/files"
tar -xzf "$transfer_root/transfer.tar.gz" -C "$transfer_root/files"
chmod -R a+rX "$transfer_root"
DATA_TOOLS_IMAGE_REF=wcarankings-data-tools:pull-request \
  docker compose run --rm -T \
  -e DATABASE_NAME_OVERRIDE="$MYSQL_DATABASE" \
  -e WCA_PROJECTION_IMPORT_CONCURRENCY=2 \
  -v "$transfer_root/files:/projection-transfer:ro" \
  -v "$transfer_root/transfer.json:/projection-transfer.json:ro" \
  data-tools /app/scripts/import-projection-transfer.mjs \
  --directory=/projection-transfer \
  --metadata=/projection-transfer.json \
  --concurrency=2
restored=$(docker compose exec -T db mariadb \
  --user="$MYSQL_USER" --password="$MYSQL_PASSWORD" "$MYSQL_DATABASE" \
  --batch --skip-column-names \
  --execute="SELECT CONCAT(
    (SELECT COUNT(*) FROM bulk_transfer_alpha), ':',
    (SELECT COUNT(*) FROM bulk_transfer_alpha WHERE nullable_value IS NULL), ':',
    (SELECT COUNT(*) FROM bulk_transfer_beta), ':',
    (SELECT SUM(enabled) FROM bulk_transfer_beta)
  )")
test "$restored" = "3:1:2:1"

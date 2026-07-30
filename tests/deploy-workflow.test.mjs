import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(
  new URL("../.github/workflows/deploy.yml", import.meta.url),
  "utf8",
);
const refreshWorkflow = await readFile(
  new URL("../.github/workflows/refresh-rankings.yml", import.meta.url),
  "utf8",
);
const syncService = await readFile(
  new URL("../ops/wcarankings-sync.service", import.meta.url),
  "utf8",
);

test("builds deploy images from main when PR images are unavailable", () => {
  assert.match(workflow, /group: production-data-update/);
  assert.match(workflow, /id: pull-images/);
  assert.match(workflow, /echo "available=false" >> "\$GITHUB_OUTPUT"/);
  assert.match(
    workflow,
    /if: steps\.pull-images\.outputs\.available != 'true'[\s\S]*file: Dockerfile\.flyway/,
  );
  assert.match(
    workflow,
    /if: steps\.pull-images\.outputs\.available != 'true'[\s\S]*tags: wcarankings-app:\$\{\{ github\.sha \}\}/,
  );
  assert.match(workflow, /V3__projection_build_timing\.sql/);
  assert.match(workflow, /V4__result_projection_health\.sql/);
  assert.match(workflow, /refresh-system-lists\.mjs/);
  assert.match(workflow, /system-list-definitions\.mjs/);
});

test("reclaims obsolete deployment images before loading a new release", () => {
  assert.match(workflow, /protected_images=\$\(/);
  assert.match(workflow, /docker ps -q \| xargs -r docker inspect/);
  assert.match(
    workflow,
    /docker image inspect wcarankings-app:latest wcarankings-app:previous wcarankings-flyway:latest/,
  );
  assert.match(workflow, /wcarankings-app:\*\|wcarankings-flyway:\*/);
  assert.match(workflow, /docker image rm "\$image_ref" \|\| true/);
  assert.match(workflow, /docker image prune -f/);
});

test("builds projection transfers on Actions before publishing them atomically", () => {
  assert.match(workflow, /uses: actions\/cache\/restore@v4[\s\S]*wca-sql-export-/);
  assert.match(workflow, /uses: actions\/cache\/save@v4[\s\S]*wca-sql-export-/);
  assert.match(workflow, /Resolve target WCA export/);
  assert.match(workflow, /Resolve production WCA export/);
  assert.match(workflow, /0x6578706f72745f64617465/);
  assert.match(workflow, /resolve-wca-export\.mjs/);
  assert.match(workflow, /sync-wca-export\.mjs --dry-run/);
  assert.match(workflow, /key: projection-transfer-core-v2-/);
  assert.match(workflow, /key: projection-transfer-sum-of-ranks-v1-/);
  assert.match(workflow, /key: projection-transfer-yearly-v2-/);
  assert.match(workflow, /projection-build-plan\.mjs --groups="\$groups_csv"/);
  assert.match(workflow, /projection_names_csv=\$\(jq -r '\.projectionNames \| join\(","\)' \/tmp\/projection-build-plan\.json\)/);
  assert.match(workflow, /WCA_PROJECTION_BUILD_CONCURRENCY=2 node scripts\/sync-wca-export\.mjs --force --sql-path="\/tmp\/wca-export-cache\/wca-export-\$\{\{ steps\.wca-export\.outputs\.date \}\}\.sql\.zip" --projection-names="\$projection_names_csv"/);
  assert.match(workflow, /mapfile -t planned_groups/);
  assert.match(workflow, /sum_of_ranks_required/);
  assert.match(workflow, /publish_groups=.*yearly-person-rankings/);
  assert.match(workflow, /sync-wca-export\.mjs --force --raw-only --sql-path/);
  assert.match(workflow, /node scripts\/prepare-projection-transfer\.mjs/);
  assert.match(workflow, /mariadb-dump[\s\S]*projection-transfer\.sql\.gz/);
  assert.match(workflow, /publish-projection-transfer\.mjs/);
  assert.match(workflow, /name: Determine required projection transfer/);
  assert.match(workflow, /projection-transfer-state\.json/);
  assert.match(workflow, /if: steps\.projection-transfer\.outputs\.required == 'true'/);
  assert.match(workflow, /no ranking artifact was uploaded or imported/);
  assert.match(
    workflow,
    /mariadb --user="\$MARIADB_USER" --password="\$MARIADB_PASSWORD" "\$MARIADB_DATABASE"/,
  );
  assert.doesNotMatch(
    workflow,
    /docker compose run --rm app node \/app\/scripts\/backfill-result-entries\.mjs/,
  );
});

test("supports manual and scheduled production ranking refreshes", () => {
  assert.match(refreshWorkflow, /workflow_dispatch:/);
  assert.match(refreshWorkflow, /schedule:/);
  assert.match(refreshWorkflow, /cron: "17 5 \* \* \*"/);
  assert.match(refreshWorkflow, /dry_run:/);
  assert.match(refreshWorkflow, /group: production-data-update/);
  assert.match(refreshWorkflow, /Resolve target WCA export/);
  assert.match(refreshWorkflow, /Build and export fresh projection generation/);
  assert.match(refreshWorkflow, /Cache restore: intentionally skipped for refresh/);
  assert.match(refreshWorkflow, /sync-wca-export\.mjs --force --sql-path/);
  assert.match(refreshWorkflow, /sync-wca-export\.mjs --force --raw-only --sql-path/);
  assert.match(refreshWorkflow, /check-ranking-projections\.mjs/);
  assert.match(syncService, /Deprecated/);
  assert.match(syncService, /ConditionPathExists=\/srv\/wcarankings\/ENABLE_DEPRECATED_SERVER_REFRESH/);
  assert.doesNotMatch(syncService, /sync-wca-export\.mjs/);
});

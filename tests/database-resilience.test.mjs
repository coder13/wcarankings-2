import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const [history, serverDeploy, projectionDeploy] = await Promise.all([
  readFile(new URL("scripts/prepare-flyway-history.mjs", root), "utf8"),
  readFile(new URL(".github/workflows/deploy-server.yml", root), "utf8"),
  readFile(new URL(".github/workflows/deploy-projections.yml", root), "utf8"),
]);

test("splits legacy Flyway history by immutable migration script", () => {
  assert.match(history, /async function migrations/);
  assert.match(history, /version IN \(\$\{versionPlaceholders\}\)/);
  assert.match(history, /script NOT IN \(\$\{placeholders\}\)/);
  assert.match(history, /script IN \(\$\{placeholders\}\)/);
  assert.match(history, /\[\.\.\.versions, \.\.\.scripts\]/);
});

test("server deploy applies the results migration lane to production", () => {
  assert.match(serverDeploy, /CREATE TABLE IF NOT EXISTS result_attempts/);
  assert.match(serverDeploy, /FLYWAY_LOCATIONS=filesystem:\/flyway\/migrations\/results/);
  assert.match(serverDeploy, /FLYWAY_TABLE=flyway_schema_history_results/);
  assert.match(serverDeploy, /FLYWAY_OUT_OF_ORDER=true/);
  assert.match(serverDeploy, /MariaDB did not cool below 50% CPU before server cutover/);
});

test("projection activation waits for MariaDB to settle", () => {
  assert.match(projectionDeploy, /wait_for_database_cooldown/);
  assert.match(projectionDeploy, /cool_samples.*-ge 3/);
  assert.match(projectionDeploy, /cpu < 50/);
  assert.match(
    projectionDeploy,
    /if \[ "\$phase" = projections_prepared \]; then\s+wait_for_database_cooldown\s+docker compose run --rm -T/,
  );
});

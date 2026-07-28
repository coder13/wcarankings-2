import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(
  new URL("../.github/workflows/deploy.yml", import.meta.url),
  "utf8",
);

test("builds deploy images from main when PR images are unavailable", () => {
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

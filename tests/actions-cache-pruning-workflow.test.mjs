import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("prunes Actions caches on closed pull requests and on a weekly schedule", async () => {
  const workflow = await readFile(
    new URL(".github/workflows/prune-actions-caches.yml", root),
    "utf8",
  );

  assert.match(workflow, /pull_request:\n    types: \[closed\]/);
  assert.match(workflow, /cron: "23 4 \* \* 0"/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /actions: write/);
  assert.match(workflow, /refs\/pull\/\$\{\{ github\.event\.pull_request\.number \}\}\/merge/);
  assert.match(workflow, /TARGET_BYTES: "7500000000"/);
  assert.match(workflow, /gh cache delete/);
  assert.match(workflow, /--sort last_accessed_at --order asc/);
  assert.match(workflow, /read -r cache_id cache_key <<< "\$oldest"/);
  assert.doesNotMatch(workflow, /\n\$oldest\nEOF\n/);
});

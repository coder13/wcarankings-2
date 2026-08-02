import { readFile, writeFile } from "node:fs/promises";

const path = "tests/deploy-workflow.test.mjs";
let content = await readFile(path, "utf8");

function replaceStatementStarting(prefix, replacement) {
  const start = content.indexOf(prefix);
  if (start < 0) return;
  const end = content.indexOf(");", start);
  if (end < 0) throw new Error(`Could not find end of test statement starting ${prefix}`);
  content = `${content.slice(0, start)}${replacement}${content.slice(end + 2)}`;
}

if (!content.includes("WCA_PROJECTION_INDEX_CONCURRENCY=2")) {
  replaceStatementStarting(
    "  assert.match(projectionDeploy, /chunk-projection-dump",
    `  assert.match(projectionDeploy, /import-projection-transfer\\.mjs/);
  assert.match(projectionDeploy, /--concurrency=2/);
  assert.match(projectionDeploy, /WCA_PROJECTION_INDEX_CONCURRENCY=2/);
  assert.doesNotMatch(projectionDeploy, /chunk-projection-dump\\.mjs/);`,
  );
}
content = content.replace(
  `  assert.equal((projectionDeploy.match(/dc_with_stdin (?:run|exec)/g) || []).length, 4);`,
  `  assert.equal((projectionDeploy.match(/dc_with_stdin (?:run|exec)/g) || []).length, 3);`,
);
if (!content.includes("Stage exact generation directly from GHCR")) {
  replaceStatementStarting(
    "  assert.match(projectionDeploy, /gzip -dc",
    `  assert.match(projectionDeploy, /tar -xzf "\\$archive" -C "\\$transfer_directory"/);
  assert.ok(projectionDeploy.includes('-v "$transfer_directory:/projection-transfer:ro"'));
  assert.match(projectionDeploy, /import-projection-transfer\\.mjs[\\s\\S]*?--metadata=\\/projection-transfer\\.json/);
  assert.match(projectionDeploy, /Stage exact generation directly from GHCR/);
  assert.match(projectionDeploy, /oras pull "\\$ref"/);
  assert.match(projectionDeploy, /docker --config "\\$auth_directory" pull "\\$DATA_TOOLS_IMAGE"/);
  assert.doesNotMatch(projectionDeploy, /docker save/);`,
  );
}
await writeFile(path, content);

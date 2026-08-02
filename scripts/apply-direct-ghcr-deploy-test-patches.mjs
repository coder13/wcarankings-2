import { readFile, writeFile } from "node:fs/promises";

const path = "tests/deploy-workflow.test.mjs";
let content = await readFile(path, "utf8");
content = content.replace(
  `  assert.match(projectionDeploy, /chunk-projection-dump\\.mjs \\\\\n\\s+--import --rows-per-insert=1000/);`,
  `  assert.match(projectionDeploy, /import-projection-transfer\\.mjs/);\n  assert.match(projectionDeploy, /--concurrency=2/);\n  assert.match(projectionDeploy, /WCA_PROJECTION_INDEX_CONCURRENCY=2/);\n  assert.doesNotMatch(projectionDeploy, /chunk-projection-dump\\.mjs/);`,
);
content = content.replace(
  `  assert.equal((projectionDeploy.match(/dc_with_stdin (?:run|exec)/g) || []).length, 4);`,
  `  assert.equal((projectionDeploy.match(/dc_with_stdin (?:run|exec)/g) || []).length, 3);`,
);
content = content.replace(
  `  assert.match(projectionDeploy, /gzip -dc[\\s\\S]*?\\| dc_with_stdin run --rm -T[\\s\\S]*?chunk-projection-dump\\.mjs/);`,
  `  assert.match(projectionDeploy, /tar -xzf "\\$archive" -C "\\$transfer_directory"/);\n  assert.match(projectionDeploy, /-v "\\$transfer_directory:\/projection-transfer:ro"/);\n  assert.match(projectionDeploy, /import-projection-transfer\\.mjs[\\s\\S]*?--metadata=\/projection-transfer\\.json/);\n  assert.match(projectionDeploy, /Stage exact generation directly from GHCR/);\n  assert.match(projectionDeploy, /oras pull "\\$ref"/);\n  assert.match(projectionDeploy, /docker --config "\\$auth_directory" pull "\\$DATA_TOOLS_IMAGE"/);\n  assert.doesNotMatch(projectionDeploy, /docker save/);`,
);
await writeFile(path, content);

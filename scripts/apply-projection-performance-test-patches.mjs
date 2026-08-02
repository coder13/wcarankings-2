import { readFile, writeFile } from "node:fs/promises";

async function replaceOnce(path, before, after) {
  const content = await readFile(path, "utf8");
  if (!content.includes(before)) throw new Error(`Could not find expected content in ${path}`);
  await writeFile(path, content.replace(before, after));
}

await replaceOnce(
  "tests/deploy-workflow.test.mjs",
  `  builder,\n  serverBuild,`,
  `  builder,\n  groupBuilder,\n  serverBuild,`,
);
await replaceOnce(
  "tests/deploy-workflow.test.mjs",
  `  workflow("build-projections.yml"),\n  workflow("build-server.yml"),`,
  `  workflow("build-projections.yml"),\n  workflow("build-projection-group.yml"),\n  workflow("build-server.yml"),`,
);
await replaceOnce(
  "tests/deploy-workflow.test.mjs",
  `test("incremental planning classifies active, cached, build, and hydrate groups", () => {\n  assert.match(planner, /Finalize active, cached, build, and hydrate groups/);\n  assert.match(planner, /available_artifacts/);\n  assert.match(planner, /build_groups/);\n  assert.match(planner, /hydrate_groups/);\n  assert.match(planner, /Quarantining corrupt projection artifact/);\n  assert.match(projectionRelease, /supersession:/);\n  assert.match(projectionRelease, /ref: main/);\n});`,
  `test("incremental planning classifies active, cached, build, and hydrate groups", () => {\n  assert.match(planner, /Finalize active, cached, build, and hydrate groups/);\n  assert.match(planner, /available_artifacts/);\n  assert.match(planner, /build_groups/);\n  assert.match(planner, /hydrate_groups/);\n  assert.match(planner, /Ignoring projection artifact with invalid OCI metadata/);\n  assert.match(planner, /oras manifest fetch/);\n  assert.doesNotMatch(planner, /oras pull/);\n  assert.match(projectionRelease, /check-projection-supersession\\.yml/);\n  assert.match(projectionRelease, /needs\\.supersession\\.outputs\\.safe == 'true'/);\n});`,
);
await replaceOnce(
  "tests/deploy-workflow.test.mjs",
  `test("group artifacts use GHCR and cached dependencies hydrate before a two-worker build", () => {\n  assert.match(builder, /oras pull "\\$\\{repository\\}@\\$\\{digest\\}"/);\n  assert.match(builder, /oras push "\\$ref"/);\n  const publishStart = builder.indexOf("      - name: Publish newly built group artifacts to GHCR");\n  const publishEnd = builder.indexOf("      - name: Compose exact production release bundle", publishStart);\n  assert.ok(publishStart >= 0 && publishEnd > publishStart);\n  const publish = builder.slice(publishStart, publishEnd);\n  assert.match(publish, /pushd "\\$directory" >\\/dev\\/null/);\n  assert.match(publish, /"projection-release\\.json:application\\/vnd\\.cuberanks\\.projection\\.manifest\\.v3\\+json"/);\n  assert.match(publish, /"\\$archive:application\\/vnd\\.cuberanks\\.projection\\.sql\\+gzip"/);\n  assert.match(publish, /"\\$metadata:application\\/vnd\\.cuberanks\\.projection\\.transfer\\+json"/);\n  assert.match(publish, /popd >\\/dev\\/null/);\n  const orasPush = publish.match(/oras push "\\$ref"[\\s\\S]*?popd >\\/dev\\/null/);\n  assert.ok(orasPush, "the artifact publish must run from the artifact directory");\n  assert.doesNotMatch(orasPush[0], /"\\$directory\\//);\n  assert.doesNotMatch(builder, /projection-release-group-/);\n  assert.match(builder, /publish-projection-transfer\\.mjs --hydrate/);\n  assert.match(builder, /--satisfied-groups="\\$HYDRATE_GROUPS"/);\n  assert.match(builder, /WCA_PROJECTION_BUILD_CONCURRENCY=2/);\n  assert.match(builder, /repair-\\$\\{GITHUB_RUN_ID\\}-\\$\\{GITHUB_RUN_ATTEMPT\\}/);\n});`,
  `test("group artifacts use GHCR and cached dependencies hydrate before isolated builds", () => {\n  assert.match(builder, /projection-build-matrix\\.mjs --wave=1/);\n  assert.match(builder, /projection-build-matrix\\.mjs --wave=2/);\n  assert.match(builder, /strategy:[\\s\\S]*matrix:/);\n  assert.match(groupBuilder, /oras pull "\\$\\{repository\\}@\\$\\{digest\\}"/);\n  assert.match(groupBuilder, /oras push "\\$ref"/);\n  assert.match(groupBuilder, /application\\/vnd\\.cuberanks\\.projection\\.tables\\.v1\\+gzip/);\n  assert.match(groupBuilder, /import-projection-transfer\\.mjs/);\n  assert.match(groupBuilder, /publish-projection-transfer\\.mjs --hydrate/);\n  assert.match(groupBuilder, /--satisfied-groups="\\$HYDRATE_GROUPS"/);\n  assert.match(groupBuilder, /WCA_PROJECTION_BUILD_CONCURRENCY=2/);\n  assert.match(groupBuilder, /repair-\\$\\{GITHUB_RUN_ID\\}-\\$\\{GITHUB_RUN_ATTEMPT\\}/);\n  assert.match(builder, /path: \\/tmp\\/projection-release\\/projection-release\\.json/);\n  assert.doesNotMatch(builder, /projection-release-group-/);\n});`,
);
await replaceOnce(
  "tests/deploy-workflow.test.mjs",
  `test("Node dependency consumers use the pinned pnpm lockfile", () => {\n  for (const nodeWorkflow of [pullRequest, planner, builder]) {`,
  `test("Node dependency consumers use the pinned pnpm lockfile", () => {\n  for (const nodeWorkflow of [pullRequest, groupBuilder]) {`,
);

await replaceOnce(
  "tests/projection-architecture.test.mjs",
  `  assert.match(personCompetitionRankings, /COUNT\\(DISTINCT result\\.competition_id\\)/);`,
  `  assert.match(personCompetitionRankings, /COUNT\\(DISTINCT competition_id\\)/);\n  assert.match(personCompetitionRankings, /FROM result_facts/);`,
);
await replaceOnce(
  "tests/projection-architecture.test.mjs",
  `  assert.match(cities, /person\\.gender IN \\('m', 'f'\\)/);\n  assert.match(cities, /SELECT base\\.\\*, 'all' AS gender FROM base/);\n  assert.match(cities, /COUNT\\(DISTINCT scoped\\.person_id\\) AS competitor_count/);\n  assert.match(cities, /COUNT\\(DISTINCT scoped\\.competition_id\\) AS competition_count/);`,
  `  assert.match(cities, /facts\\.person_gender AS gender/);\n  assert.match(cities, /SELECT facts\\.\\*, 'all' AS gender/);\n  assert.match(cities, /COUNT\\(DISTINCT person_id\\) AS competitor_count/);\n  assert.match(cities, /COUNT\\(DISTINCT competition_id\\) AS competition_count/);\n  assert.match(cities, /attempt_counts AS/);`,
);

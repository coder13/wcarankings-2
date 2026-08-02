import { readFile, writeFile } from "node:fs/promises";

const path = "tests/projection-architecture.test.mjs";
let content = await readFile(path, "utf8");
content = content.replace(
  /assert\.match\(personCompetitionRankings, \/COUNT\\\(DISTINCT competition_id\\\)\/\);/,
  "assert.match(personCompetitionRankings, /COUNT\\(DISTINCT facts\\.competition_id\\)/);",
);
content = content.replace(
  "  assert.match(cities, /facts\\.person_gender AS gender/);",
  "  assert.match(cities, /person\\.gender IN \\('m', 'f'\\)/);",
);
content = content.replace(
  "  assert.match(cities, /SELECT facts\\.\\*, 'all' AS gender/);",
  "  assert.match(cities, /SELECT base\\.\\*, 'all' AS gender FROM base/);",
);
if (!content.includes("assert.match(cities, /comp\\.country_id/);")) {
  content = content.replace(
    "  assert.match(cities, /attempt_counts AS/);",
    "  assert.match(cities, /attempt_counts AS/);\n  assert.match(cities, /comp\\.country_id/);",
  );
}
await writeFile(path, content);

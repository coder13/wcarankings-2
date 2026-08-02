import { readFile, writeFile } from "node:fs/promises";

const path = "tests/projection-architecture.test.mjs";
let content = await readFile(path, "utf8");
content = content.replace(
  /assert\.match\(personCompetitionRankings, \/COUNT\\\(DISTINCT competition_id\\\)\/\);/,
  "assert.match(personCompetitionRankings, /COUNT\\(DISTINCT facts\\.competition_id\\)/);",
);
await writeFile(path, content);

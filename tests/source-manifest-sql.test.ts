import assert from "node:assert/strict";
import test from "node:test";
import { sourceManifestFromSql } from "../data-tools/projections/release/source-manifest-sql.ts";

async function* chunks(value: string): AsyncGenerator<string> { yield value.slice(0, 41); yield value.slice(41); }

test("scans competition, result, attempt, and person rows in one pass", async () => {
  const sql = [
    "INSERT INTO `competitions` VALUES\n",
    "('TestOpen2020','Test','City','USA','meta',2020,1,1,2020,1,1,0,'333','meta','meta','meta','meta','meta','meta','Test',1,2);\n",
    "INSERT INTO `results` VALUES\n",
    "(10,'TestOpen2020','333','1',1,100,200,'Name','2000TEST01','USA','a',NULL,NULL);\n",
    "INSERT INTO `result_attempts` VALUES\n",
    "(100,1,10);\n",
    "INSERT INTO `persons` VALUES\n",
    "('2000TEST01',1,'Name','USA','m');\n",
  ].join("");
  const result = await sourceManifestFromSql(chunks(sql), "2026-08-06T00:00:00Z");
  assert.equal(result.competitions.TestOpen2020.resultCount, 1);
  assert.equal(result.competitions.TestOpen2020.attemptCount, 0);
  assert.equal(result.years["2020"]?.competitionCount, 1);
  assert.notEqual(result.dimensions.attemptsHash, "");
});

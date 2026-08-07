import assert from "node:assert/strict";
import test from "node:test";
import { dirtySql, quoteYears } from "../scripts/projections/build/merge-yearly-rankings.ts";

test("dirty yearly SQL isolates output tables and selected years", () => {
  const sql = "CREATE TABLE person_year_rankings_single AS SELECT * FROM person_event_bests WHERE period_year > 0;";
  const result = dirtySql(sql, [2019, 2026]);
  assert.match(result, /person_year_rankings_single_dirty/);
  assert.match(result, /period_year IN \(2019,2026\)/);
  assert.doesNotMatch(result, /period_year > 0/);
});

test("rejects empty or invalid dirty-year lists", () => {
  assert.throws(() => quoteYears([]), /valid ranking year/);
  assert.throws(() => quoteYears([0]), /valid ranking year/);
});

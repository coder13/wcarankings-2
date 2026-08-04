import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("yearly person rankings retain historical cohorts and deterministic ties", async () => {
  const [cohorts, single, average, counts, schema, rankings, queries, metadata] = await Promise.all([
    readFile(new URL("sql/ranking-projections/person_year_ranking_cohorts.sql", root), "utf8"),
    readFile(new URL("sql/ranking-projections/person_year_rankings_single.sql", root), "utf8"),
    readFile(new URL("sql/ranking-projections/person_year_rankings_average.sql", root), "utf8"),
    readFile(new URL("sql/ranking-projections/person_year_ranking_counts.sql", root), "utf8"),
    readFile(new URL("scripts/mysql-schema.mjs", root), "utf8"),
    readFile(new URL("services/rankings/service.ts", root), "utf8"),
    readFile(new URL("services/rankings/queries.ts", root), "utf8"),
    readFile(new URL("services/rankings/metadata.ts", root), "utf8"),
  ]);
  assert.match(cohorts, /ROW_NUMBER\(\) OVER/);
  assert.match(cohorts, /FROM countries/);
  for (const source of [single, average]) {
    assert.match(source, /YEAR\(competition_start_date\)/);
    assert.match(source, /PARTITION BY YEAR\(competition_start_date\), event_id, person_id, person_country_id/);
    assert.match(source, /RANK\(\) OVER/);
    assert.match(source, /ROW_NUMBER\(\) OVER/);
    assert.match(source, /person_year_ranking_cohorts/);
  }
  assert.match(counts, /ranking_type/);
  assert.match(schema, /person-year-rankings/);
  assert.match(rankings, /parseYear/);
  assert.match(metadata, /yearCountsQuery\(\)/);
  assert.match(rankings, /filteredYearlyRankingPageQuery/);
  assert.match(queries, /RANK\(\) OVER \(ORDER BY result_value\)/);
});

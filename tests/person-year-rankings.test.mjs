import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("yearly person rankings retain historical cohorts and deterministic ties", async () => {
  const [cohorts, single, average, counts, definition, rankings, metadata] =
    await Promise.all([
      readFile(
        new URL(
          "data-tools/projection-catalog/people/year-rankings/person_year_ranking_cohorts.sql",
          root,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "data-tools/projection-catalog/people/year-rankings/person_year_rankings_single.sql",
          root,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "data-tools/projection-catalog/people/year-rankings/person_year_rankings_average.sql",
          root,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "data-tools/projection-catalog/people/year-rankings/person_year_ranking_counts.sql",
          root,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "data-tools/projection-catalog/people/year-rankings/definition.ts",
          root,
        ),
        "utf8",
      ),
      readFile(new URL("services/rankings/service.ts", root), "utf8"),
      readFile(new URL("services/rankings/metadata.ts", root), "utf8"),
    ]);
  assert.match(cohorts, /ROW_NUMBER\(\) OVER/);
  assert.match(cohorts, /FROM countries/);
  for (const source of [single, average]) {
    assert.match(source, /competition_year AS ranking_year/);
    assert.match(
      source,
      /PARTITION BY competition_year, event_id, person_id, person_country_id/,
    );
    assert.match(source, /RANK\(\) OVER/);
    assert.match(source, /ROW_NUMBER\(\) OVER/);
    assert.match(source, /person_year_ranking_cohorts/);
  }
  assert.match(counts, /ranking_type/);
  assert.match(definition, /person-year-rankings/);
  assert.match(rankings, /parseYear/);
  assert.match(metadata, /yearCountsQuery/);
});

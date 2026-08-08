import assert from "node:assert/strict";
import test from "node:test";
import { personEventResultProgressQuery } from "@/services/rankings/queries/person-results";

test("builds PR History from the result ranking projection", () => {
  const query = personEventResultProgressQuery({
    source: "result_rankings_single",
    hasStoredDate: true,
  });

  assert.match(query, /FROM\s+result_rankings_single ranking/);
  assert.match(query, /MIN\(ranking\.result_value\)/);
  assert.match(query, /LAG\(best_value\)/);
  assert.doesNotMatch(query, /FROM results/);
});

test("uses result facts for Average competition dates", () => {
  const query = personEventResultProgressQuery({
    source: "result_rankings_average",
    hasStoredDate: false,
    year: 2024,
  });

  assert.match(query, /INNER JOIN result_facts facts/);
  assert.match(query, /YEAR\(facts\.competition_start_date\) = \?/);
});

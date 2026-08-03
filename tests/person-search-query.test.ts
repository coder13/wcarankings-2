import assert from "node:assert/strict";
import test from "node:test";
import {
  personCompetitionCountsQuery,
  personSearchRowsQuery,
} from "@/services/people/queries";

const input = {
  search: "luke",
  regexSearch: false,
  limit: 25,
  offset: 0,
};

test("person search can run without the optional competition count projection", () => {
  const query = personSearchRowsQuery(input, false);

  assert.doesNotMatch(query, /person_competition_counts/);
  assert.match(query, /0 AS competition_count/);
});

test("person search fallback batches competition counts from results", () => {
  assert.equal(
    personCompetitionCountsQuery(["2014GARN01", "2022GARN01"]),
    "SELECT person_id, COUNT(DISTINCT competition_id) AS competition_count\n" +
      "     FROM results\n" +
      "     WHERE person_id IN (?, ?)\n" +
      "     GROUP BY person_id",
  );
});

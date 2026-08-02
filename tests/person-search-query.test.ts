import assert from "node:assert/strict";
import test from "node:test";
import { personSearchRowsQuery } from "@/services/people/queries";

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

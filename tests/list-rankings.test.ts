import assert from "node:assert/strict";
import test from "node:test";
import { parseListRankingInput } from "@/lib/list-rankings";

test("normalizes list ranking query parameters", () => {
  const input = parseListRankingInput(
    new URLSearchParams({
      event: "444",
      type: "average",
      start: "25",
      limit: "5000",
      search: " Max ",
    }),
  );
  assert.deepEqual(input, {
    eventId: "444",
    type: "average",
    start: 25,
    limit: 100,
    search: "Max",
    locate: "",
    gender: [],
  });
});

test("forces Multi-Blind to single rankings", () => {
  const input = parseListRankingInput(
    new URLSearchParams({
      eventId: "333mbf",
      result: "average",
    }),
  );
  assert.equal(input.type, "single");
  assert.deepEqual(input.gender, []);
});

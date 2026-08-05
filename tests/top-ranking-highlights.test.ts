import assert from "node:assert/strict";
import test from "node:test";
import {
  orderTopRankingHighlightCandidates,
  parseTopRankingHighlightsPersonId,
  type TopRankingHighlightSourceRow,
} from "@/services/people/top-ranking-highlights";

function row(
  eventId: string,
  overrides: Partial<TopRankingHighlightSourceRow> = {},
): TopRankingHighlightSourceRow {
  return {
    event_id: eventId,
    result_type: "single",
    gender: "f",
    country_id: "Canada",
    continent_id: "_North America",
    country_name: "Canada",
    continent_name: "North America",
    competition_year: 2023,
    world_rank: 2,
    continent_rank: 1,
    country_rank: 1,
    ...overrides,
  };
}

test("de-duplicates matching profile ranking highlights", () => {
  const candidates = orderTopRankingHighlightCandidates([
    row("333"),
    row("333"),
  ]);

  assert.equal(candidates.length, 12);
  assert.equal(new Set(candidates.map((candidate) => candidate.id)).size, 12);
});

test("interleaves events before another variant of the same event", () => {
  const candidates = orderTopRankingHighlightCandidates([
    row("333"),
    row("222", { world_rank: 1 }),
    row("444", { country_rank: 7 }),
  ]);

  assert.deepEqual(
    candidates.slice(0, 3).map((candidate) => candidate.eventId),
    ["222", "333", "444"],
  );
  assert.notEqual(candidates[0].eventId, candidates[1].eventId);
});

test("normalizes and validates the profile WCA ID", () => {
  assert.equal(parseTopRankingHighlightsPersonId(" 2021zajd03 "), "2021ZAJD03");
  assert.throws(
    () => parseTopRankingHighlightsPersonId("not-a-wca-id"),
    /wcaId must be a valid WCA ID/,
  );
});

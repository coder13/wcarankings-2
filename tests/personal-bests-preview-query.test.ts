import assert from "node:assert/strict";
import test from "node:test";
import {
  mapPersonalBestsPreviewRows,
  parsePersonalBestsPreviewPersonId,
  personalBestsPreviewQuery,
} from "../services/people/personal-bests-preview";

test("the personal bests preview normalizes the person ID", () => {
  assert.equal(parsePersonalBestsPreviewPersonId("2021zajd03"), "2021ZAJD03");
});

test("the personal bests preview reads only one person's indexed rows", () => {
  const query = personalBestsPreviewQuery();
  assert.match(query, /FROM person_event_rankings/);
  assert.match(query, /WHERE person_id = \?/);
  assert.doesNotMatch(query, /result_facts/);
});

test("the personal bests preview groups result types in WCA event order", () => {
  const entries = mapPersonalBestsPreviewRows([
    {
      event_id: "222",
      result_type: "average",
      result_value: 93,
      world_rank: 5,
      continent_rank: 1,
      country_rank: 1,
    },
    {
      event_id: "333",
      result_type: "single",
      result_value: 276,
      world_rank: 1,
      continent_rank: 1,
      country_rank: 1,
    },
  ]);

  assert.deepEqual(entries, [
    {
      eventId: "333",
      single: {
        value: 276,
        ranks: [
          { scope: "WR", value: 1 },
          { scope: "CR", value: 1 },
          { scope: "NR", value: 1 },
        ],
      },
    },
    {
      eventId: "222",
      average: {
        value: 93,
        ranks: [
          { scope: "WR", value: 5 },
          { scope: "CR", value: 1 },
          { scope: "NR", value: 1 },
        ],
      },
    },
  ]);
});

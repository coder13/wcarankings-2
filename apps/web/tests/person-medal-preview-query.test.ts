import assert from "node:assert/strict";
import test from "node:test";
import {
  parsePersonMedalPreviewInput,
  personMedalPreviewQuery,
} from "../services/people/medal-preview";

test("the medal preview normalizes the person ID and accepts an event", () => {
  assert.deepEqual(
    parsePersonMedalPreviewInput(
      "2014niel03",
      new URLSearchParams({ event: "333" }),
    ),
    { personId: "2014NIEL03", eventId: "333" },
  );
});

test("the medal preview counts valid final-round medals", () => {
  const allEvents = personMedalPreviewQuery(null);
  const oneEvent = personMedalPreviewQuery("333");

  assert.match(allEvents, /facts\.is_final_round = 1/);
  assert.match(allEvents, /facts\.position BETWEEN 1 AND 3/);
  assert.match(allEvents, /facts\.best > 0 OR facts\.average > 0/);
  assert.doesNotMatch(allEvents, /facts\.event_id = \?/);
  assert.match(oneEvent, /AND facts\.event_id = \?/);
});

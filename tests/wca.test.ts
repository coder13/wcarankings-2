import assert from "node:assert/strict";
import test from "node:test";
import {
  formatWcaResult,
  isRankingEventId,
  isSubX333RankingEventId,
  SUB_X_333_RANKING_EVENTS,
  subX333ThresholdForEventId,
} from "../lib/wca";

test("treats Sum of Ranks metrics as ranking events", () => {
  assert.equal(isRankingEventId("SOR"), true);
  assert.equal(isRankingEventId("sor-kinch"), true);
});

test("formats Kinch totals as fixed two-decimal scores", () => {
  assert.equal(formatWcaResult("sor-kinch", 67.62909125), "67.63");
  assert.equal(formatWcaResult("sor-kinch", 0), "0.00");
});

test("exposes the supported 3x3 Sub-X ranking family", () => {
  assert.deepEqual(
    SUB_X_333_RANKING_EVENTS.map((event) => event.id),
    ["333-sub-500", "333-sub-600", "333-sub-700", "333-sub-800", "333-sub-900", "333-sub-1000", "333-sub-1100", "333-sub-1200", "333-sub-1500", "333-sub-2000"],
  );
  assert.equal(SUB_X_333_RANKING_EVENTS[0]?.name, "Most Sub-5 3x3 Singles");
  assert.equal(SUB_X_333_RANKING_EVENTS.at(-1)?.shortName, "Sub-20");
  assert.equal(isRankingEventId("333-sub-800"), true);
  assert.equal(isSubX333RankingEventId("333-sub-800"), true);
  assert.equal(isSubX333RankingEventId("333-sub-850"), false);
  assert.equal(subX333ThresholdForEventId("333-sub-800"), 800);
  assert.equal(subX333ThresholdForEventId("333"), null);
});

test("formats Sub-X values as integer solve counts", () => {
  assert.equal(formatWcaResult("333-sub-500", 1234), "1,234");
  assert.equal(formatWcaResult("333-sub-500", 0), "—");
});

import assert from "node:assert/strict";
import test from "node:test";
import { formatWcaResult, isRankingEventId } from "../lib/wca";

test("treats Sum of Ranks metrics as ranking events", () => {
  assert.equal(isRankingEventId("SOR"), true);
  assert.equal(isRankingEventId("sor-kinch"), true);
});

test("formats Kinch totals as fixed two-decimal scores", () => {
  assert.equal(formatWcaResult("sor-kinch", 67.62909125), "67.63");
  assert.equal(formatWcaResult("sor-kinch", 0), "0.00");
});

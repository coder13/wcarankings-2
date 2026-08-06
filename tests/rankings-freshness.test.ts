import assert from "node:assert/strict";
import test from "node:test";
import { formatRankingsFreshness } from "@/components/RankingsExplorer/types";

test("labels the WCA export date ahead of the local import time", () => {
  assert.equal(
    formatRankingsFreshness("2026-07-28"),
    "WCA export dated Jul 28, 2026",
  );
});

test("does not label local projection time as result freshness", () => {
  assert.equal(formatRankingsFreshness(null), "WCA export date unavailable");
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  getScrollAnimationDuration,
  getEndSubRank,
  clampTargetSubRank,
  getPagerJumpTarget,
  getSearchAnimationDuration,
  getSearchBridgePageStarts,
  getSearchJumpMode,
  getPrefetchRowCount,
  shouldPrefetchExtraPage,
  isDuplicateRank,
  DISTANT_SCROLL_DURATION_MS,
  MAX_LOCAL_SCROLL_DURATION_MS,
  MIN_LOCAL_SCROLL_DURATION_MS,
  MULTI_PAGE_SCROLL_DURATION_MS,
} from "../components/RankingsExplorer/scrollEngine.ts";
import { RESULTS_PAGE_SIZE } from "../lib/rankings-config.ts";

test("uses a diminishing duration curve between its configured bounds", () => {
  const expectedDuration = (distance) => {
    const localDistance = Math.max(1, Math.abs(distance));
    const localRange = 99;
    return (
      MIN_LOCAL_SCROLL_DURATION_MS +
      Math.round(
        Math.sqrt((localDistance - 1) / localRange) *
          (MAX_LOCAL_SCROLL_DURATION_MS -
            MIN_LOCAL_SCROLL_DURATION_MS)
      )
    );
  };
  assert.equal(getScrollAnimationDuration(0), MIN_LOCAL_SCROLL_DURATION_MS);
  assert.equal(getScrollAnimationDuration(1), MIN_LOCAL_SCROLL_DURATION_MS);
  assert.equal(getScrollAnimationDuration(-1), MIN_LOCAL_SCROLL_DURATION_MS);
  assert.equal(getScrollAnimationDuration(4), expectedDuration(4));
  assert.equal(getScrollAnimationDuration(50), expectedDuration(50));
  assert.equal(getScrollAnimationDuration(100), MAX_LOCAL_SCROLL_DURATION_MS);
  assert.ok(
    getScrollAnimationDuration(2) - getScrollAnimationDuration(1) >
      getScrollAnimationDuration(100) - getScrollAnimationDuration(99)
  );
  assert.equal(getScrollAnimationDuration(101), DISTANT_SCROLL_DURATION_MS);
  assert.equal(
    getScrollAnimationDuration(100_000),
    DISTANT_SCROLL_DURATION_MS
  );
});

test("marks only an adjacent repeated rank as a duplicate", () => {
  assert.equal(isDuplicateRank(42, 42), true);
  assert.equal(isDuplicateRank(41, 42), false);
  assert.equal(isDuplicateRank(undefined, 42), false);
  assert.equal(isDuplicateRank(null, 42), false);
});

test("targets the known ranking total when jumping to the end", () => {
  assert.equal(getEndSubRank(291_763, 50, 1), 291_763);
  assert.equal(getEndSubRank(10_000, 9_950, 9_925), 10_000);
  assert.equal(getEndSubRank(Number.POSITIVE_INFINITY, 50, 1), 50);
  assert.equal(getEndSubRank(Number.POSITIVE_INFINITY, null, 42), 42);
});

test("clamps jumps against the ranking total instead of the loaded page", () => {
  assert.equal(clampTargetSubRank(5_001, 280_935, 50), 5_001);
  assert.equal(clampTargetSubRank(300_000, 280_935, 50), 280_935);
  assert.equal(clampTargetSubRank(5_001, Number.POSITIVE_INFINITY, 50), 50);
});

test("derives each pager jump from the settled ranking position", () => {
  assert.equal(getPagerJumpTarget(10_000, -1, 291_763), 5_000);
  assert.equal(getPagerJumpTarget(10_000, 1, 291_763), 15_000);
  assert.equal(getPagerJumpTarget(5_000, -1, 291_763), 1);
  assert.equal(getPagerJumpTarget(288_000, 1, 291_763), 291_763);
});

test("extends the page prefetch buffer for fast downward scrolling", () => {
  assert.equal(getPrefetchRowCount(0), 12);
  assert.equal(getPrefetchRowCount(0.99), 12);
  assert.equal(getPrefetchRowCount(1), 32);
  assert.equal(getPrefetchRowCount(2), 48);
});

test("only looks ahead an extra page during a fast scroll on suitable connections", () => {
  assert.equal(shouldPrefetchExtraPage({ downwardPixelsPerMs: 1.99 }), false);
  assert.equal(shouldPrefetchExtraPage({ downwardPixelsPerMs: 2 }), true);
  assert.equal(
    shouldPrefetchExtraPage({ downwardPixelsPerMs: 2, saveData: true }),
    false
  );
  assert.equal(
    shouldPrefetchExtraPage({ downwardPixelsPerMs: 2, effectiveType: "2g" }),
    false
  );
});

test("keeps same-page, adjacent-page, and wrapped search jumps local", () => {
  assert.equal(getSearchJumpMode(5 * RESULTS_PAGE_SIZE, 5 * RESULTS_PAGE_SIZE, 1, RESULTS_PAGE_SIZE), "local");
  assert.equal(getSearchJumpMode(5 * RESULTS_PAGE_SIZE, 6 * RESULTS_PAGE_SIZE, 1, RESULTS_PAGE_SIZE), "local");
  assert.equal(getSearchJumpMode(6 * RESULTS_PAGE_SIZE, 5 * RESULTS_PAGE_SIZE, -1, RESULTS_PAGE_SIZE), "local");
  assert.equal(getSearchJumpMode(10 * RESULTS_PAGE_SIZE, 0, 1, RESULTS_PAGE_SIZE), "local");
});

test("loads one or two directional bridge pages for multi-page jumps", () => {
  assert.deepEqual(
    getSearchBridgePageStarts(0, 2 * RESULTS_PAGE_SIZE, 1, RESULTS_PAGE_SIZE),
    [RESULTS_PAGE_SIZE],
  );
  assert.deepEqual(
    getSearchBridgePageStarts(0, 10 * RESULTS_PAGE_SIZE, 1, RESULTS_PAGE_SIZE),
    [RESULTS_PAGE_SIZE, 9 * RESULTS_PAGE_SIZE],
  );
  assert.deepEqual(
    getSearchBridgePageStarts(10 * RESULTS_PAGE_SIZE, 0, -1, RESULTS_PAGE_SIZE),
    [9 * RESULTS_PAGE_SIZE, RESULTS_PAGE_SIZE],
  );
});

test("uses a longer ease-in-out duration for bounded multi-page jumps", () => {
  assert.equal(
    getSearchAnimationDuration("local", 1),
    MIN_LOCAL_SCROLL_DURATION_MS
  );
  assert.equal(
    getSearchAnimationDuration("local", 100),
    MAX_LOCAL_SCROLL_DURATION_MS
  );
  assert.equal(
    getSearchAnimationDuration("multi-page", 1),
    MULTI_PAGE_SCROLL_DURATION_MS
  );
  assert.ok(
    MULTI_PAGE_SCROLL_DURATION_MS > MAX_LOCAL_SCROLL_DURATION_MS
  );
});

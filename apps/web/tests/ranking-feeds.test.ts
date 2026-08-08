import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeRankingFeedCursor,
  encodeRankingFeedCursor,
  selectRankingFeedCandidates,
  type RankingFeedCandidate,
  type RankingFeedCursor,
} from "@/services/feeds";

function candidate(
  cardId: string,
  listKey: string,
  overrides: Partial<RankingFeedCandidate> = {},
): RankingFeedCandidate {
  return {
    cardId,
    listKey,
    descriptor: {
      version: 1,
      family: "person-event",
      eventId: "333",
      resultType: "single",
      year: null,
      region: { scope: "world", regionId: "" },
      genders: [],
      population: { kind: "everyone" },
    },
    title: cardId,
    exploreUrl: "/rankings?eventId=333&result=single",
    previewRows: [],
    sourceFamily: "person-event",
    diversityKey: cardId,
    anchor: null,
    ...overrides,
  };
}

function popularity(listKey: string, score: number) {
  return {
    rankingListKey: listKey,
    sourceFamily: "person-event" as const,
    canonicalDescriptorJson: "{}",
    descriptor: candidate("descriptor", listKey).descriptor,
    customListPublicId: null,
    firstSeenAt: "2026-08-01",
    lastSeenAt: "2026-08-05",
    sevenDayViews: 1,
    thirtyDayViews: 1,
    score,
  };
}

test("keeps only top-five person candidates and orders by popularity", () => {
  const selected = selectRankingFeedCandidates(
    "person",
    [
      candidate("outside", "outside", { rank: 6 }),
      candidate("popular", "popular", { rank: 5 }),
      candidate("unpopular", "unpopular", { rank: 1 }),
    ],
    [popularity("popular", 10), popularity("unpopular", 1)],
    5,
  );
  assert.deepEqual(
    selected.map((item) => item.cardId),
    ["popular", "unpopular"],
  );
});

test("keeps home candidates tied to a recent change", () => {
  const selected = selectRankingFeedCandidates(
    "home",
    [
      candidate("evergreen", "evergreen"),
      candidate("changed", "changed", {
        change: {
          type: "leader",
          detectedAt: "2026-08-05T00:00:00.000Z",
          summary: "A new leader appeared.",
        },
      }),
    ],
    [popularity("evergreen", 100), popularity("changed", 1)],
  );
  assert.deepEqual(
    selected.map((item) => item.cardId),
    ["changed"],
  );
});

test("deduplicates anchors and avoids adjacent similar cards", () => {
  const selected = selectRankingFeedCandidates(
    "person",
    [
      candidate("first", "first", { rank: 1, anchor: "attempt-1" }),
      candidate("same-anchor", "second", { rank: 1, anchor: "attempt-1" }),
      candidate("same-family", "third", { rank: 2 }),
      candidate("other-family", "fourth", {
        rank: 3,
        sourceFamily: "city",
        descriptor: {
          version: 1,
          family: "city",
          metric: "competitions",
          eventId: "333",
          region: { scope: "world", regionId: "" },
          genders: [],
        },
      }),
    ],
    [],
  );
  assert.deepEqual(
    selected.map((item) => item.cardId),
    ["first", "other-family"],
  );
});

test("round-trips a generation and popularity snapshot cursor", () => {
  const cursor: RankingFeedCursor = {
    version: 1,
    mode: "home",
    generationId: "generation-7",
    popularityDate: "2026-08-05",
    seed: "seed-7",
    offset: 5,
    listKeys: ["a"],
    diversityKeys: ["person-event:333"],
    anchors: ["attempt-1"],
  };
  const encoded = encodeRankingFeedCursor(cursor);
  assert.deepEqual(decodeRankingFeedCursor(encoded, "home"), cursor);
  assert.throws(() => decodeRankingFeedCursor(encoded, "person"), /invalid/);
  assert.throws(() => decodeRankingFeedCursor("not-base64", "home"), /invalid/);
});

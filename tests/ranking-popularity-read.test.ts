import assert from "node:assert/strict";
import test from "node:test";
import { readPopularRankingDescriptors } from "@/services/ranking-popularity/read-service";
import { popularRankingDescriptorsQuery } from "@/services/ranking-popularity/queries";
import type { PopularityQuery } from "@/services/ranking-popularity/types";

const CANONICAL_DESCRIPTOR = JSON.stringify({
  version: 1,
  family: "person-event",
  eventId: "333",
  resultType: "single",
  year: null,
  region: { scope: "world", regionId: "" },
  genders: [],
  population: { kind: "everyone" },
});

test("reads typed recent popularity with UTC windows and score", async () => {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const query: PopularityQuery = async (text, values = []) => {
    calls.push({ text, values });
    return {
      rows: [
        {
          ranking_list_key: "a".repeat(64),
          source_family: "person-event",
          canonical_descriptor_json: CANONICAL_DESCRIPTOR,
          custom_list_public_id: null,
          first_seen_at: "2026-08-01 12:00:00.000000",
          last_seen_at: "2026-08-05 12:00:00.000000",
          seven_day_views: "7",
          thirty_day_views: "31",
        },
      ],
    };
  };

  const result = await readPopularRankingDescriptors({
    limit: 5,
    viewedAt: new Date("2026-08-05T12:00:00.000Z"),
    query,
  });

  assert.deepEqual(result[0], {
    rankingListKey: "a".repeat(64),
    sourceFamily: "person-event",
    canonicalDescriptorJson: CANONICAL_DESCRIPTOR,
    descriptor: JSON.parse(CANONICAL_DESCRIPTOR),
    customListPublicId: null,
    firstSeenAt: "2026-08-01 12:00:00.000000",
    lastSeenAt: "2026-08-05 12:00:00.000000",
    sevenDayViews: 7,
    thirtyDayViews: 31,
    score: 4.25,
  });
  assert.deepEqual(calls[0]?.values, ["2026-07-30", "2026-07-07", 5]);
});

test("uses deterministic score ordering and a bounded limit", async () => {
  const text = popularRankingDescriptorsQuery();
  assert.match(text, /LOG2\(1 \+ popularity\.seven_day_views\)/);
  assert.match(text, /popularity\.ranking_list_key ASC/);
  await assert.rejects(
    readPopularRankingDescriptors({
      limit: 0,
      query: async () => ({ rows: [] }),
    }),
    /limit must be an integer/,
  );
  await assert.rejects(
    readPopularRankingDescriptors({
      limit: 101,
      query: async () => ({ rows: [] }),
    }),
    /limit must be an integer/,
  );
});

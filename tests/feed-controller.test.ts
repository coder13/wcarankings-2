import assert from "node:assert/strict";
import test from "node:test";
import { handleHomeFeedRequest } from "@/controllers/feed-controller";

const change = {
  type: "leader" as const,
  previousTopFive: [{ entityId: "old", rank: 1, value: 100 }],
  currentTopFive: [{ entityId: "new", rank: 1, value: 90 }],
  focusEntityId: "new",
  summary: "The leader changed to new.",
};

test("rejects a home feed limit above five", async () => {
  const response = await handleHomeFeedRequest(
    new Request("https://example.test/feed?limit=6"),
  );
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "limit must be between 1 and 5.",
  });
});

test("returns bounded recent-change cards from injected feed sources", async () => {
  const candidate = {
    cardId: "changed",
    listKey: "changed",
    descriptor: {
      version: 1 as const,
      family: "person-event" as const,
      eventId: "333",
      resultType: "single" as const,
      year: 2026,
      region: { scope: "world" as const, regionId: "" },
      genders: [],
      population: { kind: "everyone" as const },
    },
    title: "Changed ranking",
    exploreUrl: "/api/rankings?eventId=333",
    previewRows: [],
    sourceFamily: "person-event" as const,
    diversityKey: "333",
    anchor: "competition:Recent2026",
    change: {
      type: change.type,
      detectedAt: "2026-08-05T00:00:00.000Z",
      summary: change.summary,
    },
    trigger: {
      competitionId: "Recent2026",
      competitionName: "Recent Competition 2026",
      endDate: "2026-08-05",
    },
  };
  const response = await handleHomeFeedRequest(
    new Request("https://example.test/feed?limit=1"),
    {
      generationId: "generation-test",
      now: new Date("2026-08-05T12:00:00.000Z"),
      query: async () => ({
        rows: [
          {
            competition_id: "Recent2026",
            competition_name: "Recent Competition 2026",
            country_id: "US",
            city_name: "Austin",
            end_year: 2026,
            end_month: 8,
            end_day: 5,
            event_id: "333",
          },
        ],
      }),
      candidates: [candidate],
      readPopularity: async () => [],
    },
  );
  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    cards: Array<{ trigger: { competitionId: string } }>;
    generationId: string;
  };
  assert.equal(body.generationId, "generation-test");
  assert.equal(body.cards.length, 1);
  assert.equal(body.cards[0]?.trigger.competitionId, "Recent2026");
});

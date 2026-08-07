import assert from "node:assert/strict";
import test from "node:test";
import { rankingListKey } from "@/lib/ranking-list-descriptor";
import { RankingPopularityBuffer } from "@/services/ranking-popularity/buffer";
import {
  rankingPopularityTotalsQuery,
  upsertDailyPopularityQuery,
  upsertRankingListDescriptorQuery,
} from "@/services/ranking-popularity/queries";
import {
  rankingPopularityScore,
  RankingPopularityService,
} from "@/services/ranking-popularity/service";
import type { PopularityQuery } from "@/services/ranking-popularity/types";

const EVENT_DESCRIPTOR = {
  family: "person-event",
  eventId: "333",
  resultType: "single",
  year: null,
  region: "world",
  genders: ["f", "m"],
  population: { kind: "everyone" },
} as const;

function queryRecorder(calls: Array<{ text: string; values: unknown[] }>) {
  const query: PopularityQuery = async (text, values = []) => {
    calls.push({ text, values });
    return { rows: [] };
  };
  return query;
}

test("registers a canonical descriptor registry row", async () => {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const service = new RankingPopularityService({ query: queryRecorder(calls) });
  const registered = await service.register(
    {
      ...EVENT_DESCRIPTOR,
      population: { kind: "public-list", publicId: "7k3m9q2d" },
    },
    {
      verifiedPublicList: { publicId: "7K3M9Q2D" },
    },
  );

  assert.equal(
    registered.rankingListKey,
    rankingListKey({
      ...EVENT_DESCRIPTOR,
      population: { kind: "public-list", publicId: "7K3M9Q2D" },
    }),
  );
  assert.equal(registered.customListPublicId, "7K3M9Q2D");
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0]?.values, [
    registered.rankingListKey,
    "person-event",
    registered.canonicalDescriptorJson,
    "7K3M9Q2D",
  ]);
  assert.match(registered.canonicalDescriptorJson, /"genders":\["m","f"\]/);
});

test("rejects invalid descriptors and unverified public lists before registry writes", async () => {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const service = new RankingPopularityService({ query: queryRecorder(calls) });

  await assert.rejects(
    service.register({
      family: "person-activity",
      metric: "solves",
      year: 2025,
    }),
  );
  await assert.rejects(
    service.register({
      ...EVENT_DESCRIPTOR,
      population: { kind: "public-list", publicId: "7K3M9Q2D" },
    }),
  );
  assert.equal(calls.length, 0);
});

test("records UTC dates and reads inclusive UTC totals", async () => {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const service = new RankingPopularityService({ query: queryRecorder(calls) });
  const registered = await service.register(EVENT_DESCRIPTOR);
  service.recordSuccessfulFirstPageView(
    registered,
    new Date("2026-08-05T00:30:00.000Z"),
  );
  assert.deepEqual(service.entries(), [
    {
      rankingListKey: registered.rankingListKey,
      popularityDate: "2026-08-05",
      count: 1,
    },
  ]);

  await service.totals(
    registered.rankingListKey,
    new Date("2026-08-05T12:00:00.000Z"),
  );
  assert.deepEqual(calls.at(-1)?.values, [
    "2026-07-30",
    registered.rankingListKey,
    "2026-07-07",
  ]);
});

test("does not flush before the entry threshold", async () => {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const service = new RankingPopularityService({
    flushEntryThreshold: 2,
    query: queryRecorder(calls),
  });
  const registered = await service.register(EVENT_DESCRIPTOR);
  service.recordSuccessfulFirstPageView(
    registered,
    new Date("2026-08-05T00:00:00.000Z"),
  );

  assert.equal(service.hasReachedFlushThreshold(), false);
  assert.equal(await service.flushIfThresholdReached(), false);
  assert.equal(calls.length, 1);
  assert.equal(service.entries().length, 1);
});

test("flushes one combined batch at the entry threshold", async () => {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const service = new RankingPopularityService({
    flushEntryThreshold: 2,
    query: queryRecorder(calls),
  });
  const registered = await service.register(EVENT_DESCRIPTOR);
  service.recordSuccessfulFirstPageView(
    registered,
    new Date("2026-08-05T00:00:00.000Z"),
  );
  service.recordSuccessfulFirstPageView(
    registered,
    new Date("2026-08-05T00:00:00.000Z"),
  );

  assert.equal(service.hasReachedFlushThreshold(), true);
  assert.equal(await service.flushIfThresholdReached(), true);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1]?.values, [
    registered.rankingListKey,
    "2026-08-05",
    2,
  ]);
  assert.deepEqual(service.entries(), []);
});

test("uses one in-flight flush for concurrent threshold checks", async () => {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  let completeWrite: (() => void) | undefined;
  const writeStarted = new Promise<void>((resolve) => {
    completeWrite = resolve;
  });
  const query: PopularityQuery = async (text, values = []) => {
    calls.push({ text, values });
    if (text.includes("ranking_list_daily_popularity")) await writeStarted;
    return { rows: [] };
  };
  const service = new RankingPopularityService({
    flushEntryThreshold: 1,
    query,
  });
  const registered = await service.register(EVENT_DESCRIPTOR);
  service.recordSuccessfulFirstPageView(registered);

  const first = service.flushIfThresholdReached();
  const second = service.flushIfThresholdReached();
  completeWrite?.();
  assert.deepEqual(await Promise.all([first, second]), [true, false]);
  assert.equal(calls.length, 2);
});

test("restores a failed threshold batch", async () => {
  const query: PopularityQuery = async (text) => {
    if (text.includes("ranking_list_daily_popularity")) {
      throw new Error("database unavailable");
    }
    return { rows: [] };
  };
  const service = new RankingPopularityService({
    flushEntryThreshold: 1,
    now: () => new Date("2026-08-05T00:00:00.000Z"),
    query,
  });
  const registered = await service.register(EVENT_DESCRIPTOR);
  service.recordSuccessfulFirstPageView(registered);

  await assert.rejects(service.flushIfThresholdReached());
  assert.equal(service.hasReachedFlushThreshold(), true);
  assert.deepEqual(service.entries(), [
    {
      rankingListKey: registered.rankingListKey,
      popularityDate: "2026-08-05",
      count: 1,
    },
  ]);
});

test("converts database totals and calculates a service score", async () => {
  const query = (async () => ({
    rows: [{ seven_day_views: "7", thirty_day_views: "31" }],
  })) as PopularityQuery;
  const service = new RankingPopularityService({ query });

  assert.deepEqual(
    await service.totals("a".repeat(64), new Date("2026-08-05T12:00:00.000Z")),
    { sevenDayViews: 7, thirtyDayViews: 31 },
  );
  assert.deepEqual(
    await service.score("a".repeat(64), new Date("2026-08-05T12:00:00.000Z")),
    { sevenDayViews: 7, thirtyDayViews: 31, score: 4.25 },
  );
});

test("combines views and bounds new popularity entries", () => {
  const buffer = new RankingPopularityBuffer(1);
  assert.equal(buffer.record("first", "2026-08-05"), true);
  assert.equal(buffer.record("first", "2026-08-05"), true);
  assert.equal(buffer.record("second", "2026-08-05"), false);
  assert.deepEqual(buffer.entries(), [
    { rankingListKey: "first", popularityDate: "2026-08-05", count: 2 },
  ]);
});

test("flushes combined increments and restores them after a failed write", async () => {
  const buffer = new RankingPopularityBuffer();
  buffer.record("first", "2026-08-05");
  buffer.record("first", "2026-08-05");
  const written: unknown[] = [];
  assert.equal(
    await buffer.flush(async (increments) => {
      written.push(increments);
    }),
    2,
  );
  assert.deepEqual(written, [
    [{ rankingListKey: "first", popularityDate: "2026-08-05", count: 2 }],
  ]);
  assert.deepEqual(buffer.entries(), []);

  buffer.record("second", "2026-08-05");
  await assert.rejects(
    buffer.flush(async () => Promise.reject(new Error("db"))),
  );
  assert.deepEqual(buffer.entries(), [
    { rankingListKey: "second", popularityDate: "2026-08-05", count: 1 },
  ]);
});

test("keeps views that arrive during a flush", async () => {
  const buffer = new RankingPopularityBuffer();
  buffer.record("first", "2026-08-05");
  let completeWrite: (() => void) | undefined;
  const writeStarted = new Promise<void>((resolve) => {
    completeWrite = resolve;
  });
  const flushing = buffer.flush(async () => writeStarted);

  buffer.record("second", "2026-08-05");
  completeWrite?.();
  await flushing;
  assert.deepEqual(buffer.entries(), [
    { rankingListKey: "second", popularityDate: "2026-08-05", count: 1 },
  ]);
});

test("uses atomic daily upserts and calculates the popularity score", () => {
  assert.match(upsertRankingListDescriptorQuery(), /ON DUPLICATE KEY UPDATE/);
  assert.match(upsertDailyPopularityQuery(2), /\(\?, \?, \?\),\(\?, \?, \?\)/);
  assert.match(
    upsertDailyPopularityQuery(1),
    /successful_first_page_view_count = successful_first_page_view_count \+ VALUES\(successful_first_page_view_count\)/,
  );
  assert.match(rankingPopularityTotalsQuery(), /seven_day_views/);
  assert.deepEqual(
    rankingPopularityScore({ sevenDayViews: 7, thirtyDayViews: 31 }),
    {
      sevenDayViews: 7,
      thirtyDayViews: 31,
      score: 3 + 1.25,
    },
  );
});

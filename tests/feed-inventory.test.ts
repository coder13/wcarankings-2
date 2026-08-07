import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFeedStatInventory,
  feedStatKindName,
  prioritizeFeedStatInventory,
} from "@/services/feeds/inventory";
import { hasRecentFeedEntry } from "@/services/feeds/stat-previews";
import {
  hasRecentTopTenEntry,
  selectFeedPreviewEntries,
} from "@/services/feeds/stat-previews";

test("builds the full bounded feed stat inventory", () => {
  const inventory = buildFeedStatInventory({
    continents: [
      { id: "_Europe", name: "Europe" },
      { id: "_Asia", name: "Asia" },
    ],
    countries: [
      { id: "USA", name: "United States" },
      { id: "Japan", name: "Japan" },
    ],
  });
  assert.equal(inventory.length, 6285);
  assert.equal(new Set(inventory.map((stat) => stat.eventId)).size, 21);
  assert.equal(inventory.filter((stat) => stat.eventId === "SOR").length, 60);
  assert.equal(
    inventory.filter((stat) => stat.eventId === "sor-kinch").length,
    30,
  );
  assert.equal(
    inventory.filter((stat) => stat.eventId === "pr-streak").length,
    30,
  );
  assert.equal(
    inventory.filter((stat) => stat.eventId === "activity").length,
    45,
  );
  assert.equal(
    new Set(inventory.map((stat) => stat.id)).size,
    inventory.length,
  );
  assert.deepEqual(
    inventory.find(
      (stat) =>
        stat.kind === "result" &&
        stat.region.scope === "country" &&
        stat.region.regionId === "Japan" &&
        stat.gender === "f" &&
        stat.year === 2026,
    )?.exploreUrl,
    "/results?eventId=333&result=single&region=Japan&gender=f&year=2026",
  );
  assert.equal(
    inventory.some((stat) => stat.year !== null && stat.year !== 2026),
    false,
  );
  assert.equal(
    inventory.some((stat) => stat.gender === "m"),
    false,
  );
});

test("names personal-best and all-result ranking families clearly", () => {
  assert.equal(feedStatKindName("person"), "Person rankings");
  assert.equal(feedStatKindName("result"), "Person result rankings");
});

test("qualifies a stat when a recent result is in the top ten", () => {
  const entries = Array.from({ length: 11 }, (_, index) => ({
    competitionId: index === 5 ? "recent" : `old-${index}`,
  }));
  assert.equal(hasRecentTopTenEntry(entries, new Set(["recent"])), true);
  assert.equal(
    hasRecentTopTenEntry(
      [{ competitionId: "old" }, { competitionId: "recent" }],
      new Set(["recent"]),
    ),
    true,
  );
});

test("shows four neighboring ranks around a changed top-ten result", () => {
  const entries = Array.from({ length: 10 }, (_, index) => ({
    competitionId: index === 7 ? "recent" : `old-${index}`,
    rank: index + 1,
  }));
  assert.deepEqual(
    selectFeedPreviewEntries(entries, new Set(["recent"])).map(
      (entry) => entry.rank,
    ),
    [6, 7, 8, 9, 10],
  );
  entries[9]!.competitionId = "recent";
  assert.deepEqual(
    selectFeedPreviewEntries(entries, new Set(["recent"])).map(
      (entry) => entry.rank,
    ),
    [6, 7, 8, 9, 10],
  );
});

test("prioritizes recent national event sources", () => {
  const inventory = buildFeedStatInventory({
    continents: [{ id: "North America", name: "North America" }],
    countries: [{ id: "USA", name: "United States" }],
  });
  const prioritized = prioritizeFeedStatInventory(inventory, [
    { countryId: "USA", eventIds: ["333"] },
  ]);

  assert.equal(prioritized[0]?.region.scope, "country");
  assert.equal(prioritized[0]?.region.regionId, "USA");
  assert.equal(prioritized[0]?.eventId, "333");
  assert.equal(prioritized[0]?.kind, "result");
});

test("requires a recent result in the visible top five", () => {
  const source = buildFeedStatInventory({
    continents: [],
    countries: [{ id: "USA", name: "United States" }],
  }).find(
    (candidate) =>
      candidate.kind === "result" &&
      candidate.eventId === "333" &&
      candidate.region.regionId === "USA" &&
      candidate.year === 2026,
  );
  assert.ok(source);
  assert.equal(
    hasRecentFeedEntry(
      source,
      [{ competitionId: "HamptonBeachSummer2026" }],
      [
        {
          competitionId: "HamptonBeachSummer2026",
          eventIds: ["333"],
        },
      ],
    ),
    true,
  );
  assert.equal(
    hasRecentFeedEntry(
      source,
      [{ competitionId: "older" }],
      [{ competitionId: "HamptonBeachSummer2026", eventIds: ["333"] }],
    ),
    false,
  );
});

test("does not match a recent competition from another event", () => {
  const source = buildFeedStatInventory({
    continents: [],
    countries: [{ id: "USA", name: "United States" }],
  }).find(
    (candidate) =>
      candidate.kind === "result" &&
      candidate.eventId === "333" &&
      candidate.region.regionId === "USA",
  );
  assert.ok(source);
  assert.equal(
    hasRecentFeedEntry(
      source,
      [{ competitionId: "HamptonBeachSummer2026" }],
      [{ competitionId: "HamptonBeachSummer2026", eventIds: ["444"] }],
    ),
    false,
  );
});

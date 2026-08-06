import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFeedStatInventory,
  prioritizeFeedStatInventory,
} from "@/services/feeds/inventory";
import { hasRecentFeedEntry } from "@/services/feeds/stat-previews";
import { hasRecentTopFiveEntry } from "@/services/feeds/stat-previews";

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
  assert.equal(inventory.length, 10 * 5 * 4 * 2 * 2);
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
});

test("qualifies a stat only when a recent result is in the top five", () => {
  const entries = Array.from({ length: 6 }, (_, index) => ({
    competitionId: index === 5 ? "recent" : `old-${index}`,
  }));
  assert.equal(hasRecentTopFiveEntry(entries, new Set(["recent"])), false);
  assert.equal(
    hasRecentTopFiveEntry(
      [{ competitionId: "old" }, { competitionId: "recent" }],
      new Set(["recent"]),
    ),
    true,
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

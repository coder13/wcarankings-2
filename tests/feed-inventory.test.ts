import assert from "node:assert/strict";
import test from "node:test";
import { buildFeedStatInventory } from "@/services/feeds/inventory";

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

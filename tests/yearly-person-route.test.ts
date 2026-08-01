import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("derives a yearly ranking filter from the canonical path", async () => {
  const [route, urlState] = await Promise.all([
    readFile(
      new URL("../app/persons/year/[year]/page.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../components/RankingsExplorer/rankingsUrl.ts", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(route, /<RankingsPage[\s\S]*requiresYearlyRankings/);
  assert.match(urlState, /function yearFromUrl/);
  assert.match(urlState, /year: yearFromUrl\(pathname, params\)/);
});

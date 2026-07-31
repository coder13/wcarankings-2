import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("person profile route batches profile data from ranking projections", async () => {
  const [loader, page, row] = await Promise.all([
    readFile(new URL("../lib/person-profile.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/person/[wcaId]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/RankingRow/RankingRow.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(loader, /FROM person_event_rankings ranking/);
  assert.match(loader, /FROM person_metric_values/);
  assert.match(loader, /FROM person_sum_of_ranks_scores/);
  assert.match(loader, /getCurrentRankingsMetadata/);
  assert.match(loader, /Promise\.all/);
  assert.match(page, /No single/);
  assert.match(page, /No average/);
  assert.match(page, /WCA profile/);
  assert.match(page, /target="_blank"/);
  assert.match(row, /\/person\/\$\{id\}/);
});

test("person event details load average attempts from raw result attempts", async () => {
  const [loader, row] = await Promise.all([
    readFile(new URL("../lib/person-event-details.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/RankingRow/RankingRow.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(loader, /FROM result_attempts/);
  assert.match(loader, /WHERE result_id = \?/);
  assert.match(loader, /averageCountedAttemptNumbers/);
  assert.doesNotMatch(loader, /value1/);
  assert.match(row, /label === "Average"/);
});

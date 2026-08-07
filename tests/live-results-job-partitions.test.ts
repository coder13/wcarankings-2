import assert from "node:assert/strict";
import test from "node:test";
import { partitionJobs } from "../apps/live-results-worker/src/job-partitions.ts";

test("partitions changed live people into bounded, stable person-stat jobs", () => {
  const jobs = partitionJobs(
    {
      source_name: "wca-live",
      competition_id: "TestOpen2026",
      remote_competition_id: "TestOpen2026",
      competition_year: 2026,
      lease_token: null,
    },
    {
      results: [
        {
          sourceResultId: "new",
          eventId: "333",
          roundNumber: 1,
          roundTypeId: "1",
          formatId: null,
          personId: "2026TEST02",
          personName: "New Person",
          countryIso2: "CA",
          best: 1234,
          average: 1500,
          position: 1,
          attempts: [1234],
        },
      ],
    },
    9,
    [
      {
        personId: "2026TEST01",
        eventId: "222",
        countryIso2: "US",
      },
    ],
    [
      {
        personId: "2026TEST01",
        eventId: "222",
        countryIso2: "US",
        countryId: "USA",
        continentId: "North America",
        gender: "m",
      },
      {
        personId: "2026TEST02",
        eventId: "333",
        countryIso2: "CA",
        countryId: "Canada",
        continentId: "North America",
        gender: "f",
      },
    ],
  );

  const personIds = jobs
    .filter((job) => job.key.startsWith("person-stats:"))
    .flatMap((job) => job.payload.personIds?.split(",") ?? [])
    .sort();
  assert.deepEqual(personIds, ["2026TEST01", "2026TEST02"]);
  assert.ok(jobs.some((job) => job.key === "competition-stats:TestOpen2026"));
  assert.ok(jobs.some((job) => job.key.startsWith("person-event-bests:2026:")));
  assert.ok(
    jobs.some(
      (job) => job.key === "result-rankings:all-time:333:country:Canada:f",
    ),
  );
  assert.ok(
    jobs.some(
      (job) => job.key === "activity-rankings:year:solves:world:world:all",
    ),
  );
  assert.ok(
    jobs.some((job) => job.key === "medal-rankings:year:all:country:Canada:f"),
  );
  assert.ok(
    jobs.some((job) => job.key === "competition-event-stats:TestOpen2026:333"),
  );
  assert.ok(jobs.some((job) => job.key === "city-stats:TestOpen2026:333:f"));
});

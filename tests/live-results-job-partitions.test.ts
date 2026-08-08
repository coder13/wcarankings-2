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
    new Map([
      ["CA", { countryId: "Canada", continentId: "_North America" }],
      ["US", { countryId: "USA", continentId: "_North America" }],
    ]),
    new Map([
      [
        "2026TEST01",
        { countryId: "USA", continentId: "_North America", gender: "m" },
      ],
      [
        "2026TEST02",
        { countryId: "Canada", continentId: "_North America", gender: "f" },
      ],
    ]),
    new Map([
      [
        "2026TEST01",
        { countryId: "USA", continentId: "_North America", gender: "m" },
      ],
      [
        "2026TEST02",
        { countryId: "Canada", continentId: "_North America", gender: "f" },
      ],
    ]),
  );

  const personIds = jobs
    .filter((job) => job.key.startsWith("person-stats:"))
    .flatMap((job) => job.payload.personIds?.split(",") ?? [])
    .sort();
  assert.deepEqual(personIds, ["2026TEST01", "2026TEST02"]);
  assert.ok(jobs.some((job) => job.key === "competition-stats:TestOpen2026"));
  assert.ok(jobs.some((job) => job.key.startsWith("person-event-bests:2026:")));
  assert.ok(jobs.some((job) => job.key === "yearly-rankings:2026:333:single"));
  assert.ok(
    jobs.some((job) => job.key === "sum-of-ranks:continent:_North America"),
  );
  assert.equal(
    jobs.find((job) => job.key === "sum-of-ranks:continent:_North America")
      ?.payload.countryIds,
    "Canada,USA",
  );
  assert.ok(jobs.every((job) => !job.key.startsWith("sum-of-ranks:country:")));
  assert.ok(
    jobs.some(
      (job) =>
        job.key === "person-event-rankings:2026:333:single:_North America",
    ),
  );
  assert.ok(
    jobs.some(
      (job) =>
        job.key ===
        "result-rankings:2026:333:average:continent:_North America:all",
    ),
  );
  assert.ok(
    jobs.some((job) => job.key === "competition-event-stats:TestOpen2026:333"),
  );
  assert.ok(
    jobs.some(
      (job) => job.key === "competition-rankings:country:USA:all",
    ),
  );
  assert.ok(
    jobs.every(
      (job) =>
        job.key.startsWith("competition-stats:") ||
        job.key.startsWith("competition-event-stats:") ||
        job.key.startsWith("city-stats:") ||
        job.key.startsWith("person-stats:") ||
        job.key.startsWith("person-stat-rankings:") ||
        job.key.startsWith("person-event-bests:") ||
        job.key.startsWith("person-event-rankings:") ||
        job.key.startsWith("competition-rankings:") ||
        job.key.startsWith("medal-scores:") ||
        job.key.startsWith("result-rankings:") ||
        job.key.startsWith("yearly-rankings:") ||
        job.key.startsWith("sum-of-ranks:"),
    ),
  );
});

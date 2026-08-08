import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeProjectionJobs,
  partitionJobs,
} from "../apps/live-results-worker/src/job-partitions.ts";

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
        average: 0,
        attempts: [123],
        best: 123,
        personId: "2026TEST01",
        eventId: "222",
        countryIso2: "US",
        sourceResultId: "old",
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
  assert.equal(
    jobs.filter((job) => job.key.startsWith("result-rankings:")).length,
    0,
  );
  assert.ok(
    jobs.some((job) => job.key === "sum-of-ranks:continent:_North America"),
  );
  assert.equal(
    jobs.find((job) => job.key === "sum-of-ranks:continent:_North America")
      ?.payload.countryIds,
    "Canada,USA",
  );
  assert.ok(jobs.every((job) => !job.key.startsWith("sum-of-ranks:country:")));
  assert.ok(jobs.some((job) => job.key === "person-event-rankings:333:single"));
  assert.ok(jobs.every((job) => !job.key.startsWith("result-rankings:")));
  assert.ok(
    jobs.some((job) => job.key === "competition-event-stats:TestOpen2026:333"),
  );
  assert.ok(
    jobs.some((job) => job.key === "competition-rankings:country:USA:all"),
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

test("does not queue materialized result rankings for a live change", () => {
  const result = {
    sourceResultId: "333:1:2026TEST01",
    eventId: "333",
    roundNumber: 1,
    roundTypeId: "1",
    formatId: null,
    personId: "2026TEST01",
    personName: "Test Person",
    countryIso2: "US",
    best: 1000,
    average: 1200,
    position: 2,
    attempts: [1000, 1100, 1200],
  };
  const jobs = partitionJobs(
    {
      source_name: "wca-live",
      competition_id: "TestOpen2026",
      remote_competition_id: "TestOpen2026",
      competition_year: 2026,
      lease_token: null,
    },
    { results: [{ ...result, position: 1 }] },
    9,
    [
      {
        average: result.average,
        attempts: result.attempts,
        best: result.best,
        countryIso2: result.countryIso2,
        eventId: result.eventId,
        personId: result.personId,
        sourceResultId: result.sourceResultId,
      },
    ],
  );

  assert.equal(
    jobs.filter((job) => job.key.startsWith("result-rankings:")).length,
    0,
  );
});

test("does not queue materialized result rankings for invalid live values", () => {
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
          sourceResultId: "invalid",
          eventId: "555",
          roundNumber: 1,
          roundTypeId: "1",
          formatId: null,
          personId: "2026TEST01",
          personName: "Test Person",
          countryIso2: "US",
          best: -1,
          average: -1,
          position: 0,
          attempts: [-1, -1, -1],
        },
      ],
    },
    9,
    [],
  );

  assert.equal(
    jobs.filter((job) => job.key.startsWith("result-rankings:")).length,
    0,
  );
});

test("merges shared rebuild jobs from one import batch", () => {
  const jobs = mergeProjectionJobs([
    {
      kind: "projection-rebuild",
      key: "person-stats:2026:4",
      version: 12,
      payload: { personIds: "2026TEST01,2026TEST02", year: "2026" },
    },
    {
      kind: "projection-rebuild",
      key: "person-stats:2026:4",
      version: 12,
      payload: { personIds: "2026TEST02,2026TEST03", year: "2026" },
    },
    {
      kind: "projection-rebuild",
      key: "sum-of-ranks:continent:_Asia",
      version: 12,
      payload: {
        countryIds: "China,Japan",
        regionId: "_Asia",
        scope: "continent",
      },
    },
    {
      kind: "projection-rebuild",
      key: "sum-of-ranks:continent:_Asia",
      version: 12,
      payload: {
        countryIds: "Japan,Korea",
        regionId: "_Asia",
        scope: "continent",
      },
    },
  ]);

  assert.equal(jobs.length, 2);
  assert.deepEqual(
    jobs[0]?.payload.personIds,
    "2026TEST01,2026TEST02,2026TEST03",
  );
  assert.equal(jobs[1]?.payload.countryIds, "China,Japan,Korea");
});

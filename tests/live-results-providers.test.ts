import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalSnapshot,
  fetchWcaCompetitionRegistrationCount,
  fetchWcaCompetitionScoretakingSoftware,
  normalizeIlrResults,
  normalizeCubingChinaResults,
  normalizeWcaLiveResults,
  roundSnapshotHashes,
  snapshotHash,
} from "@wcarankings/live-results";

test("normalizes ILR results through their WCIF registrants", () => {
  const snapshot = normalizeIlrResults(
    {
      persons: [
        {
          registrantId: 7,
          wcaId: "2026TEST01",
          name: "Test Cuber",
          countryIso2: "US",
        },
      ],
    },
    [
      {
        id: "333-r1",
        format: "a",
        results: [
          {
            registration_id: 7,
            best: 1234,
            average: 1500,
            global_pos: 1,
            attempts: [{ value: 1234 }, { value: 1500 }],
          },
        ],
      },
    ],
  );
  assert.deepEqual(snapshot.results, [
    {
      sourceResultId: "333-r1:2026TEST01",
      eventId: "333",
      roundNumber: 1,
      roundTypeId: "f",
      formatId: "a",
      personId: "2026TEST01",
      personName: "Test Cuber",
      countryIso2: "US",
      best: 1234,
      average: 1500,
      position: 1,
      attempts: [1234, 1500],
    },
  ]);
});

test("skips ILR H2H rounds", () => {
  const snapshot = normalizeIlrResults({ persons: [] }, [
    { id: "333-r1", format: "h", results: [] },
  ]);
  assert.deepEqual(snapshot, { results: [], skippedRoundIds: ["333-r1"] });
});

test("retries a temporary WCA metadata failure three times", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    if (calls < 3)
      return new Response("", {
        status: 503,
        statusText: "Service Unavailable",
      });
    return Response.json({ scoretaking_software: "wca_live" });
  }) as typeof fetch;

  try {
    assert.equal(
      await fetchWcaCompetitionScoretakingSoftware("TestCompetition2026"),
      "wca_live",
    );
    assert.equal(calls, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("counts registrations from the public WCA endpoint", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    Response.json([
      { user_id: 1 },
      { user_id: 2 },
      { user_id: 3 },
    ])) as typeof fetch;

  try {
    assert.equal(
      await fetchWcaCompetitionRegistrationCount("TestCompetition2026"),
      3,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("normalizes the public WCA Live result endpoint without WCIF", () => {
  const snapshot = normalizeWcaLiveResults({
    persons: [
      { id: 7, wcaId: "2026TEST01", name: "Test Cuber", country: "US" },
    ],
    events: [
      {
        eventId: "333",
        rounds: [
          {
            number: 1,
            results: [
              {
                personId: 7,
                best: 1234,
                average: 1500,
                attempts: [1234, 1500],
              },
            ],
          },
        ],
      },
    ],
  });
  assert.deepEqual(snapshot.results, [
    {
      sourceResultId: "333:1:2026TEST01",
      eventId: "333",
      roundNumber: 1,
      roundTypeId: "f",
      formatId: null,
      personId: "2026TEST01",
      personName: "Test Cuber",
      countryIso2: "US",
      best: 1234,
      average: 1500,
      position: 0,
      attempts: [1234, 1500],
    },
  ]);
});

test("ignores WCA Live results that cannot be tied to a WCA person", () => {
  const snapshot = normalizeWcaLiveResults({
    persons: [{ id: 7, name: "Guest", country: "US" }],
    events: [
      {
        eventId: "333",
        rounds: [{ number: 1, results: [{ personId: 7, best: 1234 }] }],
      },
    ],
  });
  assert.deepEqual(snapshot.results, []);
});

test("normalizes Cubing China numeric result fields", () => {
  const snapshot = normalizeCubingChinaResults({
    results: [
      {
        resultId: 401036,
        eventId: 333,
        roundId: "d",
        formatId: null,
        wcaId: "2026TEST01",
        name: "Test Cuber",
        best: 1111,
        average: 1222,
        place: 1,
        attempts: [1111, 1222],
      },
    ],
  });
  assert.deepEqual(snapshot.results[0], {
    sourceResultId: "401036",
    eventId: "333",
    roundNumber: 1,
    roundTypeId: "f",
    formatId: null,
    personId: "2026TEST01",
    personName: "Test Cuber",
    countryIso2: null,
    best: 1111,
    average: 1222,
    position: 1,
    attempts: [1111, 1222],
  });
});

test("snapshot fingerprints are stable when providers reorder rows", () => {
  const first = {
    results: [
      {
        sourceResultId: "b",
        eventId: "333",
        roundNumber: 1,
        roundTypeId: "f",
        formatId: null,
        personId: "2026TEST02",
        personName: "B",
        countryIso2: "US",
        best: 2,
        average: 0,
        position: 2,
        attempts: [2],
      },
      {
        sourceResultId: "a",
        eventId: "333",
        roundNumber: 1,
        roundTypeId: "f",
        formatId: null,
        personId: "2026TEST01",
        personName: "A",
        countryIso2: "US",
        best: 1,
        average: 0,
        position: 1,
        attempts: [1],
      },
    ],
  };
  const second = { results: [...first.results].reverse() };
  assert.equal(canonicalSnapshot(first), canonicalSnapshot(second));
  assert.equal(snapshotHash(first), snapshotHash(second));
});

test("changes only the fingerprint for the changed result round", () => {
  const first = {
    results: [
      {
        sourceResultId: "333:1:2026TEST01",
        eventId: "333",
        roundNumber: 1,
        roundTypeId: "1",
        formatId: null,
        personId: "2026TEST01",
        personName: "First Person",
        countryIso2: "US",
        best: 1000,
        average: 1200,
        position: 1,
        attempts: [1000],
      },
      {
        sourceResultId: "333:2:2026TEST01",
        eventId: "333",
        roundNumber: 2,
        roundTypeId: "f",
        formatId: null,
        personId: "2026TEST01",
        personName: "First Person",
        countryIso2: "US",
        best: 900,
        average: 1100,
        position: 1,
        attempts: [900],
      },
    ],
  };
  const second = {
    results: [first.results[0]!, { ...first.results[1]!, attempts: [899] }],
  };

  const firstRounds = roundSnapshotHashes(first);
  const secondRounds = roundSnapshotHashes(second);
  assert.equal(firstRounds.get("333:1"), secondRounds.get("333:1"));
  assert.notEqual(firstRounds.get("333:2"), secondRounds.get("333:2"));
  assert.notEqual(snapshotHash(first), snapshotHash(second));
});

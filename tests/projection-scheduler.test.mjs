import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_PROJECTION_NAMES,
  projectionBuildPlan,
  projectionConcurrency,
  projectionNamesForRefresh,
  runDependencyAwareTasks,
} from "../scripts/mysql-schema.mjs";

function fakeConnection(id, closed) {
  return {
    id,
    async end() {
      closed.push(id);
    },
  };
}

test("dependency scheduler bounds and overlaps independent tasks", async () => {
  const events = [];
  const closed = [];
  let active = 0;
  let maximum = 0;
  const task = (name, dependencies = []) => ({
    name,
    dependencies,
    async run() {
      events.push(`start:${name}`);
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 12));
      active -= 1;
      events.push(`finish:${name}`);
      return name;
    },
  });

  const result = await runDependencyAwareTasks([
    task("single"),
    task("average"),
    task("result"),
    task("counts", ["single", "average"]),
  ], {
    createConnection: async () => fakeConnection(closed.length + 1, closed),
    concurrency: 2,
  });

  assert.equal(maximum, 2);
  assert.ok(events.indexOf("start:single") < events.indexOf("finish:average"));
  assert.ok(events.indexOf("start:average") < events.indexOf("finish:single"));
  assert.ok(events.indexOf("start:counts") > events.indexOf("finish:single"));
  assert.ok(events.indexOf("start:counts") > events.indexOf("finish:average"));
  assert.deepEqual(result, ["single", "average", "result", "counts"]);
  assert.equal(closed.length, 4);
});

test("hydrated dependencies count as complete without executing them", async () => {
  const started = [];
  await runDependencyAwareTasks([{
    name: "city",
    dependencies: ["facts", "competitions"],
    async run() { started.push("city"); },
  }], {
    connection: {},
    satisfiedDependencies: ["facts", "competitions"],
  });
  assert.deepEqual(started, ["city"]);
});

test("a city-only build plans only owned tasks and reports hydrated projections separately", () => {
  const plan = projectionBuildPlan(
    ["city-rankings"],
    ["result-facts", "competition-rankings"],
  );
  assert.deepEqual(plan.groups, ["city-rankings"]);
  assert.deepEqual(plan.projectionNames, ["city-event-stats", "entity-ranking-counts"]);
  assert.ok(plan.satisfiedProjectionNames.includes("result-facts"));
  assert.ok(plan.satisfiedProjectionNames.includes("competition-event-stats"));
  assert.equal(plan.tables.length, 2);
  assert.equal(plan.includeCompatibility, false);
});

test("duration-aware scheduling pairs a long task with the shortest ready task", async () => {
  const started = [];
  const task = (name, estimatedDurationMs, durationMs) => ({
    name,
    dependencies: [],
    estimatedDurationMs,
    async run() {
      started.push(name);
      await new Promise((resolve) => setTimeout(resolve, durationMs));
    },
  });

  await runDependencyAwareTasks([
    task("long-first", 120_000, 20),
    task("long-second", 120_000, 5),
    task("short", 15_000, 5),
  ], {
    createConnection: async () => fakeConnection(started.length + 1, []),
    concurrency: 2,
  });

  assert.deepEqual(started.slice(0, 2), ["long-first", "short"]);
});

test("dependency scheduler closes workers and does not start dependents after failure", async () => {
  const started = [];
  const closed = [];
  await assert.rejects(
    runDependencyAwareTasks([
      {
        name: "failing",
        dependencies: [],
        async run() {
          started.push("failing");
          throw new Error("expected failure");
        },
      },
      {
        name: "independent",
        dependencies: [],
        async run() {
          started.push("independent");
          await new Promise((resolve) => setTimeout(resolve, 15));
        },
      },
      {
        name: "dependent",
        dependencies: ["failing"],
        async run() {
          started.push("dependent");
        },
      },
    ], {
      createConnection: async () => fakeConnection(closed.length + 1, closed),
      concurrency: 2,
    }),
    /expected failure/,
  );

  assert.deepEqual(started.sort(), ["failing", "independent"]);
  assert.equal(closed.length, 2);
});

test("dependency scheduler rejects unknown dependencies before starting tasks", async () => {
  let started = false;
  await assert.rejects(
    runDependencyAwareTasks([{
      name: "counts",
      dependencies: ["missing-entries"],
      async run() {
        started = true;
      },
    }], {
      connection: {},
      concurrency: 1,
    }),
    /Unknown task dependency missing-entries for counts/,
  );
  assert.equal(started, false);
});

test("projection build concurrency defaults to two and accepts configured bounds", () => {
  const previous = process.env.WCA_PROJECTION_BUILD_CONCURRENCY;
  delete process.env.WCA_PROJECTION_BUILD_CONCURRENCY;
  try {
    assert.equal(projectionConcurrency(), 2);
    assert.equal(projectionConcurrency("4"), 4);
    assert.equal(projectionConcurrency("0"), 1);
  } finally {
    if (previous === undefined) delete process.env.WCA_PROJECTION_BUILD_CONCURRENCY;
    else process.env.WCA_PROJECTION_BUILD_CONCURRENCY = previous;
  }
});

test("a full schema refresh keeps the default semantic projections when selection is omitted", () => {
  assert.deepEqual(projectionNamesForRefresh(undefined), DEFAULT_PROJECTION_NAMES);
  assert.deepEqual(projectionNamesForRefresh([]), []);
});

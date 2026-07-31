import assert from "node:assert/strict";
import test from "node:test";

import {
  projectionConcurrency,
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

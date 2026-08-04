import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  DEFAULT_PROJECTION_NAMES,
  COMPATIBILITY_PROJECTION_TASKS,
  COMPATIBILITY_TABLE_TASK_COUNT,
  PROJECTION_REGISTRY,
  createTableProgress,
  projectionBuildPlan,
  projectionConcurrency,
  projectionNamesForRefresh,
  personYearRankingTaskPlan,
  renameCompatibilitySql,
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

test("person-year scheduler stages preserve the external projection barrier", () => {
  const plan = personYearRankingTaskPlan();
  assert.deepEqual(
    plan.map(({ name, dependencies }) => ({ name, dependencies })),
    [
      {
        name: "person-year-rankings:prepare",
        dependencies: ["result-facts"],
      },
      {
        name: "person-year-rankings:cohorts",
        dependencies: ["person-year-rankings:prepare"],
      },
      {
        name: "person-year-rankings:single",
        dependencies: ["person-year-rankings:cohorts"],
      },
      {
        name: "person-year-rankings:average",
        dependencies: ["person-year-rankings:cohorts"],
      },
      {
        name: "person-year-rankings:counts",
        dependencies: [
          "person-year-rankings:single",
          "person-year-rankings:average",
        ],
      },
      {
        name: "person-year-rankings",
        dependencies: ["person-year-rankings:counts"],
      },
    ],
  );

  const buildPlan = projectionBuildPlan(["yearly-person-rankings"], ["result-facts"]);
  assert.deepEqual(buildPlan.groups, ["yearly-person-rankings"]);
  assert.deepEqual(buildPlan.projectionNames, ["person-year-rankings"]);
  assert.deepEqual(buildPlan.tables, [
    "person_year_ranking_cohorts",
    "person_year_rankings_single",
    "person_year_rankings_average",
    "person_year_ranking_counts",
  ]);

  const prefixedPlan = personYearRankingTaskPlan({
    taskPrefix: "projection:",
    projectionDependencies: ["projection:result-facts"],
  });
  assert.deepEqual(prefixedPlan.at(-1), {
    stage: "complete",
    dependencies: ["projection:person-year-rankings:counts"],
    estimatedDurationMs: 0,
    name: "projection:person-year-rankings",
  });
});

test("person-year Single and Average overlap before counts and completion", async () => {
  const events = [];
  const durations = {
    prepare: 1,
    cohorts: 1,
    single: 20,
    average: 15,
    counts: 1,
    complete: 1,
  };
  const tasks = personYearRankingTaskPlan().map((descriptor) => ({
    ...descriptor,
    async run() {
      events.push(`start:${descriptor.stage}`);
      await new Promise((resolve) => setTimeout(resolve, durations[descriptor.stage]));
      events.push(`finish:${descriptor.stage}`);
    },
  }));

  await runDependencyAwareTasks(tasks, {
    createConnection: async () => fakeConnection(events.length + 1, []),
    concurrency: 2,
    satisfiedDependencies: ["result-facts"],
  });

  assert.ok(events.indexOf("start:single") < events.indexOf("finish:average"));
  assert.ok(events.indexOf("start:average") < events.indexOf("finish:single"));
  assert.ok(events.indexOf("start:counts") > events.indexOf("finish:single"));
  assert.ok(events.indexOf("start:counts") > events.indexOf("finish:average"));
  assert.ok(events.indexOf("start:complete") > events.indexOf("finish:counts"));
});

test("selective person-year backfills keep the stage plan serial", async () => {
  const events = [];
  const tasks = personYearRankingTaskPlan().map((descriptor) => ({
    ...descriptor,
    async run() {
      events.push(descriptor.stage);
    },
  }));

  await runDependencyAwareTasks(tasks, {
    connection: {},
    concurrency: 2,
    satisfiedDependencies: ["result-facts"],
  });

  assert.deepEqual(events, [
    "prepare",
    "cohorts",
    "single",
    "average",
    "counts",
    "complete",
  ]);

  const backfill = await readFile(
    new URL("../scripts/backfill-person-year-rankings.mjs", import.meta.url),
    "utf8",
  );
  assert.match(backfill, /projectionNames = \["person-year-rankings"\]/);
  assert.match(
    backfill,
    /buildRegisteredProjections\(connection, \{ projectionSuffix: "_staging", projectionNames \}\)/,
  );
});

test("person-year stage failure blocks counts and completion", async () => {
  const started = [];
  const tasks = personYearRankingTaskPlan().map((descriptor) => ({
    ...descriptor,
    async run() {
      started.push(descriptor.stage);
      if (descriptor.stage === "single") throw new Error("expected Single failure");
      if (descriptor.stage === "average") {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    },
  }));

  await assert.rejects(
    runDependencyAwareTasks(tasks, {
      createConnection: async () => fakeConnection(started.length + 1, []),
      concurrency: 2,
      satisfiedDependencies: ["result-facts"],
    }),
    /expected Single failure/,
  );
  assert.equal(started.includes("counts"), false);
  assert.equal(started.includes("complete"), false);
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

test("result-fact consumers never start from raw WCA tables alone", () => {
  for (const name of ["sum-of-ranks", "person-competition-rankings"]) {
    const projection = PROJECTION_REGISTRY.find((candidate) => candidate.name === name);
    assert.ok(projection, `${name} is registered`);
    assert.deepEqual(projection.dependencies, ["result-facts"]);
  }
  for (const name of [
    "compatibility-ranking-entries-single-source",
    "compatibility-ranking-entries-average-source",
  ]) {
    const task = COMPATIBILITY_PROJECTION_TASKS.find((candidate) => candidate.name === name);
    assert.ok(task, `${name} is registered`);
    assert.deepEqual(task.dependencies, ["projection:result-facts"]);
  }
});

test("compatibility build omits disabled weekly helper tables", () => {
  assert.equal(COMPATIBILITY_PROJECTION_TASKS.some(({ name, table }) =>
    /weekly-rank-deltas|record-streaks/.test(name) || /weekly_rank_deltas|record_streaks/.test(table ?? "")), false);
  const source = COMPATIBILITY_PROJECTION_TASKS.find(({ name }) =>
    name === "compatibility-ranking-entries-single-source");
  assert.deepEqual(source.dependencies, ["projection:result-facts"]);
  const averageSource = COMPATIBILITY_PROJECTION_TASKS.find(({ name }) =>
    name === "compatibility-ranking-entries-average-source");
  assert.deepEqual(averageSource.dependencies, ["projection:result-facts"]);
  assert.equal(COMPATIBILITY_TABLE_TASK_COUNT, 3);
  const progress = createTableProgress(COMPATIBILITY_TABLE_TASK_COUNT);
  let lastProgress;
  for (const task of COMPATIBILITY_PROJECTION_TASKS) {
    if (task.table) lastProgress = progress.start(task.table);
  }
  assert.equal(lastProgress, "[3/3]");
});

test("compatibility source views wait for result facts", async () => {
  const names = new Set(["compatibility-ranking-entries-single-source"]);
  const events = [];
  const tasks = COMPATIBILITY_PROJECTION_TASKS
    .filter(({ name }) => names.has(name))
    .map((task) => ({
      ...task,
      async run() {
        events.push(`start:${task.name}`);
        await new Promise((resolve) => setTimeout(resolve, 5));
        events.push(`finish:${task.name}`);
      },
    }));

  await runDependencyAwareTasks(tasks, {
    createConnection: async () => fakeConnection(events.length + 1, []),
    concurrency: 2,
    satisfiedDependencies: ["projection:result-facts"],
  });

  assert.deepEqual(events, [
    "start:compatibility-ranking-entries-single-source",
    "finish:compatibility-ranking-entries-single-source",
  ]);
});

test("compatibility SQL uses the matching staged result facts table", async () => {
  const source = await readFile(new URL("../sql/ranking-projections/ranking_entries_single_source.sql", import.meta.url), "utf8");
  const sql = renameCompatibilitySql(source, {
    bestSingle: "wca_best_single_staging",
    bestAverage: "wca_best_average_staging",
    entriesSources: {
      single: "ranking_entries_single_source_staging",
      average: "ranking_entries_average_source_staging",
    },
    resultFacts: "result_facts_staging",
  });

  assert.match(sql, /FROM\s+result_facts_staging r/);
  assert.doesNotMatch(sql, /FROM\s+result_facts r/);
});

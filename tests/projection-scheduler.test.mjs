import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "bun:test";

import {
  DEFAULT_PROJECTION_NAMES,
  CORE_RANKING_TABLE_TASKS,
  CORE_RANKING_TABLE_TASK_COUNT,
  PROJECTION_REGISTRY,
  createTableProgress,
  projectionBuildPlan,
  projectionConcurrency,
  projectionNamesForRefresh,
  renameRankingTableSql,
  runDependencyAwareTasks,
} from "../data-tools/projections/build.ts";

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

  const result = await runDependencyAwareTasks(
    [
      task("single"),
      task("average"),
      task("result"),
      task("counts", ["single", "average"]),
    ],
    {
      createConnection: async () => fakeConnection(closed.length + 1, closed),
      concurrency: 2,
    },
  );

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
  await runDependencyAwareTasks(
    [
      {
        name: "city",
        dependencies: ["facts", "competitions"],
        async run() {
          started.push("city");
        },
      },
    ],
    {
      connection: {},
      satisfiedDependencies: ["facts", "competitions"],
    },
  );
  assert.deepEqual(started, ["city"]);
});

test("a city-only build plans only owned tasks and reports hydrated projections separately", () => {
  const plan = projectionBuildPlan(
    ["city-rankings"],
    ["result-facts", "competition-rankings"],
  );
  assert.deepEqual(plan.groups, ["city-rankings"]);
  assert.deepEqual(plan.projectionNames, [
    "city-event-stats",
    "entity-ranking-counts",
  ]);
  assert.ok(plan.satisfiedProjectionNames.includes("result-facts"));
  assert.ok(plan.satisfiedProjectionNames.includes("competition-event-stats"));
  assert.equal(plan.tables.length, 2);
  assert.equal(plan.includeRankingTables, false);
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

  await runDependencyAwareTasks(
    [
      task("long-first", 120_000, 20),
      task("long-second", 120_000, 5),
      task("short", 15_000, 5),
    ],
    {
      createConnection: async () => fakeConnection(started.length + 1, []),
      concurrency: 2,
    },
  );

  assert.deepEqual(started.slice(0, 2), ["long-first", "short"]);
});

test("dependency scheduler closes workers and does not start dependents after failure", async () => {
  const started = [];
  const closed = [];
  await assert.rejects(
    runDependencyAwareTasks(
      [
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
      ],
      {
        createConnection: async () => fakeConnection(closed.length + 1, closed),
        concurrency: 2,
      },
    ),
    /expected failure/,
  );

  assert.deepEqual(started.sort(), ["failing", "independent"]);
  assert.equal(closed.length, 2);
});

test("dependency scheduler rejects unknown dependencies before starting tasks", async () => {
  let started = false;
  await assert.rejects(
    runDependencyAwareTasks(
      [
        {
          name: "counts",
          dependencies: ["missing-entries"],
          async run() {
            started = true;
          },
        },
      ],
      {
        connection: {},
        concurrency: 1,
      },
    ),
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
    if (previous === undefined)
      delete process.env.WCA_PROJECTION_BUILD_CONCURRENCY;
    else process.env.WCA_PROJECTION_BUILD_CONCURRENCY = previous;
  }
});

test("a full schema refresh keeps the default semantic projections when selection is omitted", () => {
  assert.deepEqual(
    projectionNamesForRefresh(undefined),
    DEFAULT_PROJECTION_NAMES,
  );
  assert.deepEqual(projectionNamesForRefresh([]), []);
});

test("result-fact consumers never start from raw WCA tables alone", () => {
  for (const name of ["sum-of-ranks", "person-competition-rankings"]) {
    const projection = PROJECTION_REGISTRY.find(
      (candidate) => candidate.name === name,
    );
    assert.ok(projection, `${name} is registered`);
    assert.deepEqual(projection.dependencies, ["result-facts"]);
  }
  for (const name of [
    "ranking-tables-entries-single-source",
    "ranking-tables-entries-average-source",
  ]) {
    const task = CORE_RANKING_TABLE_TASKS.find(
      (candidate) => candidate.name === name,
    );
    assert.ok(task, `${name} is registered`);
    assert.deepEqual(task.dependencies, ["projection:result-facts"]);
  }
});

test("result rankings create and remove their solve stage in one build", async () => {
  const projection = PROJECTION_REGISTRY.find(
    (candidate) => candidate.name === "result-rankings",
  );
  assert.ok(projection);
  const executedStatements = [];
  const connection = {
    async query(sql) {
      executedStatements.push(sql);
      return [[]];
    },
  };

  await projection.build(connection, "", createTableProgress(5));

  const createIndex = executedStatements.findIndex((statement) =>
    /CREATE TEMPORARY TABLE solve_facts_stage/.test(statement),
  );
  const useIndex = executedStatements.findIndex((statement) =>
    /FROM\s+solve_facts_stage solve/.test(statement),
  );
  const cleanupIndex = executedStatements.findLastIndex((statement) =>
    /DROP TEMPORARY TABLE solve_facts_stage/.test(statement),
  );
  assert.ok(createIndex >= 0);
  assert.ok(useIndex > createIndex);
  assert.ok(cleanupIndex > useIndex);
});

test("core ranking-table build omits disabled weekly helper tables", () => {
  assert.equal(
    CORE_RANKING_TABLE_TASKS.some(
      ({ name, table }) =>
        /weekly-rank-deltas|record-streaks/.test(name) ||
        /weekly_rank_deltas|record_streaks/.test(table ?? ""),
    ),
    false,
  );
  const source = CORE_RANKING_TABLE_TASKS.find(
    ({ name }) => name === "ranking-tables-entries-single-source",
  );
  assert.deepEqual(source.dependencies, ["projection:result-facts"]);
  const averageSource = CORE_RANKING_TABLE_TASKS.find(
    ({ name }) => name === "ranking-tables-entries-average-source",
  );
  assert.deepEqual(averageSource.dependencies, ["projection:result-facts"]);
  assert.equal(CORE_RANKING_TABLE_TASK_COUNT, 5);
  const progress = createTableProgress(CORE_RANKING_TABLE_TASK_COUNT);
  let lastProgress;
  for (const task of CORE_RANKING_TABLE_TASKS) {
    if (task.table) lastProgress = progress.start(task.table);
  }
  assert.equal(lastProgress, "[5/5]");
});

test("core ranking-table source views wait for result facts", async () => {
  const names = new Set(["ranking-tables-entries-single-source"]);
  const events = [];
  const tasks = CORE_RANKING_TABLE_TASKS.filter(({ name }) =>
    names.has(name),
  ).map((task) => ({
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
    "start:ranking-tables-entries-single-source",
    "finish:ranking-tables-entries-single-source",
  ]);
});

test("core ranking-table SQL uses the matching staged result facts table", async () => {
  const source = await readFile(
    new URL(
      "../data-tools/projection-catalog/core/ranking-tables/ranking_entries_single_source.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const sql = renameRankingTableSql(source, {
    bestSingle: "wca_best_single_staging",
    bestAverage: "wca_best_average_staging",
    entriesSources: {
      single: "ranking_entries_single_source_staging",
      average: "ranking_entries_average_source_staging",
    },
    resultEntriesSource: "result_entries_single_source_staging",
    resultFacts: "result_facts_staging",
  });

  assert.match(sql, /FROM\s+result_facts_staging r/);
  assert.doesNotMatch(sql, /FROM\s+result_facts r/);
});

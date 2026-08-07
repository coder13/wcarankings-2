import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "bun:test";

import {
  CORE_RANKING_TABLE_TASKS,
  CORE_RANKING_TABLE_TASK_COUNT,
  renameRankingTableSql,
} from "../data-tools/projections/build/ranking-tables.ts";
import { DEFAULT_PROJECTION_NAMES } from "../data-tools/projection-catalog/tables.ts";
import { PROJECTION_REGISTRY } from "../data-tools/projections/build/registry.ts";
import {
  createTableProgress,
  startBuildHeartbeat,
} from "../data-tools/projections/build/progress.ts";
import {
  createProjectionTaskPlan,
  formatProjectionBuildSummary,
  projectionBuildPlan,
  projectionNamesForRefresh,
} from "../data-tools/projections/build/plan.ts";
import {
  executeProjectionTaskPlan,
  projectionConcurrency,
} from "../data-tools/projections/build/builder.ts";

function fakeConnection(id, closed) {
  return {
    id,
    async end() {
      closed.push(id);
    },
  };
}

test("build heartbeat reports long-running work and stops cleanly", async () => {
  const messages = [];
  const stop = startBuildHeartbeat(
    "table result_facts",
    performance.now(),
    5,
    (message) => messages.push(message),
  );

  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.ok(
    messages.some((message) =>
      message.includes("Still building table result_facts"),
    ),
  );

  stop();
  const messageCount = messages.length;
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(messages.length, messageCount);
});

test("projection build summary explains groups, outputs, and tables", () => {
  const summary = formatProjectionBuildSummary([
    "result-facts",
    "person-pr-streak-rankings",
  ]);

  assert.match(summary, /Groups to build: 2/);
  assert.match(summary, /result-facts/);
  assert.match(summary, /generates: result-facts/);
  assert.match(summary, /person-pr-streak-rankings \(pr-streak\)/);
  assert.match(summary, /person_pr_streak_counts/);
  assert.match(summary, /Total owned tables: 5/);
});

test("projection builder bounds and overlaps independent tasks", async () => {
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

  const plan = createProjectionTaskPlan([
    task("single"),
    task("average"),
    task("result"),
    task("counts", ["single", "average"]),
  ]);
  const result = await executeProjectionTaskPlan(plan, {
    createConnection: async () => fakeConnection(closed.length + 1, closed),
    concurrency: 2,
    connection: fakeConnection(0, closed),
  });

  assert.equal(maximum, 2);
  assert.ok(events.indexOf("start:single") < events.indexOf("finish:average"));
  assert.ok(events.indexOf("start:average") < events.indexOf("finish:single"));
  assert.ok(events.indexOf("start:counts") > events.indexOf("finish:single"));
  assert.ok(events.indexOf("start:counts") > events.indexOf("finish:average"));
  assert.deepEqual(
    result.map((task) => task.result),
    ["single", "average", "result", "counts"],
  );
  assert.equal(closed.length, 4);
});

test("hydrated dependencies count as complete without executing them", async () => {
  const started = [];
  const plan = createProjectionTaskPlan(
    [
      {
        name: "city",
        dependencies: ["facts", "competitions"],
        async run() {
          started.push("city");
        },
      },
    ],
    ["facts", "competitions"],
  );
  await executeProjectionTaskPlan(plan, { connection: {} });
  assert.deepEqual(started, ["city"]);
});

test("a city-only build plans only owned tasks and reports hydrated projections separately", () => {
  const plan = projectionBuildPlan(
    ["city-rankings"],
    ["result-facts", "competition-rankings"],
  );
  assert.deepEqual(plan.groups, ["city-rankings"]);
  assert.deepEqual(plan.projectionNames, ["city-event-stats"]);
  assert.ok(plan.satisfiedProjectionNames.includes("result-facts"));
  assert.ok(plan.satisfiedProjectionNames.includes("competition-event-stats"));
  assert.equal(plan.tables.length, 1);
  assert.equal(plan.includeRankingTables, false);
});

test("projection builder pairs a long task with the shortest ready task", async () => {
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

  const plan = createProjectionTaskPlan([
    task("long-first", 120_000, 20),
    task("long-second", 120_000, 5),
    task("short", 15_000, 5),
  ]);
  await executeProjectionTaskPlan(plan, {
    createConnection: async () => fakeConnection(started.length + 1, []),
    concurrency: 2,
    connection: {},
  });

  assert.deepEqual(started.slice(0, 2), ["long-first", "short"]);
});

test("projection builder closes workers and does not start dependents after failure", async () => {
  const started = [];
  const closed = [];
  await assert.rejects(
    executeProjectionTaskPlan(
      createProjectionTaskPlan([
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
      ]),
      {
        createConnection: async () => fakeConnection(closed.length + 1, closed),
        concurrency: 2,
        connection: {},
      },
    ),
    /expected failure/,
  );

  assert.deepEqual(started.sort(), ["failing", "independent"]);
  assert.equal(closed.length, 2);
});

test("projection planner rejects unknown dependencies before the build starts", () => {
  let started = false;
  assert.throws(
    () =>
      createProjectionTaskPlan([
        {
          name: "counts",
          dependencies: ["missing-entries"],
          async run() {
            started = true;
          },
        },
      ]),
    /Unknown task dependency missing-entries for counts/,
  );
  assert.equal(started, false);
});

test("projection planner rejects dependency cycles before the build starts", () => {
  assert.throws(
    () =>
      createProjectionTaskPlan([
        {
          name: "single",
          dependencies: ["average"],
          estimatedDurationMs: 1,
          async run() {},
        },
        {
          name: "average",
          dependencies: ["single"],
          estimatedDurationMs: 1,
          async run() {},
        },
      ]),
    /Projection task dependency cycle/,
  );
});

test("projection planner returns tasks in dependency order", () => {
  const plan = createProjectionTaskPlan([
    {
      name: "counts",
      dependencies: ["entries"],
      estimatedDurationMs: 1,
      async run() {},
    },
    {
      name: "entries",
      dependencies: [],
      estimatedDurationMs: 1,
      async run() {},
    },
  ]);
  assert.deepEqual(
    plan.tasks.map((task) => task.name),
    ["entries", "counts"],
  );
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
  for (const name of [
    "sum-of-ranks",
    "person-medal-rankings",
    "person-pr-streak-rankings",
  ]) {
    const projection = PROJECTION_REGISTRY.find(
      (candidate) => candidate.name === name,
    );
    assert.ok(projection, `${name} is registered`);
    assert.deepEqual(projection.dependencies, ["result-facts"]);
  }
  for (const [name, dependency] of [
    ["person-competition-rankings", "person-period-metrics"],
    ["person-event-rankings", "person-event-bests"],
  ]) {
    const projection = PROJECTION_REGISTRY.find(
      (candidate) => candidate.name === name,
    );
    assert.ok(projection, `${name} is registered`);
    assert.deepEqual(projection.dependencies, [dependency]);
  }
  const activity = PROJECTION_REGISTRY.find(
    (candidate) => candidate.name === "person-activity-rankings",
  );
  assert.ok(activity, "person-activity-rankings is registered");
  assert.deepEqual(activity.dependencies, ["person-period-metrics"]);
  assert.equal(activity.enabledByDefault, false);
  assert.equal(activity.estimatedDurationMs, 45_000);
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

test("shared person grains build once and feed their downstream rankings", () => {
  const period = PROJECTION_REGISTRY.find(
    (candidate) => candidate.name === "person-period-metrics",
  );
  const event = PROJECTION_REGISTRY.find(
    (candidate) => candidate.name === "person-event-bests",
  );
  assert.deepEqual(period.tables, ["person_period_metrics"]);
  assert.deepEqual(event.tables, ["person_event_bests"]);
  assert.deepEqual(
    PROJECTION_REGISTRY.find(
      (candidate) => candidate.name === "person-competition-rankings",
    ).dependencies,
    ["person-period-metrics"],
  );
  assert.deepEqual(
    PROJECTION_REGISTRY.find(
      (candidate) => candidate.name === "person-year-rankings",
    ).dependencies,
    ["person-event-bests"],
  );
});

test("person activity rankings keep only the three new activity metrics", async () => {
  const sql = await readFile(
    new URL(
      "../data-tools/projection-catalog/people/activity-rankings/person_activity_rankings.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(sql, /FROM person_period_metrics/);
  assert.match(sql, /'countries' AS metric/);
  assert.match(sql, /country_count AS metric_value/);
  assert.match(sql, /CAST\('' AS CHAR\(16\)\) AS region_id/);
  assert.doesNotMatch(sql, /competition_count/);
});

test("medal rankings keep event and medal type as independent dimensions", async () => {
  const projection = PROJECTION_REGISTRY.find(
    (candidate) => candidate.name === "person-medal-rankings",
  );
  assert.ok(projection);
  assert.deepEqual(projection.dependencies, ["result-facts"]);
  assert.equal(projection.enabledByDefault, true);

  const sql = await readFile(
    new URL(
      "../data-tools/projection-catalog/people/medal-rankings/person_medal_rankings.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(sql, /facts\.event_id/);
  assert.match(sql, /'overall' AS medal_type/);
  assert.match(sql, /'gold'/);
  assert.match(sql, /'silver'/);
  assert.match(sql, /'bronze'/);
  assert.match(sql, /RANK\(\) OVER/);
  assert.match(sql, /idx_person_medal_rankings_page/);
});

test("result rankings create and remove their solve stage in one build", async () => {
  const projection = PROJECTION_REGISTRY.find(
    (candidate) => candidate.name === "result-rankings",
  );
  assert.ok(projection);
  const statements = [];
  let solveStageExists = false;
  const connection = {
    async query(sql) {
      statements.push(sql);
      if (/DROP TEMPORARY TABLE IF EXISTS solve_facts_stage/.test(sql)) {
        solveStageExists = false;
      } else if (/CREATE TEMPORARY TABLE solve_facts_stage/.test(sql)) {
        solveStageExists = true;
      } else if (/DROP TEMPORARY TABLE solve_facts_stage/.test(sql)) {
        assert.equal(solveStageExists, true);
        solveStageExists = false;
      }
      return [[]];
    },
  };

  await projection.build(connection, "", createTableProgress(5));

  const createIndex = statements.findIndex((statement) =>
    /CREATE TEMPORARY TABLE solve_facts_stage/.test(statement),
  );
  const useIndex = statements.findIndex((statement) =>
    /FROM\s+solve_facts_stage solve/.test(statement),
  );
  const cleanupIndex = statements.findLastIndex((statement) =>
    /DROP TEMPORARY TABLE solve_facts_stage/.test(statement),
  );
  assert.ok(createIndex >= 0);
  assert.ok(useIndex > createIndex);
  assert.ok(cleanupIndex > useIndex);
  assert.equal(solveStageExists, false);
});

test("core ranking-table build contains only active ranking tables", () => {
  const source = CORE_RANKING_TABLE_TASKS.find(
    ({ name }) => name === "ranking-tables-entries-single-source",
  );
  assert.deepEqual(source.dependencies, ["projection:result-facts"]);
  const averageSource = CORE_RANKING_TABLE_TASKS.find(
    ({ name }) => name === "ranking-tables-entries-average-source",
  );
  assert.deepEqual(averageSource.dependencies, ["projection:result-facts"]);
  assert.equal(CORE_RANKING_TABLE_TASK_COUNT, 2);
  const progress = createTableProgress(CORE_RANKING_TABLE_TASK_COUNT);
  let lastProgress;
  for (const task of CORE_RANKING_TABLE_TASKS) {
    if (task.table) lastProgress = progress.start(task.table);
  }
  assert.equal(lastProgress, "[2/2]");
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

  const plan = createProjectionTaskPlan(tasks, ["projection:result-facts"]);
  await executeProjectionTaskPlan(plan, {
    createConnection: async () => fakeConnection(events.length + 1, []),
    concurrency: 2,
    connection: {},
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
    resultFacts: "result_facts_staging",
  });

  assert.match(sql, /FROM\s+result_facts_staging r/);
  assert.doesNotMatch(sql, /FROM\s+result_facts r/);
});

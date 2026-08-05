import type {
  DependencyTask,
  DependencyTaskOutcome,
  DependencyTaskSchedulerOptions,
  RunningDependencyTask,
} from "./scheduler-types.ts";
import type { ProjectionConnection } from "../shared/database-types.ts";

const LONG_TASK_THRESHOLD_MS = 60_000;

export async function runDependencyAwareTasks(
  tasks: readonly DependencyTask[],
  options: DependencyTaskSchedulerOptions,
): Promise<unknown[]> {
  const {
    connection,
    createConnection,
    concurrency = 1,
    satisfiedDependencies = [],
  } = options;
  const taskByName = new Map(tasks.map((task) => [task.name, task]));
  const initiallyCompleted = new Set(["raw-wca", ...satisfiedDependencies]);
  for (const task of tasks) {
    for (const dependency of task.dependencies) {
      if (!initiallyCompleted.has(dependency) && !taskByName.has(dependency)) {
        throw new Error(
          `Unknown task dependency ${dependency} for ${task.name}`,
        );
      }
    }
  }

  if (!createConnection || concurrency === 1 || tasks.length <= 1) {
    const results: unknown[] = [];
    const completed = new Set(initiallyCompleted);
    const pending = [...tasks];
    while (pending.length > 0) {
      const index = pending.findIndex((task) =>
        task.dependencies.every((dependency) => completed.has(dependency)),
      );
      if (index < 0) {
        throw new Error(
          `Task dependency cycle or missing dependency among: ${pending.map((task) => task.name).join(", ")}`,
        );
      }
      const task = pending.splice(index, 1)[0];
      if (!task) throw new Error("Ready projection task is missing");
      results.push(await task.run(connection));
      completed.add(task.name);
    }
    return results;
  }
  const createWorkerConnection = createConnection;

  const pending = [...tasks];
  const running = new Map<string, RunningDependencyTask>();
  const completed = new Set(initiallyCompleted);
  const timings = new Map<string, unknown>();
  let failure: unknown;

  async function runTask(task: DependencyTask): Promise<unknown> {
    let workerConnection: ProjectionConnection | undefined;
    try {
      workerConnection = await createWorkerConnection();
      return await task.run(workerConnection);
    } finally {
      if (workerConnection) await workerConnection.end();
    }
  }

  function dependenciesComplete(task: DependencyTask): boolean {
    return task.dependencies.every((dependency) => completed.has(dependency));
  }

  function isLongTask(task: DependencyTask): boolean {
    return task.estimatedDurationMs >= LONG_TASK_THRESHOLD_MS;
  }

  function nextReadyTask(): DependencyTask | undefined {
    const ready = pending.filter(dependenciesComplete);
    if (ready.length === 0) return undefined;
    const longTaskRunning = [...running.values()].some((entry) =>
      isLongTask(entry.task),
    );
    const shortReady = ready.filter((task) => !isLongTask(task));
    const candidates =
      longTaskRunning && shortReady.length > 0 ? shortReady : ready;
    return candidates.reduce<DependencyTask | undefined>((selected, task) => {
      if (!selected) return task;
      if (longTaskRunning && shortReady.length > 0) {
        return task.estimatedDurationMs < selected.estimatedDurationMs
          ? task
          : selected;
      }
      return task.estimatedDurationMs > selected.estimatedDurationMs
        ? task
        : selected;
    }, undefined);
  }

  function startReadyTasks(): void {
    while (running.size < concurrency) {
      const task = nextReadyTask();
      if (!task) break;
      pending.splice(pending.indexOf(task), 1);
      const promise: Promise<DependencyTaskOutcome> = runTask(task)
        .then((result) => ({ task, result }))
        .catch((error: unknown) => ({ task, error }));
      running.set(task.name, { task, promise });
    }
  }

  while ((pending.length > 0 || running.size > 0) && failure === undefined) {
    startReadyTasks();
    if (running.size === 0) {
      throw new Error(
        `Task dependency cycle or missing dependency among: ${pending.map((task) => task.name).join(", ")}`,
      );
    }
    const outcome = await Promise.race(
      [...running.values()].map((entry) => entry.promise),
    );
    running.delete(outcome.task.name);
    if ("error" in outcome) {
      failure = outcome.error;
      break;
    }
    completed.add(outcome.task.name);
    timings.set(outcome.task.name, outcome.result);
  }

  if (running.size > 0) {
    await Promise.allSettled(
      [...running.values()].map((entry) => entry.promise),
    );
  }
  if (failure !== undefined) throw failure;
  return tasks.map((task) => timings.get(task.name));
}

const LONG_TASK_THRESHOLD_MS = 60_000;

export async function runDependencyAwareTasks(
  tasks,
  {
    connection,
    createConnection,
    concurrency = 1,
    satisfiedDependencies = [],
  } = {},
) {
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
    const results = [];
    const completed = new Set(initiallyCompleted);
    const pending = [...tasks];
    while (pending.length > 0) {
      const index = pending.findIndex((task) =>
        task.dependencies.every((dependency) => completed.has(dependency)),
      );
      if (index < 0) {
        throw new Error(
          `Task dependency cycle or missing dependency among: ${pending.map(({ name }) => name).join(", ")}`,
        );
      }
      const [task] = pending.splice(index, 1);
      results.push(await task.run(connection));
      completed.add(task.name);
    }
    return results;
  }

  const pending = [...tasks];
  const running = new Map();
  const completed = new Set(initiallyCompleted);
  const timings = new Map();
  let failure;

  async function runTask(task) {
    let workerConnection;
    try {
      workerConnection = await createConnection();
      return await task.run(workerConnection);
    } finally {
      if (workerConnection) await workerConnection.end();
    }
  }

  function dependenciesComplete(task) {
    return task.dependencies.every((dependency) => completed.has(dependency));
  }

  function isLongTask(task) {
    return task.estimatedDurationMs >= LONG_TASK_THRESHOLD_MS;
  }

  function nextReadyTask() {
    const ready = pending.filter(dependenciesComplete);
    if (ready.length === 0) return undefined;
    const longTaskRunning = [...running.values()].some(({ task }) =>
      isLongTask(task),
    );
    const shortReady = ready.filter((task) => !isLongTask(task));
    const candidates =
      longTaskRunning && shortReady.length > 0 ? shortReady : ready;
    return candidates.reduce((selected, task) => {
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

  function startReadyTasks() {
    while (running.size < concurrency) {
      const task = nextReadyTask();
      if (!task) break;
      pending.splice(pending.indexOf(task), 1);
      const promise = runTask(task)
        .then((result) => ({ task, result }))
        .catch((error) => ({ task, error }));
      running.set(task.name, { task, promise });
    }
  }

  while ((pending.length > 0 || running.size > 0) && !failure) {
    startReadyTasks();
    if (running.size === 0) {
      throw new Error(
        `Task dependency cycle or missing dependency among: ${pending.map(({ name }) => name).join(", ")}`,
      );
    }
    const result = await Promise.race(
      [...running.values()].map(({ promise }) => promise),
    );
    running.delete(result.task.name);
    if (result.error) {
      failure = result.error;
      break;
    }
    completed.add(result.task.name);
    timings.set(result.task.name, result.result);
  }

  if (running.size > 0) {
    await Promise.allSettled(
      [...running.values()].map(({ promise }) => promise),
    );
  }
  if (failure) throw failure;
  return tasks.map(({ name }) => timings.get(name));
}

import { startProjectionWorker } from "./worker.ts";

startProjectionWorker().catch(() => {
  process.exitCode = 1;
});

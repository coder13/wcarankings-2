import { appendFile, mkdir, stat, truncate } from "node:fs/promises";
import { dirname } from "node:path";

const MAX_LOG_BYTES = 128 * 1024 * 1024;

/** Writes worker messages to stdout and to a bounded local log file. */
export class ProjectionWorkerLogger {
  private readonly filePath =
    process.env.PROJECTION_WORKER_LOG_FILE ?? "logs/projection-worker.log";
  private pendingWrite: Promise<void> = Promise.resolve();

  write(message: string): void {
    process.stdout.write(message);
    this.pendingWrite = this.pendingWrite
      .then(() => this.writeToFile(message))
      .catch((error: unknown) => {
        process.stderr.write(
          `[projection-worker] could not write log file: ${error instanceof Error ? error.message : String(error)}\n`,
        );
      });
  }

  async flush(): Promise<void> {
    await this.pendingWrite;
  }

  private async writeToFile(message: string): Promise<void> {
    const bytes = Buffer.byteLength(message, "utf8");
    await mkdir(dirname(this.filePath), { recursive: true });

    let currentSize = 0;
    try {
      currentSize = (await stat(this.filePath)).size;
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }

    // Keep the file at or below the limit. A new line that would cross the
    // limit starts a fresh file, rather than creating a second backup file.
    if (currentSize + bytes > MAX_LOG_BYTES) {
      await truncate(this.filePath, 0).catch((error: unknown) => {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      });
    }

    // A single unusually large message must not exceed the bound either.
    if (bytes > MAX_LOG_BYTES) {
      await appendFile(
        this.filePath,
        Buffer.from(message).subarray(bytes - MAX_LOG_BYTES),
      );
      return;
    }

    await appendFile(this.filePath, message, "utf8");
  }
}

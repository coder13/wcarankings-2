import { spawn } from "node:child_process";
import type { SpawnOptions } from "node:child_process";

export interface RunCommandInput {
  args: readonly string[];
  command: string;
  options?: SpawnOptions;
}

export function runCommand(input: RunCommandInput): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(input.command, [...input.args], {
      stdio: "inherit",
      ...input.options,
    });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `${input.command} failed with ${signal ? `signal ${signal}` : `exit code ${code}`}`,
        ),
      );
    });
  });
}

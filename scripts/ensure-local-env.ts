import { access, chmod, copyFile } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dir, "..");
const localEnvironmentFile = resolve(repositoryRoot, ".env.local");
const mainWorktreeEnvironmentFile =
  "/home/cailyn/projects/wcarankings-2/.env.local";

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

if (!(await fileExists(localEnvironmentFile))) {
  if (!(await fileExists(mainWorktreeEnvironmentFile)))
    throw new Error(
      `No local .env.local exists. Create ${mainWorktreeEnvironmentFile} first.`,
    );
  await copyFile(mainWorktreeEnvironmentFile, localEnvironmentFile);
  await chmod(localEnvironmentFile, 0o600);
  process.stdout.write("Copied .env.local from the main worktree.\n");
}

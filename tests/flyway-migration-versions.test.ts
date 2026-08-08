import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import test from "node:test";

test("app migration versions are unique", async () => {
  const directory = new URL("../migrations/mysql/app/", import.meta.url);
  const files = await readdir(directory);
  const versions = new Map<string, string>();

  for (const file of files) {
    const match = /^V(\d+)__/.exec(file);
    if (!match) continue;

    const existing = versions.get(match[1]);
    assert.equal(
      existing,
      undefined,
      `Duplicate Flyway version ${match[1]}: ${existing}, ${file}`,
    );
    versions.set(match[1], file);
  }
});

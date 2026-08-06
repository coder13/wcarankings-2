import assert from "node:assert/strict";
import { test } from "bun:test";
import { resolveWcaExport } from "../scripts/lib/wca-export.ts";

test("resolves the current WCA export", async () => {
  const result = await resolveWcaExport(async () => ({
    ok: true,
    json: async () => ({
      export_date: "2026-08-04T00:00:00Z",
      export_format_version: "2.1",
      sql_url: "https://example.test/wca.sql.zip",
    }),
  }));
  assert.deepEqual(result, {
    exportDate: "2026-08-04T00:00:00Z",
    sqlUrl: "https://example.test/wca.sql.zip",
    version: "2.1",
  });
});

test("rejects an incompatible WCA export", async () => {
  await assert.rejects(
    () =>
      resolveWcaExport(async () => ({
        ok: true,
        json: async () => ({
          export_date: "2026-08-04T00:00:00Z",
          export_format_version: "3",
          sql_url: "https://example.test/wca.sql.zip",
        }),
      })),
    /Unsupported WCA export major version/,
  );
});

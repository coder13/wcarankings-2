import assert from "node:assert/strict";
import test from "node:test";
import { getImportHealthStatus, formatDuration } from "@/lib/helpers/text/import-health";

test("distinguishes empty, running, successful, and failed imports", () => {
  assert.equal(getImportHealthStatus({ currentExport: null, latestRun: null }), "empty");
  assert.equal(getImportHealthStatus({ currentExport: "2026-07-27", latestRun: { status: "running" } }), "import_running");
  assert.equal(getImportHealthStatus({ currentExport: "2026-07-27", latestRun: { status: "succeeded" } }), "last_import_succeeded");
  assert.equal(getImportHealthStatus({ currentExport: "2026-07-27", latestRun: { status: "failed" } }), "last_import_failed");
  assert.equal(formatDuration(1250), "1.3 s");
});

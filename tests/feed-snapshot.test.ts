import assert from "node:assert/strict";
import test from "node:test";
import {
  currentFeedExportVersion,
  readFeedSnapshot,
  writeFeedSnapshot,
} from "@/services/feeds/snapshot";

test("uses the export fetched time as the feed snapshot version", async () => {
  const calls: Array<{ text: string; values?: unknown[] }> = [];
  const query = async (text: string, values?: unknown[]) => {
    calls.push({ text, values });
    if (text.includes("export_metadata"))
      return { rows: [{ value: "export-1" }] };
    return {
      rows: [
        {
          snapshot_json: JSON.stringify({
            exportVersion: "v8:export-1",
            candidates: [],
          }),
        },
      ],
    };
  };

  assert.equal(await currentFeedExportVersion(query), "v8:export-1");
  assert.deepEqual(await readFeedSnapshot({ query }), {
    exportVersion: "v8:export-1",
    candidates: [],
  });
  assert.equal(calls.length, 3);
});

test("writes one complete snapshot for one export", async () => {
  let call: { text: string; values?: unknown[] } | undefined;
  const query = async (text: string, values?: unknown[]) => {
    call = { text, values };
    return { rows: [] };
  };
  await writeFeedSnapshot(
    { exportVersion: "v8:export-1", candidates: [] },
    { query },
  );
  assert.match(call?.text ?? "", /ON DUPLICATE KEY UPDATE/);
  assert.deepEqual(call?.values, [
    "v8:export-1",
    '{"exportVersion":"v8:export-1","candidates":[]}',
  ]);
});

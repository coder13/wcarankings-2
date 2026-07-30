import assert from "node:assert/strict";
import test from "node:test";
import { checkServerDatasetCompatibility } from "../scripts/check-release-compatibility.mjs";

const server = {
  minimumDatasetSchemaVersion: 1,
  maximumDatasetSchemaVersion: 2,
};

test("server compatibility depends on schema format, not an exact dataset fingerprint", () => {
  assert.equal(
    checkServerDatasetCompatibility({ server, datasetSchemaVersion: 2 }).compatible,
    true,
  );
});

test("rejects datasets outside the server compatibility range", () => {
  assert.throws(
    () => checkServerDatasetCompatibility({ server, datasetSchemaVersion: 3 }),
    /outside/,
  );
});

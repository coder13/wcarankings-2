import assert from "node:assert/strict";
import test from "node:test";

import { listBrowseLoadState } from "@/components/ListBrowse/ListBrowse";

test("a failed client list request replaces the loading skeleton with an error", () => {
  assert.equal(listBrowseLoadState(null, true), "error");
});

test("the list directory distinguishes pending and loaded states", () => {
  assert.equal(listBrowseLoadState(null, false), "loading");
  assert.equal(listBrowseLoadState([], false), "ready");
});

import assert from "node:assert/strict";
import test from "node:test";
import { roundName } from "@/lib/result-rankings";

test("formats WCA round type identifiers for result provenance", () => {
  assert.equal(roundName("1"), "First round");
  assert.equal(roundName("3"), "Semi final");
  assert.equal(roundName("f"), "Final");
  assert.equal(roundName("custom"), "custom");
});

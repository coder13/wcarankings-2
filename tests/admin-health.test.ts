import assert from "node:assert/strict";
import test from "node:test";
import { getCapabilityStatus } from "@/lib/admin-health";

test("classifies active projection capabilities", () => {
  assert.equal(
    getCapabilityStatus({
      persisted: true,
      present: 5,
      total: 5,
      hasGeneration: true,
    }),
    "enabled",
  );
  assert.equal(
    getCapabilityStatus({
      persisted: false,
      present: 5,
      total: 5,
      hasGeneration: true,
    }),
    "partial",
  );
  assert.equal(
    getCapabilityStatus({
      persisted: true,
      present: 2,
      total: 5,
      hasGeneration: true,
    }),
    "partial",
  );
  assert.equal(
    getCapabilityStatus({
      persisted: undefined,
      present: 0,
      total: 5,
      hasGeneration: false,
    }),
    "unknown",
  );
  assert.equal(
    getCapabilityStatus({
      persisted: undefined,
      present: 2,
      total: 5,
      hasGeneration: false,
    }),
    "partial",
  );
});

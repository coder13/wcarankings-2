import assert from "node:assert/strict";
import test from "node:test";
import { DynamicListInputError, MAX_DYNAMIC_LIST_MEMBERS, parseDynamicListIds } from "@/lib/dynamic-list";

test("parses dynamic list IDs in canonical comma-separated URLs", () => {
  assert.deepEqual(
    parseDynamicListIds("2016hoov01, 2012WALK02,2016HOOV01,not-an-id"),
    { personIds: ["2016HOOV01", "2012WALK02"], invalidIds: ["not-an-id"] },
  );
});

test("rejects dynamic lists above the supported size", () => {
  const ids = Array.from({ length: MAX_DYNAMIC_LIST_MEMBERS + 1 }, (_, index) => `${2000 + index}TEST01`);
  assert.throws(() => parseDynamicListIds(ids.join(",")), DynamicListInputError);
});

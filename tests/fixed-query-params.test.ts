import assert from "node:assert/strict";
import test from "node:test";
import { withFixedQueryParams } from "@/lib/api/fixed-query-params";

test("sets fixed parameters and rejects selected statistics", () => {
  assert.deepEqual(
    [...withFixedQueryParams(new URLSearchParams("eventId=333"), {
      result: "single",
    })],
    [
      ["eventId", "333"],
      ["result", "single"],
    ],
  );
  assert.throws(
    () =>
      withFixedQueryParams(new URLSearchParams("stat=solves"), {
        result: "single",
      }, ["stat"]),
    /stat is selected by this API route/,
  );
});

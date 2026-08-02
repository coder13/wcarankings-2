import assert from "node:assert/strict";
import test from "node:test";
import { resolveListAddSubmission } from "@/components/ListOwnerControls/list-add-submission";

const luke = { personId: "2014LUKE01", name: "Luke Example", avatarUrl: null };

test("Enter selects the highlighted person for the chip buffer", () => {
  assert.deepEqual(resolveListAddSubmission("luke", [luke], 0), {
    type: "select-person",
    person: luke,
  });
});

test("Enter commits typed WCA IDs directly", () => {
  assert.deepEqual(resolveListAddSubmission("2014LUKE01", [], 0), {
    type: "commit-person-ids",
    personIds: ["2014LUKE01"],
  });
});

test("Enter with an empty search commits the buffered chips", () => {
  assert.deepEqual(resolveListAddSubmission("", [], 0), { type: "commit-buffer" });
});

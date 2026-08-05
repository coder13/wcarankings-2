import assert from "node:assert/strict";
import test from "node:test";
import {
  assertListMemberCapacity,
  USER_LIST_MEMBER_LIMIT,
} from "@/lib/list-ranking-cache";

test("user list member capacity rejects create, bulk add, clone, and accepted-request overflow", () => {
  for (const [current, additions] of [
    [0, USER_LIST_MEMBER_LIMIT + 1],
    [USER_LIST_MEMBER_LIMIT - 5, 6],
    [USER_LIST_MEMBER_LIMIT + 1, 0],
    [USER_LIST_MEMBER_LIMIT, 1],
  ]) {
    assert.throws(() => assertListMemberCapacity("user", current, additions), /10,000/);
  }
});

test("system lists are exempt from the user member cap", () => {
  assert.doesNotThrow(() => assertListMemberCapacity("system", USER_LIST_MEMBER_LIMIT * 10, 1));
});

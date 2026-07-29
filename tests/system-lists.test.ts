import assert from "node:assert/strict";
import test from "node:test";
import {
  primaryNameToken,
  SYSTEM_LIST_DEFINITIONS,
} from "../scripts/system-list-definitions.mjs";
import { boardMemberIds, roleMemberIds } from "../scripts/refresh-board-list.mjs";

test("system list aliases are stable and unique", () => {
  assert.deepEqual(
    SYSTEM_LIST_DEFINITIONS.map((definition) => definition.alias),
    ["max", "luke"],
  );
  assert.equal(
    new Set(SYSTEM_LIST_DEFINITIONS.map((definition) => definition.alias)).size,
    SYSTEM_LIST_DEFINITIONS.length,
  );
});

test("board refresh normalizes unique WCA IDs from public role records", () => {
  assert.deepEqual(
    boardMemberIds([
      { user: { wca_id: "2012PARK03" } },
      { user: { wca_id: "2012park03" } },
      { user: { wca_id: "not-a-wca-id" } },
      { user: null },
    ]),
    ["2012PARK03"],
  );
});

test("role-backed system lists accept the API user_roles envelope", () => {
  assert.deepEqual(
    roleMemberIds({
      user_roles: [{ user: { wca_id: "2016LOPE37" } }],
    }),
    ["2016LOPE37"],
  );
});

test("first-token matching is exact and ignores a parenthesized local name", () => {
  assert.equal(primaryNameToken("Max Park"), "max");
  assert.equal(primaryNameToken("  Luke Garrett  "), "luke");
  assert.equal(primaryNameToken("Max Park (박맥스)"), "max");
  assert.notEqual(primaryNameToken("Maxwell Park"), "max");
});

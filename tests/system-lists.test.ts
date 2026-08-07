import assert from "node:assert/strict";
import test from "node:test";
import {
  primaryNameToken,
  PUBLIC_SYSTEM_LIST_LIMIT,
  SYSTEM_LIST_DEFINITIONS,
} from "../scripts/lib/system-list-definitions.ts";
import { roleMemberIds } from "../scripts/lib/board-lists.ts";

test("system list aliases are stable and unique", () => {
  assert.ok(
    SYSTEM_LIST_DEFINITIONS.some((definition) => definition.alias === "max"),
  );
  assert.ok(
    SYSTEM_LIST_DEFINITIONS.some((definition) => definition.alias === "luke"),
  );
  assert.equal(
    new Set(SYSTEM_LIST_DEFINITIONS.map((definition) => definition.alias)).size,
    SYSTEM_LIST_DEFINITIONS.length,
  );
});

test("only the top 25 names in each system-list group are public", () => {
  for (const group of [
    SYSTEM_LIST_DEFINITIONS.filter(
      (definition) =>
        definition.match === "first-name" && definition.gender === "m",
    ),
    SYSTEM_LIST_DEFINITIONS.filter(
      (definition) =>
        definition.match === "first-name" && definition.gender === "f",
    ),
    SYSTEM_LIST_DEFINITIONS.filter(
      (definition) => definition.match === "last-name",
    ),
  ]) {
    assert.equal(group.length >= PUBLIC_SYSTEM_LIST_LIMIT, true);
    assert.ok(
      group
        .slice(0, PUBLIC_SYSTEM_LIST_LIMIT)
        .every((definition) => definition.visibility === "public"),
    );
    assert.ok(
      group
        .slice(PUBLIC_SYSTEM_LIST_LIMIT)
        .every((definition) => definition.visibility === "private"),
    );
  }
});

test("private system lists remain direct-link lists", () => {
  const max = SYSTEM_LIST_DEFINITIONS.find(
    (definition) => definition.alias === "max",
  );
  assert.equal(max?.visibility, "private");
});

test("board refresh normalizes unique WCA IDs from public role records", () => {
  assert.deepEqual(
    roleMemberIds([
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

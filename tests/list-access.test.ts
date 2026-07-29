import assert from "node:assert/strict";
import test from "node:test";
import type { AuthUser } from "@/lib/auth";
import {
  assertCanViewList,
  ListNotFoundError,
  type ListSummary,
} from "@/lib/lists";

const owner: AuthUser = {
  id: 1,
  wcaId: "2016TEST01",
  name: "List Owner",
  countryIso2: "US",
  avatarUrl: null,
  allowListInclusion: true,
};

function list(visibility: "public" | "private"): ListSummary {
  return {
    id: 10,
    publicId: "7K3M9Q2D",
    systemAlias: null,
    kind: "user",
    name: "Friends",
    slug: "friends",
    description: null,
    visibility,
    joinPolicy: "closed",
    memberCount: 0,
    membershipVersion: 1,
    systemDefinitionVersion: null,
    owner: {
      id: owner.id,
      name: owner.name,
      wcaId: owner.wcaId,
    },
    createdAt: "2026-07-28T00:00:00Z",
    updatedAt: "2026-07-28T00:00:00Z",
  };
}

test("public lists are visible without authentication", () => {
  assert.doesNotThrow(() => assertCanViewList(list("public"), null));
});

test("private lists return not found to anyone except the owner", () => {
  assert.throws(
    () => assertCanViewList(list("private"), null),
    ListNotFoundError,
  );
  assert.doesNotThrow(() => assertCanViewList(list("private"), owner));
});

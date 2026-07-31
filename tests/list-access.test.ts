import assert from "node:assert/strict";
import test from "node:test";
import type { AuthUser } from "@/services/auth/types";
import { assertCanViewList } from "@/services/lists/lists";
import type { ListSummary } from "@/services/lists/types";

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

test("private lists are visible through their direct URLs", () => {
  assert.doesNotThrow(() => assertCanViewList(list("private"), null));
  assert.doesNotThrow(() => assertCanViewList(list("private"), owner));
});

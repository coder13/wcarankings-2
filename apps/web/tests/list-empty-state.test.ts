import assert from "node:assert/strict";
import test from "node:test";
import {
  EMPTY_OWNER_LIST_MESSAGE,
  emptyOwnerListMessage,
} from "@/components/RankingsExplorer/list-empty-state";

test("empty owner lists prompt the owner to add cubers", () => {
  assert.equal(
    emptyOwnerListMessage({ memberCount: 0 }),
    EMPTY_OWNER_LIST_MESSAGE,
  );
});

test("non-empty lists keep the regular ranking empty state", () => {
  assert.equal(emptyOwnerListMessage({ memberCount: 1 }), undefined);
  assert.equal(emptyOwnerListMessage(undefined), undefined);
});

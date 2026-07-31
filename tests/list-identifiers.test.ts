import assert from "node:assert/strict";
import test from "node:test";
import {
  generateListPublicId,
  LIST_PUBLIC_ID_ALPHABET,
  normalizeListPublicId,
  normalizeSystemAlias,
  RESERVED_LIST_ALIASES,
  slugifyListName,
} from "@/lib/helpers/lists/list-identifiers";

test("generates readable eight-character public list IDs", () => {
  const ids = new Set(Array.from({ length: 100 }, generateListPublicId));
  assert.equal(ids.size, 100);
  for (const id of ids) {
    assert.equal(id.length, 8);
    assert.ok([...id].every((character) => LIST_PUBLIC_ID_ALPHABET.includes(character)));
    assert.doesNotMatch(id, /[ILOU]/);
  }
});

test("normalizes public IDs without accepting ambiguous characters", () => {
  assert.equal(normalizeListPublicId("7k3m9q2d"), "7K3M9Q2D");
  assert.equal(normalizeListPublicId("7K3M9Q2O"), null);
  assert.equal(normalizeListPublicId("too-short"), null);
});

test("creates cosmetic slugs and reserves system aliases", () => {
  assert.equal(slugifyListName("PNW Delegates"), "pnw-delegates");
  assert.equal(slugifyListName("  Máx's Friends  "), "max-s-friends");
  assert.equal(normalizeSystemAlias("Max"), "max");
  assert.equal(normalizeSystemAlias("not valid"), null);
  assert.ok(RESERVED_LIST_ALIASES.has("max"));
  assert.ok(RESERVED_LIST_ALIASES.has("new"));
});

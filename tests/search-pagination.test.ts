import assert from "node:assert/strict";
import test from "node:test";
import { SEARCH_PAGE_SIZE, normalizeSearchPage } from "@/lib/search-pagination";

test("uses bounded, zero-based search pages", () => {
  assert.equal(SEARCH_PAGE_SIZE, 50);
  assert.equal(normalizeSearchPage(null), 0);
  assert.equal(normalizeSearchPage("0"), 0);
  assert.equal(normalizeSearchPage("3"), 3);
  assert.equal(normalizeSearchPage("-1"), 0);
  assert.equal(normalizeSearchPage("1.5"), 0);
  assert.equal(normalizeSearchPage("not-a-page"), 0);
});

import assert from "node:assert/strict";
import test from "node:test";
import { stripMarkdownLinks } from "@/lib/helpers/text/display-text";

test("renders Markdown venue links as plain text", () => {
  assert.equal(
    stripMarkdownLinks(
      "[Longyearbyen public library](https://www.lokalstyre.no/biblioteket.466981.no.html)",
    ),
    "Longyearbyen public library",
  );
  assert.equal(
    stripMarkdownLinks(
      "[Venue](https://example.com/path_(with_parentheses)) — Hall A",
    ),
    "Venue — Hall A",
  );
});

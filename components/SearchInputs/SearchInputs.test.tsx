import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SearchInputs } from "./SearchInputs";

test("renders the search input and result status", () => {
  const markup = renderToStaticMarkup(
    <SearchInputs
      findOpen
      findQuery="Avery"
      findError=""
      findLoading={false}
      findPending={false}
      findMatches={[]}
      findIndex={-1}
      onOpen={() => undefined}
      onClose={() => undefined}
      onQueryChange={() => undefined}
      onCycle={() => undefined}
    />,
  );
  assert.match(markup, /Find a name or WCA ID/);
  assert.match(markup, /No matches/);
});

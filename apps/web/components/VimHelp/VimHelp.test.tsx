import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { VimHelp } from "./VimHelp";

test("renders the Vim keybinding help", () => {
  const markup = renderToStaticMarkup(<VimHelp onClose={() => undefined} />);
  assert.match(markup, /Vim bindings/);
  assert.match(markup, /Search names and WCA IDs with regex/);
});

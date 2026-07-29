import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ListCreateTrigger, ListOwnerControls } from "./ListOwnerControls";

test("renders the list creation and owner actions", () => {
  const markup = renderToStaticMarkup(<><ListCreateTrigger /><ListOwnerControls listId="7K3M9Q2D" initialVisibility="public" /></>);
  assert.match(markup, /Create a list/);
  assert.match(markup, /List settings/);
});

import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ListCreate } from "./ListCreate";

test("signed-in list creation shows metadata and visibility fields", () => {
  const markup = renderToStaticMarkup(<ListCreate signedIn />);
  assert.match(markup, /Create a list/);
  assert.match(markup, /Visibility/);
  assert.match(markup, /WCA IDs/);
  assert.match(markup, /Create list/);
});

test("signed-out list creation provides WCA sign-in", () => {
  const markup = renderToStaticMarkup(<ListCreate signedIn={false} />);
  assert.match(markup, /Sign in with WCA/);
});

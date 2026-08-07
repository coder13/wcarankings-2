import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { GoogleAnalytics } from "./GoogleAnalytics";

test("renders no visible analytics markup", () => {
  assert.equal(renderToStaticMarkup(<GoogleAnalytics />), "");
});

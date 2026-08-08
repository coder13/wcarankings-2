import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Checkbox } from "./Checkbox";

test("renders a native checkbox control", () => {
  const markup = renderToStaticMarkup(<Checkbox checked readOnly aria-label="Select request" />);
  assert.match(markup, /type="checkbox"/);
  assert.match(markup, /data-control="checkbox"/);
  assert.match(markup, /checked=""/);
});

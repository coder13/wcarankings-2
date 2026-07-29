import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RegionPicker } from "./RegionPicker";

test("renders the selected region input", () => {
  const markup = renderToStaticMarkup(
    <RegionPicker
      options={[{ key: "world", scope: "world", regionId: "", label: "World" }]}
      selected={{ scope: "world", regionId: "" }}
      onChange={() => undefined}
    />,
  );
  assert.match(markup, /aria-label="Region"/);
  assert.match(markup, /role="combobox"/);
  assert.match(markup, /aria-autocomplete="list"/);
  assert.match(markup, /value="World"/);
  assert.doesNotMatch(markup, /aria-label="Clear region"/);
});

test("can remain visible but disabled for a single list region", () => {
  const markup = renderToStaticMarkup(
    <RegionPicker
      disabled
      options={[{ key: "world", scope: "world", regionId: "", label: "World" }]}
      selected={{ scope: "world", regionId: "" }}
      onChange={() => undefined}
    />,
  );

  assert.match(markup, /disabled=""/);
  assert.match(markup, /regionPicker isDisabled/);
  assert.match(markup, /aria-label="Region"/);
});

test("renders a clear button in place of the chevron for a specific region", () => {
  const markup = renderToStaticMarkup(
    <RegionPicker
      options={[
        { key: "world", scope: "world", regionId: "", label: "World" },
        {
          key: "continent:_Europe",
          scope: "continent",
          regionId: "_Europe",
          label: "Europe",
        },
      ]}
      selected={{ scope: "continent", regionId: "_Europe" }}
      onChange={() => undefined}
    />,
  );

  assert.match(markup, /aria-label="Clear region"/);
  assert.match(markup, /value="Europe"/);
});

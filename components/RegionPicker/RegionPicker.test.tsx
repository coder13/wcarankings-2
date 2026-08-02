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
  assert.match(markup, /value="🌐 World"/);
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
  assert.match(markup, /value="🗺️ Europe"/);
});

test("shows a country flag in the selected region", () => {
  const markup = renderToStaticMarkup(
    <RegionPicker
      options={[
        { key: "world", scope: "world", regionId: "", label: "World" },
        {
          key: "country:US",
          scope: "country",
          regionId: "US",
          label: "United States",
          iso2: "US",
        },
      ]}
      selected={{ scope: "country", regionId: "US" }}
      onChange={() => undefined}
    />,
  );

  assert.match(markup, /value="🇺🇸 United States"/);
});

test("shows an icon for every region scope", () => {
  const markup = renderToStaticMarkup(
    <RegionPicker
      options={[
        { key: "world", scope: "world", regionId: "", label: "World" },
        { key: "continent:_Africa", scope: "continent", regionId: "_Africa", label: "Africa" },
        { key: "continent:_North America", scope: "continent", regionId: "_North America", label: "North America" },
        { key: "country:US", scope: "country", regionId: "US", label: "United States", iso2: "US" },
      ]}
      selected={{ scope: "world", regionId: "" }}
      onChange={() => undefined}
    />,
  );

  assert.match(markup, /🌐 World/);
  assert.match(markup, /🗺️[^<]*<\/span>\s*Africa/);
  assert.match(markup, /🗺️[^<]*<\/span>\s*North America/);
  assert.match(markup, /🇺🇸[^<]*<\/span>\s*United States/);
});

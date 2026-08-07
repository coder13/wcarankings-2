import assert from "node:assert/strict";
import test from "node:test";
import { renderWithProviders } from "@/tests/render-providers";
import { ProfileMenu } from "./ProfileMenu";

test("renders an accessible profile button", () => {
  const markup = renderWithProviders(<ProfileMenu />);
  assert.match(markup, /class="profileButton"/);
  assert.match(markup, /aria-label="Open profile menu"/);
  assert.match(markup, /aria-haspopup="menu"/);
  assert.match(markup, /aria-expanded="false"/);
  assert.match(markup, /type="button"/);
});

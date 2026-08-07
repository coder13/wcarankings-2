import assert from "node:assert/strict";
import test from "node:test";
import { renderWithProviders } from "@/tests/render-providers";
import { ListMine } from "./ListMine";

test("lists the current user's public and private lists", () => {
  const markup = renderWithProviders(
    <ListMine lists={[
      { id: 1, publicId: "7K3M9Q2D", systemAlias: null, kind: "user", name: "Public group", slug: "public-group", description: null, visibility: "public", joinPolicy: "open", memberCount: 4, membershipVersion: 1, systemDefinitionVersion: null, owner: null, createdAt: "2026-07-29", updatedAt: "2026-07-29" },
      { id: 2, publicId: "6N4B8H1T", systemAlias: null, kind: "user", name: "Private group", slug: "private-group", description: null, visibility: "private", joinPolicy: "closed", memberCount: 2, membershipVersion: 1, systemDefinitionVersion: null, owner: null, createdAt: "2026-07-29", updatedAt: "2026-07-29" },
    ]}
    />,
  );
  assert.match(markup, /My lists/);
  assert.match(markup, /Public group/);
  assert.match(markup, /Private/);
});

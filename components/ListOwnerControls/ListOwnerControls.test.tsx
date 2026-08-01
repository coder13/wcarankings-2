import assert from "node:assert/strict";
import test from "node:test";
import { renderWithProviders } from "@/tests/render-providers";
import { ListCreateTrigger, ListMembershipRequestRows, ListOwnerControls } from "./ListOwnerControls";

test("renders the list creation and owner actions", () => {
  const markup = renderWithProviders(<><ListCreateTrigger /><ListOwnerControls listId="7K3M9Q2D" initialVisibility="public" /><ListMembershipRequestRows listId="7K3M9Q2D" initialRequests={[{ id: 1, name: "Ethan Davis", personId: "2016DAVI02" }]} /></>);
  assert.match(markup, /Create a list/);
  assert.match(markup, /List settings/);
  assert.match(markup, /Membership requests/);
  assert.match(markup, /Select Ethan Davis/);
  assert.match(markup, /listMembershipRequestBulkActions" aria-hidden="true"/);
  assert.match(markup, /Accept selected/);
});

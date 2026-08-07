import assert from "node:assert/strict";
import test from "node:test";
import { nextVerticalOptionIndex } from "./optionNavigation";

const navigate = (key: string, currentIndex: number) =>
  nextVerticalOptionIndex({ key, currentIndex, optionCount: 4 });

test("navigates a vertical option list without wrapping", () => {
  assert.equal(navigate("ArrowDown", 1), 2);
  assert.equal(navigate("ArrowUp", 2), 1);
  assert.equal(navigate("ArrowUp", 0), undefined);
  assert.equal(navigate("ArrowDown", 3), undefined);
});

test("moves to the boundaries with Home and End", () => {
  assert.equal(navigate("Home", 2), 0);
  assert.equal(navigate("End", 1), 3);
});

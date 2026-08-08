import assert from "node:assert/strict";
import test from "node:test";
import { nextEventPickerOptionIndex } from "./eventPickerNavigation";

const navigate = (key: string, currentIndex: number) =>
  nextEventPickerOptionIndex({
    key,
    currentIndex,
    eventCount: 17,
    additionalCount: 2,
  });

test("enters the first additional ranking from every bottom edge of the grid", () => {
  for (const index of [12, 13, 14, 15, 16]) {
    assert.equal(navigate("ArrowDown", index), 17);
  }
});

test("moves vertically through additional rankings and back into the grid", () => {
  assert.equal(navigate("ArrowDown", 17), 18);
  assert.equal(navigate("ArrowUp", 18), 17);
  assert.equal(navigate("ArrowUp", 17), 16);
  assert.equal(navigate("ArrowLeft", 17), undefined);
  assert.equal(navigate("ArrowRight", 17), undefined);
});

test("preserves normal five-column grid navigation", () => {
  assert.equal(navigate("ArrowDown", 1), 6);
  assert.equal(navigate("ArrowUp", 6), 1);
  assert.equal(navigate("ArrowRight", 4), undefined);
  assert.equal(navigate("ArrowLeft", 5), undefined);
  assert.equal(navigate("Home", 18), 0);
  assert.equal(navigate("End", 0), 18);
});

test("moves from a leading option into the event grid", () => {
  const withLeadingOption = (key: string, currentIndex: number) =>
    nextEventPickerOptionIndex({
      key,
      currentIndex,
      leadingCount: 1,
      eventCount: 17,
      additionalCount: 0,
    });

  assert.equal(withLeadingOption("ArrowDown", 0), 1);
  assert.equal(withLeadingOption("ArrowUp", 1), 0);
  assert.equal(withLeadingOption("ArrowRight", 0), undefined);
  assert.equal(withLeadingOption("End", 0), 17);
});

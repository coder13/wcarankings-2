import assert from "node:assert/strict";
import test from "node:test";
import {
  motionSafeScrollBehavior,
  REDUCED_MOTION_QUERY,
} from "../lib/motion-preferences";

test("uses instant scrolling when reduced motion is preferred", () => {
  assert.equal(REDUCED_MOTION_QUERY, "(prefers-reduced-motion: reduce)");
  assert.equal(motionSafeScrollBehavior(true), "auto");
  assert.equal(motionSafeScrollBehavior(false), "smooth");
});

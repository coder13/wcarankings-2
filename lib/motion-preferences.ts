export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia(REDUCED_MOTION_QUERY).matches
  );
}

export function motionSafeScrollBehavior(
  reduceMotion = prefersReducedMotion(),
): ScrollBehavior {
  return reduceMotion ? "auto" : "smooth";
}

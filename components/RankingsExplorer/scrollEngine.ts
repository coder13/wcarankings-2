import { prefersReducedMotion } from "../../lib/motion-preferences.ts";

export const SCROLL_SETTLE_DELAY_MS = 100;
export const DEFAULT_ROW_HEIGHT = 65.45;
export const MIN_LOCAL_SCROLL_DURATION_MS = 320;
export const MAX_LOCAL_SCROLL_DURATION_MS = 640;
export const MAX_LOCAL_SCROLL_DISTANCE = 100;
export const DISTANT_SCROLL_DURATION_MS = 640;
export const MULTI_PAGE_SCROLL_DURATION_MS = 1200;
export const NORMAL_PREFETCH_ROWS = 12;

export function getPrefetchRowCount(downwardPixelsPerMs: number) {
  if (downwardPixelsPerMs >= 2) return 48;
  if (downwardPixelsPerMs >= 1) return 32;
  return NORMAL_PREFETCH_ROWS;
}

export function shouldPrefetchExtraPage({
  downwardPixelsPerMs,
  saveData = false,
  effectiveType = "",
}: {
  downwardPixelsPerMs: number;
  saveData?: boolean;
  effectiveType?: string;
}) {
  return (
    downwardPixelsPerMs >= 2 &&
    !saveData &&
    effectiveType !== "slow-2g" &&
    effectiveType !== "2g"
  );
}

export function shouldPrefetchNeighborPages({
  saveData = false,
  effectiveType = "",
}: {
  saveData?: boolean;
  effectiveType?: string;
}) {
  return !saveData && effectiveType !== "slow-2g" && effectiveType !== "2g";
}

export function getNeighborPageStarts({
  previousPageStart,
  nextPageStart,
  saveData,
  effectiveType,
}: {
  previousPageStart: number | null;
  nextPageStart: number | null;
  saveData?: boolean;
  effectiveType?: string;
}) {
  if (!shouldPrefetchNeighborPages({ saveData, effectiveType })) return [];
  return [previousPageStart, nextPageStart].filter((start): start is number => start !== null);
}

export function getNavigationWindowPageStarts(
  targetPageStart: number,
  direction: -1 | 1,
  pageSize: number,
  adjacentPageCount = 1,
) {
  return Array.from(
    { length: adjacentPageCount + 1 },
    (_, index) => targetPageStart + direction * index * pageSize,
  )
    .filter((pageStart) => pageStart >= 0)
    .sort((left, right) => left - right);
}

export type SearchJumpMode = "local" | "multi-page";

export function getSearchJumpMode(
  currentPageStart: number,
  targetPageStart: number,
  direction: -1 | 1,
  pageSize: number
): SearchJumpMode {
  const pageDelta = (targetPageStart - currentPageStart) / pageSize;
  if (Math.abs(pageDelta) <= 1 || Math.sign(pageDelta) !== direction)
    return "local";
  return "multi-page";
}

export function getSearchBridgePageStarts(
  currentPageStart: number,
  targetPageStart: number,
  direction: -1 | 1,
  pageSize: number
) {
  if (
    getSearchJumpMode(
      currentPageStart,
      targetPageStart,
      direction,
      pageSize
    ) === "local"
  )
    return [];
  const nextPageStart = currentPageStart + direction * pageSize;
  const pageBeforeTarget = targetPageStart - direction * pageSize;
  return nextPageStart === pageBeforeTarget
    ? [nextPageStart]
    : [nextPageStart, pageBeforeTarget];
}

export function getSearchAnimationDuration(
  mode: SearchJumpMode,
  peopleDistance: number
) {
  return mode === "multi-page"
    ? MULTI_PAGE_SCROLL_DURATION_MS
    : getScrollAnimationDuration(peopleDistance);
}

export function getScrollAnimationDuration(peopleDistance: number) {
  const distance = Math.abs(peopleDistance);
  if (distance > MAX_LOCAL_SCROLL_DISTANCE) return DISTANT_SCROLL_DURATION_MS;
  const localDistance = Math.max(1, distance);
  const localRange = MAX_LOCAL_SCROLL_DISTANCE - 1;
  const durationRange =
    MAX_LOCAL_SCROLL_DURATION_MS - MIN_LOCAL_SCROLL_DURATION_MS;
  const distanceProgress = (localDistance - 1) / localRange;
  return (
    MIN_LOCAL_SCROLL_DURATION_MS +
    Math.round(Math.sqrt(distanceProgress) * durationRange)
  );
}

export type ScrollAnimationState = {
  frame: number | null;
  active: boolean;
  programmatic: boolean;
  clearProgrammaticTimer: number | null;
  settleTimer: number | null;
};

export function cancelScrollAnimation(state: ScrollAnimationState) {
  if (state.frame !== null) window.cancelAnimationFrame(state.frame);
  if (state.clearProgrammaticTimer !== null)
    window.clearTimeout(state.clearProgrammaticTimer);
  if (state.settleTimer !== null) window.clearTimeout(state.settleTimer);
  state.frame = null;
  state.active = false;
  state.programmatic = false;
  state.clearProgrammaticTimer = null;
  state.settleTimer = null;
}

function finishProgrammaticScroll(
  state: ScrollAnimationState,
  onComplete?: () => void
) {
  state.active = false;
  state.frame = null;
  state.clearProgrammaticTimer = window.setTimeout(() => {
    state.programmatic = false;
    state.clearProgrammaticTimer = null;
    onComplete?.();
  }, 0);
}

function easeInOutCubic(progress: number) {
  return progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
}

export function animateScrollTo(
  state: ScrollAnimationState,
  targetTop: number,
  requestedBehavior: ScrollBehavior,
  durationMs = DISTANT_SCROLL_DURATION_MS,
  onComplete?: () => void
) {
  cancelScrollAnimation(state);
  state.programmatic = true;
  const reducedMotion = prefersReducedMotion();
  if (requestedBehavior !== "smooth" || reducedMotion) {
    window.scrollTo({ top: targetTop, behavior: "auto" });
    finishProgrammaticScroll(state, onComplete);
    return;
  }

  const distance = Math.abs(targetTop - window.scrollY);
  if (distance < 1) {
    finishProgrammaticScroll(state, onComplete);
    return;
  }

  const runSmoothScroll = () => {
    const startTop = window.scrollY;
    const signedDistance = targetTop - startTop;
    if (Math.abs(signedDistance) < 1) {
      finishProgrammaticScroll(state, onComplete);
      return;
    }
    const startedAt = performance.now();
    state.active = true;
    const animate = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / durationMs);
      const easedProgress = easeInOutCubic(progress);
      window.scrollTo({
        top: startTop + signedDistance * easedProgress,
        behavior: "auto",
      });
      if (progress < 1) state.frame = window.requestAnimationFrame(animate);
      else finishProgrammaticScroll(state, onComplete);
    };
    state.frame = window.requestAnimationFrame(animate);
  };

  runSmoothScroll();
}

export function scrollToEntry({
  state,
  list,
  index,
  alignment = "top",
  bottomOffset = 0,
  requestedBehavior = "smooth",
  schedule = true,
  requestedDuration = DISTANT_SCROLL_DURATION_MS,
  targetOffset,
  rowHeight = DEFAULT_ROW_HEIGHT,
  onComplete,
}: {
  state: ScrollAnimationState;
  list: HTMLDivElement | null;
  index: number;
  alignment?: "top" | "center" | "bottom";
  bottomOffset?: number;
  requestedBehavior?: ScrollBehavior;
  schedule?: boolean;
  requestedDuration?: number;
  targetOffset?: () => number | undefined;
  rowHeight?: number;
  onComplete?: () => void;
}) {
  const scroll = () => {
    const listTop = list?.getBoundingClientRect().top ?? 0;
    let viewportOffset = 0;
    if (alignment === "center") {
      viewportOffset = Math.max(0, (window.innerHeight - rowHeight) / 2);
    } else if (alignment === "bottom") {
      viewportOffset = Math.max(
        0,
        window.innerHeight - rowHeight - bottomOffset
      );
    }
    const fallbackRowTop =
      listTop +
      window.scrollY +
      Math.max(0, index) * rowHeight;
    const measuredTargetTop = targetOffset?.();
    const targetTop = Math.max(
      0,
      (measuredTargetTop ?? fallbackRowTop) - viewportOffset
    );
    animateScrollTo(
      state,
      targetTop,
      requestedBehavior,
      requestedDuration,
      onComplete
    );
  };
  if (schedule) {
    cancelScrollAnimation(state);
    state.programmatic = true;
    state.frame = window.requestAnimationFrame(() => {
      // Let a newly fetched page commit and update virtualizer measurements
      // before calculating the target offset. Without this second frame, the
      // first jump can use the previous page's layout; repeating the same
      // search then appears to fix it because the measurements are cached.
      state.frame = window.requestAnimationFrame(() => {
        state.frame = null;
        scroll();
      });
    });
  } else scroll();
}

export function getCurrentViewportPosition(
  list: HTMLDivElement | null,
  entries: Array<unknown>,
  startPosition: number,
  visibleIndex?: number,
  rowHeight = DEFAULT_ROW_HEIGHT
) {
  if (!list || entries.length === 0) return startPosition;
  const listTop = list.getBoundingClientRect().top;
  const index =
    visibleIndex ??
    Math.max(0, Math.min(entries.length - 1, Math.floor(-listTop / rowHeight)));
  return startPosition + index;
}

export function getCurrentViewportSubRank(
  list: HTMLElement | null,
  entries: Array<{ subRank: number }>,
  fallbackSubRank: number,
  rowHeight = DEFAULT_ROW_HEIGHT
) {
  if (!list || entries.length === 0) return fallbackSubRank;
  const listTop = list.getBoundingClientRect().top;
  const index = Math.max(
    0,
    Math.min(entries.length - 1, Math.floor(-listTop / rowHeight))
  );
  return entries[index]?.subRank ?? fallbackSubRank;
}

export function getEndSubRank(
  total: number,
  lastLoadedSubRank: number | null,
  visibleSubRank: number
) {
  if (Number.isFinite(total)) return Math.max(1, total);
  return lastLoadedSubRank ?? visibleSubRank;
}

export function clampTargetSubRank(
  targetSubRank: number,
  total: number,
  lastLoadedSubRank: number | null
) {
  const maximumSubRank = Number.isFinite(total)
    ? total
    : lastLoadedSubRank ?? targetSubRank;
  return Math.max(1, Math.min(targetSubRank, maximumSubRank));
}

export function getPagerJumpTarget(
  currentSubRank: number,
  direction: -1 | 1,
  total: number
) {
  if (direction === -1)
    return currentSubRank <= 5_000 ? 1 : currentSubRank - 5_000;
  if (Number.isFinite(total) && currentSubRank >= total - 5_000)
    return total;
  return currentSubRank + 5_000;
}

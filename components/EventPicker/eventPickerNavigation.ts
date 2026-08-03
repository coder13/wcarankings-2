const EVENT_GRID_COLUMNS = 5;

export function nextEventPickerOptionIndex({
  key,
  currentIndex,
  eventCount,
  additionalCount,
}: {
  key: string;
  currentIndex: number;
  eventCount: number;
  additionalCount: number;
}) {
  const totalCount = eventCount + additionalCount;
  if (totalCount === 0) return undefined;
  if (key === "Home") return 0;
  if (key === "End") return totalCount - 1;
  if (currentIndex < 0 || currentIndex >= totalCount) return undefined;

  if (currentIndex >= eventCount) {
    if (key === "ArrowDown" && currentIndex < totalCount - 1) {
      return currentIndex + 1;
    }
    if (key === "ArrowUp") {
      return currentIndex === eventCount
        ? Math.max(0, eventCount - 1)
        : currentIndex - 1;
    }
    return undefined;
  }

  if (key === "ArrowRight") {
    const nextIndex = currentIndex + 1;
    return currentIndex % EVENT_GRID_COLUMNS < EVENT_GRID_COLUMNS - 1 &&
      nextIndex < eventCount
      ? nextIndex
      : undefined;
  }
  if (key === "ArrowLeft") {
    return currentIndex % EVENT_GRID_COLUMNS > 0
      ? currentIndex - 1
      : undefined;
  }
  if (key === "ArrowUp") {
    const nextIndex = currentIndex - EVENT_GRID_COLUMNS;
    return nextIndex >= 0 ? nextIndex : undefined;
  }
  if (key === "ArrowDown") {
    const nextGridIndex = currentIndex + EVENT_GRID_COLUMNS;
    if (nextGridIndex < eventCount) return nextGridIndex;
    return additionalCount > 0 ? eventCount : undefined;
  }
  return undefined;
}

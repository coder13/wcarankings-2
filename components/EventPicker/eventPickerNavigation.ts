const EVENT_GRID_COLUMNS = 5;

export function nextEventPickerOptionIndex({
  key,
  currentIndex,
  leadingCount = 0,
  eventCount,
  additionalCount,
}: {
  key: string;
  currentIndex: number;
  leadingCount?: number;
  eventCount: number;
  additionalCount: number;
}) {
  const totalCount = leadingCount + eventCount + additionalCount;
  if (totalCount === 0) return undefined;
  if (key === "Home") return 0;
  if (key === "End") return totalCount - 1;
  if (currentIndex < 0 || currentIndex >= totalCount) return undefined;

  if (currentIndex < leadingCount) {
    if (key === "ArrowDown")
      return leadingCount < totalCount ? leadingCount : undefined;
    return undefined;
  }

  const eventStart = leadingCount;
  const additionalStart = eventStart + eventCount;
  if (currentIndex >= additionalStart) {
    if (key === "ArrowDown" && currentIndex < totalCount - 1) {
      return currentIndex + 1;
    }
    if (key === "ArrowUp") {
      return currentIndex === additionalStart
        ? Math.max(0, additionalStart - 1)
        : currentIndex - 1;
    }
    return undefined;
  }

  if (key === "ArrowRight") {
    const nextIndex = currentIndex + 1;
    return (currentIndex - eventStart) % EVENT_GRID_COLUMNS <
      EVENT_GRID_COLUMNS - 1 && nextIndex < additionalStart
      ? nextIndex
      : undefined;
  }
  if (key === "ArrowLeft") {
    return (currentIndex - eventStart) % EVENT_GRID_COLUMNS > 0
      ? currentIndex - 1
      : undefined;
  }
  if (key === "ArrowUp") {
    const nextIndex = currentIndex - EVENT_GRID_COLUMNS;
    if (nextIndex >= eventStart) return nextIndex;
    return leadingCount > 0 ? 0 : undefined;
  }
  if (key === "ArrowDown") {
    const nextGridIndex = currentIndex + EVENT_GRID_COLUMNS;
    if (nextGridIndex < additionalStart) return nextGridIndex;
    return additionalCount > 0 ? additionalStart : undefined;
  }
  return undefined;
}

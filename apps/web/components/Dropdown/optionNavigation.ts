export function nextVerticalOptionIndex({
  key,
  currentIndex,
  optionCount,
}: {
  key: string;
  currentIndex: number;
  optionCount: number;
}) {
  if (optionCount === 0) return undefined;
  if (key === "Home") return 0;
  if (key === "End") return optionCount - 1;
  if (currentIndex < 0 || currentIndex >= optionCount) return undefined;
  if (key === "ArrowDown" && currentIndex < optionCount - 1) {
    return currentIndex + 1;
  }
  if (key === "ArrowUp" && currentIndex > 0) return currentIndex - 1;
  return undefined;
}

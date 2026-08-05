export async function runPool<Item>(
  items: Item[],
  concurrency: number,
  task: (item: Item, index: number) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await task(items[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );
}

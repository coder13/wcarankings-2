#!/usr/bin/env node

export {};

function argument(name: string) {
  const prefix = `--${name}=`;
  return process.argv
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length);
}

const topRank = argument("top-rank");
if (topRank !== undefined) {
  const parsed = Number(topRank);
  if (!Number.isInteger(parsed) || parsed < 5) {
    throw new Error("--top-rank must be an integer of at least 5.");
  }
  process.env.FEED_TOP_SCAN_SIZE = String(parsed);
}

const { buildFeedItems } = await import("../services/feeds/stat-previews.ts");
const startedAt = performance.now();
const result = await buildFeedItems();
const elapsedMs = Math.round((performance.now() - startedAt) * 100) / 100;

console.log(
  JSON.stringify(
    {
      elapsedMs,
      topRank: Number(process.env.FEED_TOP_SCAN_SIZE ?? 10),
      ...result,
    },
    null,
    2,
  ),
);

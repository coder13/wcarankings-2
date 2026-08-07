#!/usr/bin/env node

export {};

function hasArgument(name: string) {
  return process.argv.includes(`--${name}`);
}

function argument(name: string) {
  const prefix = `--${name}=`;
  return process.argv
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length);
}

if (hasArgument("help")) {
  console.log(`Usage:
  pnpm run feed:generate
  pnpm run feed:generate -- --top-rank=25
  pnpm run feed:generate -- --benchmark-sor
  pnpm run benchmark:sor:as-of -- --cutoff=2026-07-30

Options:
  --top-rank=N  Include changed results through rank N. Minimum: 5.
  --benchmark-sor  Measure the current affected SoR lookup without writing rows.
  --help        Show this help text.

The command reads DATABASE_URL from .env.local, rebuilds feed_items, and
prints the export version, candidate count, write status, and elapsed time.`);
  process.exit(0);
}

if (hasArgument("benchmark-sor")) {
  const { benchmarkAffectedSorLookup } =
    await import("../services/feeds/sor-benchmark.ts");
  const result = await benchmarkAffectedSorLookup();
  console.log("Affected SoR lookup benchmark complete.");
  console.log(JSON.stringify(result, null, 2));
  console.log(
    "This measures the current materialized SoR lookup only. The current SoR table has no as-of date or year column, so historical seven-day and 2026 deltas are not calculated by this benchmark.",
  );
  process.exit(0);
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
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is required. Set it in .env.local or the environment.",
  );
}
const database = new URL(databaseUrl);
const startedAt = performance.now();
const result = await buildFeedItems();
const elapsedMs = Math.round((performance.now() - startedAt) * 100) / 100;

console.log("Feed generation complete.");
console.log(
  `Database: ${database.hostname}:${database.port || "3306"}${database.pathname}`,
);
console.log(`Top-rank limit: ${Number(process.env.FEED_TOP_SCAN_SIZE ?? 10)}`);
console.log(`Export version: ${result.exportVersion}`);
console.log(`Candidates: ${result.candidateCount}`);
console.log(`Rows written: ${result.written ? "yes" : "no"}`);
console.log(`Elapsed time: ${elapsedMs.toFixed(2)} ms`);
console.log(`Trigger query: ${result.details.triggerQueryMs.toFixed(2)} ms`);
console.log(`Result query: ${result.details.resultQueryMs.toFixed(2)} ms`);
console.log(`Recent competitions: ${result.details.triggerCount}`);
for (const competition of result.details.competitions) {
  console.log(
    `  ${competition.endDate} ${competition.name} (${competition.id}) events=${competition.eventIds.join(",") || "none"}`,
  );
}
console.log(`Recent result references: ${result.details.referenceCount}`);
console.log(`Inventory entries: ${result.details.inventoryCount}`);
console.log("Inventory by statistic:", result.details.inventoryByKind);
console.log("Inventory by event:", result.details.inventoryByEvent);
console.log("Candidates by statistic:", result.details.candidatesByKind);
console.log("Candidates by event:", result.details.candidatesByEvent);

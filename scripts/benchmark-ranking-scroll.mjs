#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const args = new Map(
  process.argv
    .slice(2)
    .filter((argument) => argument.startsWith("--"))
    .map((argument) => {
      const [key, ...value] = argument.slice(2).split("=");
      return [key, value.join("=") || "true"];
    }),
);

if (args.has("help") || args.has("h")) {
  console.log(`Usage: node scripts/benchmark-ranking-scroll.mjs [options]

Fetch each configured ranking scenario page-by-page, waiting between pages to
simulate fast scrolling.

Options:
  --target=URL          Base URL (default: http://localhost:3000)
  --pages=N             Pages per scenario (default: 20)
  --delay-ms=N          Delay between pages (default: 200)
  --limit=N             Rows per page (default: 50)
  --timeout-ms=N        Per-request timeout (default: 30000)
  --report-dir=PATH     Directory for versioned reports (default: benchmark-reports)
  --label=NAME          Label included in the versioned report filename
  --output=PATH         Exact JSON report path (overrides --report-dir and --label)
  --allow-remote=true   Required when target is not localhost
  --help                Show this help
`);
  process.exit(0);
}

const target = (args.get("target") ?? "http://localhost:3000").replace(/\/$/, "");
const pages = parsePositiveInteger(args.get("pages"), 20, "pages");
const delayMs = parsePositiveInteger(args.get("delay-ms"), 200, "delay-ms");
const limit = parsePositiveInteger(args.get("limit"), 50, "limit");
const timeoutMs = parsePositiveInteger(args.get("timeout-ms"), 30_000, "timeout-ms");
const label = args.get("label") === "true" ? "" : sanitizeFilenamePart(args.get("label") ?? "");
const runId = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const outputPath = resolve(
  args.get("output") ?? `${args.get("report-dir") ?? "benchmark-reports"}/ranking-scroll-${runId}${label ? `-${label}` : ""}.json`,
);

if (!/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/.test(target)
  && args.get("allow-remote") !== "true") {
  throw new Error("Remote targets require --allow-remote=true.");
}

function parsePositiveInteger(value, fallback, name) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`--${name} must be a positive integer.`);
  return parsed;
}

function sanitizeFilenamePart(value) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

function sleep(durationMs) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
}

function scenarioUrl(scenario, page, pageSize) {
  const params = new URLSearchParams({
    eventId: "333",
    result: scenario.resultType,
    start: String(page * pageSize),
    limit: String(pageSize),
  });
  if (scenario.endpoint === "person") {
    params.set("paged", "1");
    if (scenario.year !== undefined) params.set("year", String(scenario.year));
  }
  if (scenario.scope !== undefined) params.set("region", scenario.scope);
  for (const gender of scenario.genders ?? []) params.append("gender", gender);
  return `${target}${scenario.endpoint === "person" ? "/api/rankings" : "/api/rankings/results"}?${params}`;
}

function parseServerTiming(value) {
  if (!value) return {};
  return Object.fromEntries(
    value
      .split(",")
      .map((entry) => entry.trim().split(";dur="))
      .filter(([, duration]) => duration !== undefined)
      .map(([name, duration]) => [`timing_${name}`, Number(duration)]),
  );
}

function scenarioName(scenario) {
  const filters = [
    scenario.scope ?? "world",
    scenario.genders?.join("") || "all-genders",
    scenario.year ?? "all-years",
  ];
  return `${scenario.endpoint}-${scenario.resultType}-${filters.join("-")}`;
}

/** Fetch and summarize one ranking page for the scroll benchmark. */
async function fetchList(scenario, page, config) {
  const url = scenarioUrl(scenario, page, config.limit);
  const startedAt = performance.now();
  let response;
  let payload;
  let error;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(config.timeoutMs) });
    const text = await response.text();
    try {
      payload = JSON.parse(text);
    } catch {
      error = `non-JSON response: ${text.slice(0, 160)}`;
    }
  } catch (caught) {
    error = caught instanceof Error ? `${caught.name}: ${caught.message}` : String(caught);
  }

  const elapsedMs = performance.now() - startedAt;
  const entries = Array.isArray(payload?.entries) ? payload.entries : [];
  const result = {
    page: page + 1,
    requestedStart: page * config.limit,
    status: response?.status ?? 0,
    elapsedMs,
    rows: entries.length,
    total: Number(payload?.total ?? 0),
    firstRank: entries[0]?.rank ?? null,
    lastRank: entries.at(-1)?.rank ?? null,
    cache: response?.headers.get("x-rankings-cache") ?? "none",
    dataVersion: response?.headers.get("x-rankings-data-version") ?? "none",
    ...parseServerTiming(response?.headers.get("server-timing")),
    error,
  };
  console.log(
    `[${scenarioName(scenario)}] page=${result.page}/${config.pages}`
      + ` start=${result.requestedStart} status=${result.status}`
      + ` latency=${result.elapsedMs.toFixed(1)}ms rows=${result.rows}`
      + ` ranks=${result.firstRank ?? "-"}-${result.lastRank ?? "-"}`
      + ` total=${result.total} cache=${result.cache}`
      + (result.timing_db !== undefined ? ` db=${result.timing_db.toFixed(1)}ms` : "")
      + (result.error ? ` error=${result.error}` : ""),
  );
  return result;
}

const scenarios = [
  {
    endpoint: "person", resultType: "single", label: "precomputed person world single",
  },
  {
    endpoint: "person", resultType: "single", year: 2023, label: "precomputed person world single year",
  },
  {
    endpoint: "person", resultType: "single", scope: "Canada", label: "precomputed person country single",
  },
  {
    endpoint: "person", resultType: "single", scope: "China", label: "precomputed person China single",
  },
  {
    endpoint: "person", resultType: "single", scope: "USA", label: "precomputed person United States single",
  },
  {
    endpoint: "person", resultType: "single", genders: ["f"], label: "filtered person world women",
  },
  {
    endpoint: "person", resultType: "single", genders: ["f", "o"], label: "filtered person world female-other",
  },
  {
    endpoint: "person", resultType: "single", scope: "Canada", year: 2023, genders: ["f", "o"],
    label: "filtered person Canada female-other 2023",
  },
  {
    endpoint: "person", resultType: "single", scope: "China", year: 2023, genders: ["f", "o"],
    label: "filtered person China female-other 2023",
  },
  {
    endpoint: "person", resultType: "single", scope: "USA", year: 2023, genders: ["f", "o"],
    label: "filtered person United States female-other 2023",
  },
  {
    endpoint: "person", resultType: "single", scope: "_North America", year: 2023, genders: ["m", "f"],
    label: "filtered person North America male-female 2023",
  },
  {
    endpoint: "result", resultType: "single", label: "precomputed result world single",
  },
  {
    endpoint: "result", resultType: "average", label: "precomputed result world average",
  },
  {
    endpoint: "result", resultType: "single", year: 2023, label: "lazy result world single year",
  },
  {
    endpoint: "result", resultType: "single", scope: "Canada", label: "lazy result country single",
  },
  {
    endpoint: "result", resultType: "single", scope: "China", label: "lazy result China single",
  },
  {
    endpoint: "result", resultType: "single", scope: "USA", label: "lazy result United States single",
  },
  {
    endpoint: "result", resultType: "single", genders: ["f"], label: "lazy result world women",
  },
  {
    endpoint: "result", resultType: "average", genders: ["f"], label: "lazy result world women average",
  },
  {
    endpoint: "result", resultType: "single", genders: ["f", "o"], label: "lazy result world female-other",
  },
  {
    endpoint: "result", resultType: "average", scope: "Canada", year: 2023, genders: ["f", "o"],
    label: "lazy result Canada female-other average 2023",
  },
  {
    endpoint: "result", resultType: "average", scope: "China", year: 2023, genders: ["f", "o"],
    label: "lazy result China female-other average 2023",
  },
  {
    endpoint: "result", resultType: "average", scope: "USA", year: 2023, genders: ["f", "o"],
    label: "lazy result United States female-other average 2023",
  },
];

const report = {
  reportVersion: 2,
  runId,
  label: label || null,
  generatedAt: new Date().toISOString(),
  target,
  pagesPerScenario: pages,
  delayMs,
  limit,
  timeoutMs,
  completed: false,
  interrupted: false,
  scenarios: [],
};

async function writeReport() {
  await mkdir(resolve(outputPath, ".."), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
}

let stopping = false;
async function handleStopSignal(signal) {
  if (stopping) return;
  stopping = true;
  report.interrupted = true;
  report.interruptedAt = new Date().toISOString();
  report.stopSignal = signal;
  try {
    await writeReport();
    console.log(`\nBenchmark interrupted by ${signal}. Partial report written to ${outputPath}`);
  } finally {
    process.exit(signal === "SIGINT" ? 130 : 143);
  }
}

process.on("SIGINT", () => void handleStopSignal("SIGINT"));
process.on("SIGTERM", () => void handleStopSignal("SIGTERM"));

console.log(JSON.stringify({
  target,
  pages,
  delayMs,
  limit,
  timeoutMs,
  scenarios: scenarios.length,
  reportPath: outputPath,
}, null, 2));
await writeReport();

const allResults = [];
for (const scenario of scenarios) {
  const name = scenarioName(scenario);
  console.log(`\n=== START ${name}: ${scenario.label} ===`);
  const reportScenario = {
    name,
    label: scenario.label,
    filters: {
      endpoint: scenario.endpoint,
      resultType: scenario.resultType,
      scope: scenario.scope ?? "world",
      genders: scenario.genders ?? [],
      year: scenario.year ?? null,
    },
    status: "running",
    pageResults: [],
  };
  report.scenarios.push(reportScenario);
  await writeReport();

  const scenarioResults = [];
  for (let page = 0; page < pages; page += 1) {
    const pageResult = await fetchList(scenario, page, { pages, delayMs, limit, timeoutMs });
    scenarioResults.push(pageResult);
    reportScenario.pageResults.push(pageResult);
    await writeReport();
    if (page + 1 < pages) await sleep(delayMs);
  }
  const durations = scenarioResults.map(({ elapsedMs }) => elapsedMs);
  const failures = scenarioResults.filter(({ status, error }) => status !== 200 || error).length;
  const summary = {
    name,
    label: scenario.label,
    pages: scenarioResults.length,
    failures,
    avgMs: durations.reduce((sum, value) => sum + value, 0) / durations.length,
    p50Ms: percentile(durations, 0.5),
    p95Ms: percentile(durations, 0.95),
    maxMs: Math.max(...durations),
    firstPageMs: scenarioResults[0]?.elapsedMs ?? null,
    lastPageMs: scenarioResults.at(-1)?.elapsedMs ?? null,
    totalRows: scenarioResults.reduce((sum, result) => sum + result.rows, 0),
  };
  allResults.push(summary);
  Object.assign(reportScenario, summary, { status: failures ? "failed" : "complete" });
  await writeReport();
  console.log(`=== END ${name} ${JSON.stringify(summary)} ===`);
}

console.log("\n=== BENCHMARK SUMMARY ===");
for (const result of allResults) {
  console.log(
    `${result.name}\tavg=${result.avgMs.toFixed(1)}ms`
      + ` p50=${result.p50Ms.toFixed(1)}ms p95=${result.p95Ms.toFixed(1)}ms`
      + ` max=${result.maxMs.toFixed(1)}ms failures=${result.failures}`,
  );
}

report.completed = true;
report.finishedAt = new Date().toISOString();
report.failureCount = allResults.reduce((sum, result) => sum + result.failures, 0);
await writeReport();
console.log(`\nReport written to ${outputPath}`);
if (report.failureCount > 0) process.exitCode = 1;

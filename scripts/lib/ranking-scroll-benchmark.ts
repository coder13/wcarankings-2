import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type {
  BenchmarkConfig,
  BenchmarkReport,
  PageResult,
  RankingResponse,
  RankingScenario,
  ReportScenario,
  RunBenchmarkOptions,
  ScenarioSummary,
} from "./ranking-scroll-types.ts";

export function scenarioName(suite: string, scenario: RankingScenario): string {
  return `${scenario.suite ?? suite}-${scenario.id}`;
}

export function scenarioUrl(
  target: string,
  scenario: RankingScenario,
  page: number,
  pageSize: number,
): string {
  const params = new URLSearchParams();
  for (const [key, rawValue] of Object.entries(scenario.params)) {
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    for (const value of values) params.append(key, String(value));
  }
  params.set("start", String(page * pageSize + (scenario.startBase ?? 0)));
  params.set("limit", String(pageSize));
  return `${target.replace(/\/$/, "")}${scenario.path}?${params}`;
}

function benchmarkHelp(scriptName = "benchmark-ranking-scroll.ts") {
  return `Usage: node scripts/${scriptName} [options]

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
`;
}

function parseArgs(argv: string[]): Map<string, string> {
  return new Map(
    argv
      .filter((argument) => argument.startsWith("--"))
      .map((argument) => {
        const [key, ...value] = argument.slice(2).split("=");
        return [key, value.join("=") || "true"];
      }),
  );
}

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
  name: string,
): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1)
    throw new Error(`--${name} must be a positive integer.`);
  return parsed;
}

function sanitizeFilenamePart(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function sleep(durationMs: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, durationMs));
}

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return (
    sorted[
      Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)
    ] ?? 0
  );
}

function countValues(values: string[]): Record<string, number> {
  return Object.fromEntries(
    values.reduce((counts, value) => {
      counts.set(value, (counts.get(value) ?? 0) + 1);
      return counts;
    }, new Map()),
  );
}

function parseServerTiming(
  value: string | null | undefined,
): Partial<PageResult> {
  if (!value) return {};
  return Object.fromEntries(
    value
      .split(",")
      .map((entry) => entry.trim().split(";dur="))
      .filter(([, duration]) => duration !== undefined)
      .map(([name, duration]) => [`timing_${name}`, Number(duration)]),
  );
}

function rankingResponse(value: unknown): RankingResponse {
  if (typeof value !== "object" || value === null) return {};
  const response = value as { entries?: unknown; total?: unknown };
  return {
    entries: Array.isArray(response.entries)
      ? response.entries.filter(
          (entry): entry is { rank?: number; subRank?: number } =>
            typeof entry === "object" && entry !== null,
        )
      : undefined,
    total: typeof response.total === "number" ? response.total : undefined,
  };
}

async function fetchList(
  target: string,
  suite: string,
  scenario: RankingScenario,
  page: number,
  config: BenchmarkConfig,
): Promise<PageResult> {
  const url = scenarioUrl(target, scenario, page, config.limit);
  const startedAt = performance.now();
  let response;
  let payload: unknown;
  let error: string | undefined;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(config.timeoutMs),
    });
    const responseText = await response.text();
    try {
      payload = JSON.parse(responseText);
    } catch {
      error = `non-JSON response: ${responseText.slice(0, 160)}`;
    }
  } catch (caught) {
    error =
      caught instanceof Error
        ? `${caught.name}: ${caught.message}`
        : String(caught);
  }

  const elapsedMs = performance.now() - startedAt;
  const responsePayload = rankingResponse(payload);
  const entries = responsePayload.entries ?? [];
  const result: PageResult = {
    page: page + 1,
    requestedStart: page * config.limit + (scenario.startBase ?? 0),
    status: response?.status ?? 0,
    elapsedMs,
    rows: entries.length,
    total: Number(responsePayload.total ?? 0),
    firstRank: entries[0]?.rank ?? null,
    lastRank: entries.at(-1)?.rank ?? null,
    firstSubRank: entries[0]?.subRank ?? null,
    lastSubRank: entries.at(-1)?.subRank ?? null,
    memoryCache: response?.headers.get("x-rankings-memory-cache") ?? "none",
    listRankingCache: response?.headers.get("x-list-ranking-cache") ?? "none",
    dataVersion: response?.headers.get("x-rankings-data-version") ?? "none",
    ...parseServerTiming(response?.headers.get("server-timing")),
    error,
  };
  console.log(
    `[${scenarioName(suite, scenario)}] page=${result.page}/${config.pages}` +
      ` start=${result.requestedStart} status=${result.status}` +
      ` latency=${result.elapsedMs.toFixed(1)}ms rows=${result.rows}` +
      ` ranks=${result.firstRank ?? "-"}-${result.lastRank ?? "-"}` +
      ` subRanks=${result.firstSubRank ?? "-"}-${result.lastSubRank ?? "-"}` +
      ` total=${result.total}` +
      ` memoryCache=${result.memoryCache} listRankingCache=${result.listRankingCache}` +
      (result.timing_db !== undefined
        ? ` db=${result.timing_db.toFixed(1)}ms`
        : "") +
      (result.error ? ` error=${result.error}` : ""),
  );
  return result;
}

export async function runRankingScrollBenchmark({
  suite,
  scenarios,
  argv = process.argv.slice(2),
  scriptName,
}: RunBenchmarkOptions): Promise<void> {
  const args = parseArgs(argv);
  if (args.has("help") || args.has("h")) {
    console.log(benchmarkHelp(scriptName));
    return;
  }

  const target = (args.get("target") ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  const pages = parsePositiveInteger(args.get("pages"), 20, "pages");
  const delayMs = parsePositiveInteger(args.get("delay-ms"), 200, "delay-ms");
  const limit = parsePositiveInteger(args.get("limit"), 50, "limit");
  const timeoutMs = parsePositiveInteger(
    args.get("timeout-ms"),
    30_000,
    "timeout-ms",
  );
  const label =
    args.get("label") === "true"
      ? ""
      : sanitizeFilenamePart(args.get("label") || "");
  const runId = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
  const reportPrefix =
    suite === "all" ? "ranking-scroll" : `ranking-scroll-${suite}`;
  const outputPath = resolve(
    args.get("output") ??
      `${args.get("report-dir") ?? "benchmark-reports"}/${reportPrefix}-${runId}${label ? `-${label}` : ""}.json`,
  );

  if (
    !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/.test(
      target,
    ) &&
    args.get("allow-remote") !== "true"
  ) {
    throw new Error("Remote targets require --allow-remote=true.");
  }

  const report: BenchmarkReport = {
    reportVersion: 5,
    suite,
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
  async function handleStopSignal(signal: NodeJS.Signals): Promise<void> {
    if (stopping) return;
    stopping = true;
    report.interrupted = true;
    report.interruptedAt = new Date().toISOString();
    report.stopSignal = signal;
    try {
      await writeReport();
      console.log(
        `\nBenchmark interrupted by ${signal}. Partial report written to ${outputPath}`,
      );
    } finally {
      process.exit(signal === "SIGINT" ? 130 : 143);
    }
  }

  process.on("SIGINT", () => void handleStopSignal("SIGINT"));
  process.on("SIGTERM", () => void handleStopSignal("SIGTERM"));

  console.log(
    JSON.stringify(
      {
        suite,
        target,
        pages,
        delayMs,
        limit,
        timeoutMs,
        scenarios: scenarios.length,
        reportPath: outputPath,
      },
      null,
      2,
    ),
  );
  await writeReport();

  const allResults: ScenarioSummary[] = [];
  for (const scenario of scenarios) {
    const name = scenarioName(suite, scenario);
    console.log(`\n=== START ${name}: ${scenario.label} ===`);
    const reportScenario: ReportScenario = {
      id: scenario.id,
      name,
      label: scenario.label,
      path: scenario.path,
      params: scenario.params,
      status: "running",
      pageResults: [],
    };
    report.scenarios.push(reportScenario);
    await writeReport();

    const scenarioResults: PageResult[] = [];
    for (let page = 0; page < pages; page += 1) {
      const pageResult = await fetchList(target, suite, scenario, page, {
        pages,
        delayMs,
        limit,
        timeoutMs,
      });
      scenarioResults.push(pageResult);
      reportScenario.pageResults.push(pageResult);
      await writeReport();
      if (page + 1 < pages) await sleep(delayMs);
    }
    const durations = scenarioResults.map(({ elapsedMs }) => elapsedMs);
    const failures = scenarioResults.filter(
      ({ status, error }) => status !== 200 || error,
    ).length;
    const summary: ScenarioSummary = {
      name,
      label: scenario.label,
      pages: scenarioResults.length,
      failures,
      avgMs:
        durations.reduce((sum, value) => sum + value, 0) / durations.length,
      p50Ms: percentile(durations, 0.5),
      p95Ms: percentile(durations, 0.95),
      maxMs: Math.max(...durations),
      firstPageMs: scenarioResults[0]?.elapsedMs ?? null,
      lastPageMs: scenarioResults.at(-1)?.elapsedMs ?? null,
      totalRows: scenarioResults.reduce((sum, result) => sum + result.rows, 0),
      memoryCacheCounts: countValues(
        scenarioResults.map((result) => result.memoryCache),
      ),
      listRankingCacheCounts: countValues(
        scenarioResults.map((result) => result.listRankingCache),
      ),
    };
    allResults.push(summary);
    reportScenario.status = failures ? "failed" : "complete";
    reportScenario.summary = summary;
    await writeReport();
    console.log(`=== END ${name} ${JSON.stringify(summary)} ===`);
  }

  console.log("\n=== BENCHMARK SUMMARY ===");
  for (const result of allResults) {
    console.log(
      `${result.name}\tavg=${result.avgMs.toFixed(1)}ms` +
        ` p50=${result.p50Ms.toFixed(1)}ms p95=${result.p95Ms.toFixed(1)}ms` +
        ` max=${result.maxMs.toFixed(1)}ms failures=${result.failures}`,
    );
  }

  report.completed = true;
  report.finishedAt = new Date().toISOString();
  report.failureCount = allResults.reduce(
    (sum, result) => sum + result.failures,
    0,
  );
  await writeReport();
  console.log(`\nReport written to ${outputPath}`);
  if (report.failureCount > 0) process.exitCode = 1;
}

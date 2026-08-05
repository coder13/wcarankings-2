export type ScenarioParamValue = string | string[];

export interface RankingScenario {
  id: string;
  label: string;
  path: string;
  params: Record<string, ScenarioParamValue>;
  startBase?: number;
  suite?: string;
}

export interface BenchmarkConfig {
  pages: number;
  delayMs: number;
  limit: number;
  timeoutMs: number;
}

interface RankingEntry {
  rank?: number;
  subRank?: number;
}

export interface RankingResponse {
  entries?: RankingEntry[];
  total?: number;
}

export interface PageResult {
  page: number;
  requestedStart: number;
  status: number;
  elapsedMs: number;
  rows: number;
  total: number;
  firstRank: number | null;
  lastRank: number | null;
  firstSubRank: number | null;
  lastSubRank: number | null;
  memoryCache: string;
  listRankingCache: string;
  dataVersion: string;
  timing_db?: number;
  error?: string;
}

export interface RunBenchmarkOptions {
  suite: string;
  scenarios: RankingScenario[];
  argv?: string[];
  scriptName: string;
}

export interface ScenarioSummary {
  name: string;
  label: string;
  pages: number;
  failures: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  firstPageMs: number | null;
  lastPageMs: number | null;
  totalRows: number;
  memoryCacheCounts: Record<string, number>;
  listRankingCacheCounts: Record<string, number>;
}

export interface ReportScenario extends RankingScenario {
  name: string;
  status: "running" | "failed" | "complete";
  pageResults: PageResult[];
  summary?: ScenarioSummary;
}

export interface BenchmarkReport {
  reportVersion: number;
  suite: string;
  runId: string;
  label: string | null;
  generatedAt: string;
  target: string;
  pagesPerScenario: number;
  delayMs: number;
  limit: number;
  timeoutMs: number;
  completed: boolean;
  interrupted: boolean;
  interruptedAt?: string;
  stopSignal?: NodeJS.Signals;
  finishedAt?: string;
  failureCount?: number;
  scenarios: ReportScenario[];
}

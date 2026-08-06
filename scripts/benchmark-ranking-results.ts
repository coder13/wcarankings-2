#!/usr/bin/env node

import { runRankingScrollBenchmark } from "./lib/ranking-scroll-benchmark.ts";
import { RESULT_RANKING_SCENARIOS } from "./lib/ranking-scroll-scenarios.ts";

await runRankingScrollBenchmark({
  suite: "results",
  scenarios: RESULT_RANKING_SCENARIOS,
  scriptName: "benchmark-ranking-results.ts",
});

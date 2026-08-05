#!/usr/bin/env node

import { runRankingScrollBenchmark } from "./lib/ranking-scroll-benchmark.ts";
import { ALL_RANKING_SCROLL_SCENARIOS } from "./lib/ranking-scroll-scenarios.ts";

await runRankingScrollBenchmark({
  suite: "all",
  scenarios: ALL_RANKING_SCROLL_SCENARIOS,
  scriptName: "benchmark-ranking-scroll.ts",
});

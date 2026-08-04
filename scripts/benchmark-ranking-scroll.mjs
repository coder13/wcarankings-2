#!/usr/bin/env node

import { runRankingScrollBenchmark } from "./lib/ranking-scroll-benchmark.mjs";
import { ALL_RANKING_SCROLL_SCENARIOS } from "./lib/ranking-scroll-scenarios.mjs";

await runRankingScrollBenchmark({
  suite: "all",
  scenarios: ALL_RANKING_SCROLL_SCENARIOS,
  scriptName: "benchmark-ranking-scroll.mjs",
});

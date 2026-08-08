#!/usr/bin/env node

import { runRankingScrollBenchmark } from "./lib/ranking-scroll-benchmark.ts";
import { MEDAL_RANKING_SCENARIOS } from "./lib/ranking-scroll-scenarios.ts";

await runRankingScrollBenchmark({
  suite: "medals",
  scenarios: MEDAL_RANKING_SCENARIOS,
  scriptName: "benchmark-ranking-medals.ts",
});

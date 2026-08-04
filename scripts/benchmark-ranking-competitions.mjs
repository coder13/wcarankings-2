#!/usr/bin/env node

import { runRankingScrollBenchmark } from "./lib/ranking-scroll-benchmark.mjs";
import { COMPETITION_RANKING_SCENARIOS } from "./lib/ranking-scroll-scenarios.mjs";

await runRankingScrollBenchmark({
  suite: "competitions",
  scenarios: COMPETITION_RANKING_SCENARIOS,
  scriptName: "benchmark-ranking-competitions.mjs",
});

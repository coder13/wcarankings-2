#!/usr/bin/env node

import { runRankingScrollBenchmark } from "./lib/ranking-scroll-benchmark.ts";
import { PR_STREAK_RANKING_SCENARIOS } from "./lib/ranking-scroll-scenarios.ts";

await runRankingScrollBenchmark({
  suite: "pr-streak",
  scenarios: PR_STREAK_RANKING_SCENARIOS,
  scriptName: "benchmark-ranking-pr-streak.ts",
});

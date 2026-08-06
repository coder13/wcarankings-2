#!/usr/bin/env node

import { runRankingScrollBenchmark } from "./lib/ranking-scroll-benchmark.ts";
import { COUNTRY_RANKING_SCENARIOS } from "./lib/ranking-scroll-scenarios.ts";

await runRankingScrollBenchmark({
  suite: "countries",
  scenarios: COUNTRY_RANKING_SCENARIOS,
  scriptName: "benchmark-ranking-countries.ts",
});

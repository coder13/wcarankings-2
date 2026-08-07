#!/usr/bin/env node

import { runRankingScrollBenchmark } from "./lib/ranking-scroll-benchmark.ts";
import { CITY_RANKING_SCENARIOS } from "./lib/ranking-scroll-scenarios.ts";

await runRankingScrollBenchmark({
  suite: "cities",
  scenarios: CITY_RANKING_SCENARIOS,
  scriptName: "benchmark-ranking-cities.ts",
});

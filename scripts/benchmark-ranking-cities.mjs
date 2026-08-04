#!/usr/bin/env node

import { runRankingScrollBenchmark } from "./lib/ranking-scroll-benchmark.mjs";
import { CITY_RANKING_SCENARIOS } from "./lib/ranking-scroll-scenarios.mjs";

await runRankingScrollBenchmark({
  suite: "cities",
  scenarios: CITY_RANKING_SCENARIOS,
  scriptName: "benchmark-ranking-cities.mjs",
});

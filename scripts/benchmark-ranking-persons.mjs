#!/usr/bin/env node

import { runRankingScrollBenchmark } from "./lib/ranking-scroll-benchmark.mjs";
import { PERSON_RANKING_SCENARIOS } from "./lib/ranking-scroll-scenarios.mjs";

await runRankingScrollBenchmark({
  suite: "persons",
  scenarios: PERSON_RANKING_SCENARIOS,
  scriptName: "benchmark-ranking-persons.mjs",
});

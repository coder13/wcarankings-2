#!/usr/bin/env node

import { runRankingScrollBenchmark } from "./lib/ranking-scroll-benchmark.ts";
import { PERSON_RANKING_SCENARIOS } from "./lib/ranking-scroll-scenarios.ts";

await runRankingScrollBenchmark({
  suite: "persons",
  scenarios: PERSON_RANKING_SCENARIOS,
  scriptName: "benchmark-ranking-persons.ts",
});

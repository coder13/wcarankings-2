import { cityEventStatsJob } from "./cities/event-stats/definition.ts";
import { competitionEventStatsJob } from "./competitions/event-stats/definition.ts";
import { competitionPodiumMembersJob } from "./competitions/podium-members/definition.ts";
import { competitionStatsJob } from "./competitions/stats/definition.ts";
import { rankingTablesJob } from "./core/ranking-tables/definition.ts";
import { resultFactsJob } from "./core/result-facts/definition.ts";
import { personCompetitionRankingsJob } from "./people/competition-rankings/definition.ts";
import { personActivityRankingsJob } from "./people/activity-rankings/definition.ts";
import { personEventRankingsJobs } from "./people/event-rankings/definition.ts";
import { personMedalRankingsJob } from "./people/medal-rankings/definition.ts";
import { resultRankingsJobs } from "./people/result-rankings/definition.ts";
import { sumOfRanksJob } from "./people/sum-of-ranks/definition.ts";
import { personYearRankingsJob } from "./people/year-rankings/definition.ts";
import type { ProjectionJob } from "./types.ts";

export const MARIADB_COMPATIBILITY_VERSION = "11.8";
export const PROJECTION_ARTIFACT_FORMAT_VERSION = 4;

export const PROJECTION_JOBS: readonly ProjectionJob[] = [
  rankingTablesJob,
  resultFactsJob,
  sumOfRanksJob,
  competitionPodiumMembersJob,
  competitionEventStatsJob,
  competitionStatsJob,
  ...resultRankingsJobs,
  ...personEventRankingsJobs,
  personYearRankingsJob,
  personCompetitionRankingsJob,
  personActivityRankingsJob,
  personMedalRankingsJob,
  cityEventStatsJob,
] as const;

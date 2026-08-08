import type { Connection } from "mysql2/promise";
import type { ProjectionJob } from "./queue.ts";
import {
  handleCompetitionEventStats,
  handleCompetitionStats,
} from "./handlers/competition-stats.ts";
import { handleCityStats } from "./handlers/city-stats.ts";
import { handleCompetitionRankings } from "./handlers/competition-rankings.ts";
import { handleMedalScores } from "./handlers/medal-scores.ts";
import { handleMedalRankings } from "./handlers/medal-rankings.ts";
import { handlePersonStats } from "./handlers/person-stats.ts";
import { handlePersonStatRankings } from "./handlers/person-stat-rankings.ts";
import { handlePersonEventBests } from "./handlers/person-event-bests.ts";
import { handlePersonEventRankings } from "./handlers/person-event-rankings.ts";
import { handleResultRankings } from "./handlers/result-rankings.ts";
import { handleSumOfRanks } from "./handlers/sum-of-ranks.ts";
import { handleAllYearlyRankings } from "./handlers/yearly-rankings.ts";
import { supportsProjectionJob } from "./supported.ts";

export async function processProjectionJob(
  connection: Connection,
  job: ProjectionJob,
): Promise<void> {
  if (!supportsProjectionJob(job))
    throw new Error(`Unsupported projection job key: ${job.key}.`);
  if (job.key.startsWith("yearly-rankings:")) {
    await handleAllYearlyRankings(connection, job.payload);
    return;
  }
  if (job.key.startsWith("person-stats:")) {
    await handlePersonStats(connection, job.payload);
    return;
  }
  if (job.key.startsWith("person-stat-rankings:")) {
    await handlePersonStatRankings(connection, job.payload);
    return;
  }
  if (job.key.startsWith("person-event-bests:")) {
    await handlePersonEventBests(connection, job.payload);
    return;
  }
  if (job.key.startsWith("competition-rankings:")) {
    await handleCompetitionRankings(connection, job.payload);
    return;
  }
  if (job.key.startsWith("person-event-rankings:")) {
    await handlePersonEventRankings(connection, job.payload);
    return;
  }
  if (job.key.startsWith("result-rankings:")) {
    await handleResultRankings(connection, job.payload);
    return;
  }
  if (job.key.startsWith("sum-of-ranks:")) {
    await handleSumOfRanks(connection, {
      ...job.payload,
      sourceVersion: String(job.version),
    });
    return;
  }
  if (job.key.startsWith("medal-scores:")) {
    await handleMedalScores(connection, job.payload);
    return;
  }
  if (job.key.startsWith("medal-rankings:")) {
    await handleMedalRankings(connection, job.payload);
    return;
  }
  if (job.key.startsWith("competition-stats:")) {
    await handleCompetitionStats(connection, job.payload);
    return;
  }
  if (job.key.startsWith("competition-event-stats:")) {
    await handleCompetitionEventStats(connection, job.payload);
    return;
  }
  if (job.key.startsWith("city-stats:")) {
    await handleCityStats(connection, job.payload);
    return;
  }
  throw new Error(`Unsupported projection rebuild key: ${job.key}.`);
}

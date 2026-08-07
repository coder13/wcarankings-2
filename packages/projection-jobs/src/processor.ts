import type { Connection } from "mysql2/promise";
import type { ProjectionJob } from "./queue.ts";
import {
  handleCompetitionEventStats,
  handleCompetitionStats,
} from "./handlers/competition-stats.ts";
import { handlePersonStats } from "./handlers/person-stats.ts";
import { handlePersonEventRankings } from "./handlers/person-event-rankings.ts";
import { handleYearlyRankings } from "./handlers/yearly-rankings.ts";

export async function processProjectionJob(
  connection: Connection,
  job: ProjectionJob,
): Promise<void> {
  if (job.kind !== "projection-rebuild")
    throw new Error(`Unsupported projection job kind: ${job.kind}.`);
  if (job.key.startsWith("rankings:")) {
    await handleYearlyRankings(connection, job.payload);
    return;
  }
  if (job.key.startsWith("person-stats:")) {
    await handlePersonStats(connection, job.payload);
    return;
  }
  if (job.key.startsWith("person-event-bests:")) {
    await handlePersonEventRankings(connection, job.payload);
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
  throw new Error(`Unsupported projection rebuild key: ${job.key}.`);
}

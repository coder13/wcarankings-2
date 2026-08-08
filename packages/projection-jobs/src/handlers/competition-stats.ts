import type { Connection } from "mysql2/promise";
import {
  upsertProvisionalCompetitionEventStatsQuery,
  upsertProvisionalCompetitionStatsQuery,
} from "../queries/competition-stats.ts";
import { required } from "./shared.ts";

export async function handleCompetitionStats(
  connection: Connection,
  payload: Record<string, string>,
): Promise<void> {
  const query = upsertProvisionalCompetitionStatsQuery(
    required(payload.competitionId, "competitionId"),
  );
  await connection.query(query.sql, query.values);
}

export async function handleCompetitionEventStats(
  connection: Connection,
  payload: Record<string, string>,
): Promise<void> {
  const query = upsertProvisionalCompetitionEventStatsQuery({
    competitionId: required(payload.competitionId, "competitionId"),
    eventId: required(payload.eventId, "eventId"),
  });
  await connection.query(query.sql, query.values);
}

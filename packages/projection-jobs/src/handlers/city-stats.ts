import type { Connection } from "mysql2/promise";
import { upsertProvisionalCityEventStatsQuery } from "../queries/city-stats.ts";
import { required } from "./shared.ts";

export async function handleCityStats(
  connection: Connection,
  payload: Record<string, string>,
): Promise<void> {
  const query = upsertProvisionalCityEventStatsQuery({
    competitionId: required(payload.competitionId, "competitionId"),
    eventId: required(payload.eventId, "eventId"),
  });
  await connection.query(query.sql, query.values);
}

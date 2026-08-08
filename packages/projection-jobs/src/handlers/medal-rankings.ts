import type { Connection } from "mysql2/promise";
import {
  deleteMedalRankingSliceQuery,
  replaceMedalRankingSliceQuery,
} from "../queries/medal-rankings.ts";
import { required } from "./shared.ts";

export async function handleMedalRankings(
  connection: Connection,
  payload: Record<string, string>,
): Promise<void> {
  const input = {
    eventId: required(payload.eventId, "eventId"),
    scope: required(payload.scope, "scope"),
    regionId: payload.regionId,
  };
  if (input.regionId === undefined)
    throw new Error("Projection job is missing regionId.");
  const remove = deleteMedalRankingSliceQuery(input);
  const insert = replaceMedalRankingSliceQuery(input);
  await connection.beginTransaction();
  try {
    await connection.query(remove.sql, remove.values);
    await connection.query(insert.sql, insert.values);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

import type { Connection } from "mysql2/promise";
import {
  deleteProvisionalPersonEventRankingRowsQuery,
  type PersonEventResultType,
  upsertProvisionalPersonEventRankingSliceQuery,
} from "../queries/person-event-rankings.ts";
import { required } from "./shared.ts";

const isResultType = (value: string): value is PersonEventResultType =>
  value === "single" || value === "average";

export async function handlePersonEventRankings(
  connection: Connection,
  payload: Record<string, string>,
): Promise<void> {
  const eventId = required(payload.eventId, "eventId");
  const resultType = required(payload.resultType, "resultType");
  if (!isResultType(resultType))
    throw new Error(`Unsupported result type: ${resultType}.`);

  const remove = deleteProvisionalPersonEventRankingRowsQuery({
    eventId,
    resultType,
  });
  const upsert = upsertProvisionalPersonEventRankingSliceQuery({
    eventId,
    resultType,
  });
  await connection.beginTransaction();
  try {
    await connection.query(remove.sql, remove.values);
    await connection.query(upsert.sql, upsert.values);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

import type { Connection } from "mysql2/promise";
import {
  deleteStaleProvisionalResultRowsQuery,
  type ResultRankingGender,
  type ResultRankingScope,
  type ResultRankingType,
  upsertProvisionalResultRankingSliceQuery,
} from "../queries/result-rankings.ts";
import { required } from "./shared.ts";

const isGender = (value: string): value is ResultRankingGender =>
  ["all", "m", "f", "o"].includes(value);

const isResultType = (value: string): value is ResultRankingType =>
  value === "single" || value === "average";

const isScope = (value: string): value is ResultRankingScope =>
  ["world", "continent", "country"].includes(value);

export async function handleResultRankings(
  connection: Connection,
  payload: Record<string, string>,
): Promise<void> {
  const eventId = required(payload.eventId, "eventId");
  const gender = required(payload.gender, "gender");
  const periodYear = Number(required(payload.periodYear, "periodYear"));
  const resultType = required(payload.resultType, "resultType");
  const scope = required(payload.scope, "scope");
  const regionId = payload.regionId;
  if (!isGender(gender)) throw new Error(`Unsupported gender: ${gender}.`);
  if (!Number.isSafeInteger(periodYear) || periodYear < 0)
    throw new Error("Ranking period is invalid.");
  if (!isResultType(resultType))
    throw new Error(`Unsupported result type: ${resultType}.`);
  if (!isScope(scope)) throw new Error(`Unsupported ranking scope: ${scope}.`);
  if (scope !== "world" && !regionId)
    throw new Error(`A ${scope} result-ranking job needs regionId.`);

  const upsert = upsertProvisionalResultRankingSliceQuery({
    eventId,
    gender,
    periodYear,
    regionId,
    resultType,
    scope,
  });
  await connection.beginTransaction();
  try {
    if (scope === "world" && gender === "all") {
      const remove = deleteStaleProvisionalResultRowsQuery({
        eventId,
        periodYear,
        resultType,
      });
      await connection.query(remove.sql, remove.values);
    }
    await connection.query(upsert.sql, upsert.values);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

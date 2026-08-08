import type { Connection } from "mysql2/promise";
import {
  createAllYearlyRankingStageQuery,
  deleteYearlyRankingsQuery,
  dropYearlyRankingStageQuery,
  insertProvisionalYearlyScopeQuery,
  type YearlyResultType,
} from "../queries/yearly-rankings.ts";
import { required } from "./shared.ts";

const isYearlyResultType = (value: string): value is YearlyResultType =>
  value === "single" || value === "average";

export async function handleAllYearlyRankings(
  connection: Connection,
  payload: Record<string, string>,
): Promise<void> {
  const eventId = required(payload.eventId, "eventId");
  const resultType = required(payload.resultType, "resultType");
  const year = Number(required(payload.year, "year"));
  if (!isYearlyResultType(resultType))
    throw new Error(`Unsupported result type: ${resultType}.`);
  if (!Number.isSafeInteger(year))
    throw new Error("Projection year is invalid.");

  const build = createAllYearlyRankingStageQuery({
    eventId,
    resultType,
    year,
  });
  await connection.query(
    dropYearlyRankingStageQuery.sql,
    dropYearlyRankingStageQuery.values,
  );
  await connection.query(build.sql, build.values);
  await connection.beginTransaction();
  try {
    const remove = deleteYearlyRankingsQuery({ eventId, resultType, year });
    const insert = insertProvisionalYearlyScopeQuery(resultType);
    await connection.query(remove.sql, remove.values);
    await connection.query(insert.sql, insert.values);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

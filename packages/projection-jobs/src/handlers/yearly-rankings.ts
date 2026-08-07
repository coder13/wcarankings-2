import type { Connection, RowDataPacket } from "mysql2/promise";
import {
  countryByIsoQuery,
  countryCohortQuery,
  createYearlyRankingStageQuery,
  deleteProvisionalYearlyScopeQuery,
  dropYearlyRankingStageQuery,
  insertProvisionalYearlyScopeQuery,
  type YearlyResultType,
} from "../queries/yearly-rankings.ts";
import { queryOne, required } from "./shared.ts";

type CountryRow = RowDataPacket & { id: string };
type CohortRow = RowDataPacket & { cohort_id: number };

const isYearlyResultType = (value: string): value is YearlyResultType =>
  value === "single" || value === "average";

export async function handleYearlyRankings(
  connection: Connection,
  payload: Record<string, string>,
): Promise<void> {
  const eventId = required(payload.eventId, "eventId");
  const resultType = required(payload.resultType, "resultType");
  const countryIso2 = required(payload.region, "region");
  const year = Number(required(payload.year, "year"));
  if (!isYearlyResultType(resultType))
    throw new Error(`Unsupported result type: ${resultType}.`);
  if (!Number.isSafeInteger(year))
    throw new Error("Projection year is invalid.");
  const country = await queryOne<CountryRow>(connection, countryByIsoQuery, [
    countryIso2,
  ]);
  if (!country) throw new Error(`Unknown country ISO code: ${countryIso2}.`);
  const cohort = await queryOne<CohortRow>(connection, countryCohortQuery, [
    country.id,
  ]);
  const cohortId = Number(cohort?.cohort_id);
  if (!Number.isSafeInteger(cohortId))
    throw new Error(`No yearly cohort exists for country: ${country.id}.`);
  const build = createYearlyRankingStageQuery({
    countryId: country.id,
    cohortId,
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
    const remove = deleteProvisionalYearlyScopeQuery({
      cohortId,
      eventId,
      resultType,
      year,
    });
    const insert = insertProvisionalYearlyScopeQuery(resultType);
    await connection.query(remove.sql, remove.values);
    await connection.query(insert.sql, insert.values);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

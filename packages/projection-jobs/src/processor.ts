import type { Connection, RowDataPacket } from "mysql2/promise";
import type { Sql } from "sql-template-tag";
import type { ProjectionJob } from "./queue.ts";
import {
  countryByIsoQuery,
  countryCohortQuery,
  createYearlyRankingStageQuery,
  deleteProvisionalYearlyScopeQuery,
  dropYearlyRankingStageQuery,
  insertProvisionalYearlyScopeQuery,
  type YearlyResultType,
} from "./queries/yearly-rankings.ts";
import {
  deleteProvisionalPersonPeriodMetricsQuery,
  insertProvisionalPersonPeriodMetricsQuery,
} from "./queries/person-period-metrics.ts";

type CountryRow = RowDataPacket & { id: string };
type CohortRow = RowDataPacket & { cohort_id: number };
type YearlyRankingInput = {
  countryIso2: string;
  eventId: string;
  resultType: YearlyResultType;
  year: number;
};
type PersonStatsInput = { personId: string; year: number };

const required = (value: string | undefined, name: string): string => {
  if (!value) throw new Error(`Projection job is missing ${name}.`);
  return value;
};

const isYearlyResultType = (value: string): value is YearlyResultType =>
  value === "single" || value === "average";

const parseYearlyRankingInput = (
  payload: Record<string, string>,
): YearlyRankingInput => {
  const eventId = required(payload.eventId, "eventId");
  const resultType = required(payload.resultType, "resultType");
  const countryIso2 = required(payload.region, "region");
  const year = Number(required(payload.year, "year"));
  if (!isYearlyResultType(resultType))
    throw new Error(`Unsupported result type: ${resultType}.`);
  if (!Number.isSafeInteger(year))
    throw new Error("Projection year is invalid.");
  return { eventId, resultType, countryIso2, year };
};

const parsePersonStatsInput = (
  payload: Record<string, string>,
): PersonStatsInput => {
  const personId = required(payload.personId, "personId");
  const year = Number(required(payload.year, "year"));
  if (!Number.isSafeInteger(year))
    throw new Error("Projection year is invalid.");
  return { personId, year };
};

const queryOne = async <T extends RowDataPacket>(
  connection: Connection,
  query: Sql,
  values: readonly unknown[],
): Promise<T | undefined> => {
  const [rows] = await connection.query<T[]>(query.sql, [
    ...query.values,
    ...values,
  ]);
  return rows[0];
};

const rebuildCountryYearlyRanking = async (
  connection: Connection,
  payload: Record<string, string>,
): Promise<void> => {
  const input = parseYearlyRankingInput(payload);
  const country = await queryOne<CountryRow>(connection, countryByIsoQuery, [
    input.countryIso2,
  ]);
  if (!country)
    throw new Error(`Unknown country ISO code: ${input.countryIso2}.`);
  const cohort = await queryOne<CohortRow>(connection, countryCohortQuery, [
    country.id,
  ]);
  const cohortId = Number(cohort?.cohort_id);
  if (!Number.isSafeInteger(cohortId))
    throw new Error(`No yearly cohort exists for country: ${country.id}.`);
  const build = createYearlyRankingStageQuery({
    ...input,
    countryId: country.id,
    cohortId,
  });
  await connection.query(
    dropYearlyRankingStageQuery.sql,
    dropYearlyRankingStageQuery.values,
  );
  await connection.query(build.sql, build.values);
  await connection.beginTransaction();
  try {
    const remove = deleteProvisionalYearlyScopeQuery({ ...input, cohortId });
    const insert = insertProvisionalYearlyScopeQuery(input.resultType);
    await connection.query(remove.sql, remove.values);
    await connection.query(insert.sql, insert.values);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  }
};

const rebuildPersonPeriodMetrics = async (
  connection: Connection,
  payload: Record<string, string>,
): Promise<void> => {
  const input = parsePersonStatsInput(payload);
  const remove = deleteProvisionalPersonPeriodMetricsQuery(input);
  const insert = insertProvisionalPersonPeriodMetricsQuery(input);
  await connection.beginTransaction();
  try {
    await connection.query(remove.sql, remove.values);
    await connection.query(insert.sql, insert.values);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  }
};

export const processProjectionJob = async (
  connection: Connection,
  job: ProjectionJob,
): Promise<void> => {
  if (job.kind !== "projection-rebuild")
    throw new Error(`Unsupported projection job kind: ${job.kind}.`);
  if (job.key.startsWith("rankings:")) {
    await rebuildCountryYearlyRanking(connection, job.payload);
    return;
  }
  if (job.key.startsWith("person-stats:")) {
    await rebuildPersonPeriodMetrics(connection, job.payload);
    return;
  }
  throw new Error(`Unsupported projection rebuild key: ${job.key}.`);
};

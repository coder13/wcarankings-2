import type { Connection } from "mysql2/promise";
import {
  deletePersonStatRankingSliceQuery,
  insertProvisionalPersonStatRankingSliceQuery,
  type PersonStatRankingGender,
  type PersonStatRankingMetric,
  type PersonStatRankingScope,
} from "../queries/person-stat-rankings.ts";
import { required } from "./shared.ts";

const metrics: readonly PersonStatRankingMetric[] = [
  "country-count",
  "round-count",
  "solve-count",
];
const scopes: readonly PersonStatRankingScope[] = [
  "world",
  "continent",
  "country",
];
const genders: readonly PersonStatRankingGender[] = ["all", "m", "f", "o"];

function personStatRankingInput(payload: Record<string, string>) {
  const gender = required(payload.gender, "gender") as PersonStatRankingGender;
  const metric = required(payload.metric, "metric") as PersonStatRankingMetric;
  const periodYear = Number(required(payload.periodYear, "periodYear"));
  const regionId = payload.regionId;
  const scope = required(payload.scope, "scope") as PersonStatRankingScope;

  if (!metrics.includes(metric))
    throw new Error(`Unknown person statistic: ${metric}.`);
  if (!scopes.includes(scope))
    throw new Error(`Unknown ranking scope: ${scope}.`);
  if (!genders.includes(gender))
    throw new Error(`Unknown ranking gender: ${gender}.`);
  if (!Number.isSafeInteger(periodYear) || periodYear < 0)
    throw new Error("Projection period year is invalid.");
  if (regionId === undefined)
    throw new Error("Projection job is missing regionId.");
  if (scope === "world" && regionId)
    throw new Error("World rankings must use an empty regionId.");
  if (scope !== "world" && !regionId)
    throw new Error("Regional rankings require a regionId.");

  return { gender, metric, periodYear, regionId, scope };
}

export async function handlePersonStatRankings(
  connection: Connection,
  payload: Record<string, string>,
): Promise<void> {
  const input = personStatRankingInput(payload);
  const remove = deletePersonStatRankingSliceQuery(input);
  const insert = insertProvisionalPersonStatRankingSliceQuery(input);
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

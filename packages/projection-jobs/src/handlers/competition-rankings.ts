import type { Connection } from "mysql2/promise";
import {
  deleteCompetitionRankingSliceQuery,
  insertProvisionalCompetitionRankingSliceQuery,
  type CompetitionRankingGender,
  type CompetitionRankingScope,
} from "../queries/competition-rankings.ts";
import { required } from "./shared.ts";

const scopes: readonly CompetitionRankingScope[] = [
  "world",
  "continent",
  "country",
];
const genders: readonly CompetitionRankingGender[] = ["all", "m", "f", "o"];

function competitionRankingInput(payload: Record<string, string>) {
  const scope = required(payload.scope, "scope") as CompetitionRankingScope;
  const regionId = payload.regionId;
  const gender = required(payload.gender, "gender") as CompetitionRankingGender;
  if (!scopes.includes(scope))
    throw new Error(`Unknown ranking scope: ${scope}.`);
  if (!genders.includes(gender))
    throw new Error(`Unknown ranking gender: ${gender}.`);
  if (regionId === undefined)
    throw new Error("Projection job is missing regionId.");
  if (scope === "world" && regionId)
    throw new Error("World rankings use an empty regionId only.");
  if (scope !== "world" && !regionId)
    throw new Error("Regional rankings require a regionId.");
  return { gender, regionId, scope };
}

export async function handleCompetitionRankings(
  connection: Connection,
  payload: Record<string, string>,
): Promise<void> {
  const input = competitionRankingInput(payload);
  const remove = deleteCompetitionRankingSliceQuery(input);
  const insert = insertProvisionalCompetitionRankingSliceQuery(input);
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

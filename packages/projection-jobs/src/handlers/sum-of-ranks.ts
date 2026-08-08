import type { Connection } from "mysql2/promise";
import type { Sql } from "sql-template-tag";
import { enqueueProjectionJob } from "../queue.ts";
import {
  createSumOfRanksEventValuesQuery,
  createSumOfRanksKinchValuesQuery,
  createSumOfRanksPenaltiesQuery,
  deleteSumOfRanksScopeQuery,
  dropSumOfRanksStageQueries,
  indexSumOfRanksEventValuesQuery,
  indexSumOfRanksKinchValuesQuery,
  indexSumOfRanksPenaltiesQuery,
  insertProvisionalSumOfRanksScopeQuery,
  type SumOfRanksScope,
  type SumOfRanksScopeInput,
} from "../queries/sum-of-ranks.ts";
import { required } from "./shared.ts";

const isSumOfRanksScope = (value: string): value is SumOfRanksScope =>
  value === "continent" || value === "country";

async function runQuery(connection: Connection, query: Sql): Promise<void> {
  await connection.query(query.sql, [...query.values]);
}

async function dropStages(connection: Connection): Promise<void> {
  for (const query of dropSumOfRanksStageQueries)
    await runQuery(connection, query);
}

async function rebuildScope(
  connection: Connection,
  input: SumOfRanksScopeInput & { continentId: string },
): Promise<void> {
  await dropStages(connection);
  try {
    await runQuery(connection, createSumOfRanksEventValuesQuery(input));
    await runQuery(connection, indexSumOfRanksEventValuesQuery);
    await runQuery(connection, createSumOfRanksPenaltiesQuery);
    await runQuery(connection, indexSumOfRanksPenaltiesQuery);
    await runQuery(connection, createSumOfRanksKinchValuesQuery);
    await runQuery(connection, indexSumOfRanksKinchValuesQuery);

    const remove = deleteSumOfRanksScopeQuery(input);
    const insert = insertProvisionalSumOfRanksScopeQuery(input);
    await connection.beginTransaction();
    try {
      await runQuery(connection, remove);
      await runQuery(connection, insert);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  } finally {
    await dropStages(connection);
  }
}

const countryIdsFromPayload = (payload: Record<string, string>): string[] =>
  [...new Set((payload.countryIds ?? "").split(",").filter(Boolean))].sort();

export async function handleSumOfRanks(
  connection: Connection,
  payload: Record<string, string>,
): Promise<void> {
  const scope = required(payload.scope, "scope");
  const regionId = required(payload.regionId, "regionId");
  if (!isSumOfRanksScope(scope))
    throw new Error(`Unsupported Sum of Ranks scope: ${scope}.`);

  if (scope === "country") {
    await rebuildScope(connection, {
      scope,
      regionId,
      continentId: required(payload.continentId, "continentId"),
    });
    return;
  }

  const sourceVersion = Number(
    required(payload.sourceVersion, "sourceVersion"),
  );
  if (!Number.isSafeInteger(sourceVersion) || sourceVersion < 0)
    throw new Error("Sum of Ranks source version is invalid.");
  await rebuildScope(connection, { scope, regionId, continentId: regionId });
  for (const countryId of countryIdsFromPayload(payload))
    await enqueueProjectionJob({
      kind: "projection-rebuild",
      key: `sum-of-ranks:country:${countryId}`,
      version: sourceVersion,
      payload: {
        continentId: regionId,
        regionId: countryId,
        scope: "country",
      },
    });
}

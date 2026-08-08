import type { Connection } from "mysql2/promise";
import {
  deleteProvisionalPersonPeriodMetricsQuery,
  insertProvisionalPersonPeriodMetricsQuery,
} from "../queries/person-period-metrics.ts";
import { required } from "./shared.ts";

type PersonStatsInput = { personId: string; year: number };

function personIdsFromPayload(payload: Record<string, string>): string[] {
  const personIds = payload.personIds
    ? payload.personIds.split(",").filter(Boolean)
    : [required(payload.personId, "personId")];
  if (personIds.length === 0) throw new Error("Projection job has no people.");
  return [...new Set(personIds)];
}

function personStatsInput(payload: Record<string, string>): PersonStatsInput {
  const personId = required(payload.personId, "personId");
  const year = Number(required(payload.year, "year"));
  if (!Number.isSafeInteger(year))
    throw new Error("Projection year is invalid.");
  return { personId, year };
}

async function rebuildPersonPeriodMetrics(
  connection: Connection,
  payload: Record<string, string>,
): Promise<void> {
  const input = personStatsInput(payload);
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
}

export async function handlePersonStats(
  connection: Connection,
  payload: Record<string, string>,
): Promise<void> {
  const year = required(payload.year, "year");
  for (const personId of personIdsFromPayload(payload))
    await rebuildPersonPeriodMetrics(connection, { personId, year });
}

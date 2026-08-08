import type { Connection } from "mysql2/promise";
import {
  deletePersonMedalScoresQuery,
  insertPersonMedalScoresQuery,
} from "../queries/medal-scores.ts";
import { required } from "./shared.ts";

function personIdsFromPayload(payload: Record<string, string>): string[] {
  const personIds = required(payload.personIds, "personIds")
    .split(",")
    .filter(Boolean);
  return [...new Set(personIds)];
}

export async function handleMedalScores(
  connection: Connection,
  payload: Record<string, string>,
): Promise<void> {
  const year = Number(required(payload.year, "year"));
  if (!Number.isSafeInteger(year))
    throw new Error("Projection year is invalid.");
  for (const personId of personIdsFromPayload(payload)) {
    const remove = deletePersonMedalScoresQuery({ personId, year });
    const insert = insertPersonMedalScoresQuery({ personId, year });
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
}

import type { Connection } from "mysql2/promise";
import {
  deletePersonEventBestsQuery,
  insertPersonEventBestsQuery,
} from "../queries/person-event-bests.ts";
import { required } from "./shared.ts";

function personIdsFromPayload(payload: Record<string, string>): string[] {
  const personIds = payload.personIds
    ? payload.personIds.split(",").filter(Boolean)
    : [required(payload.personId, "personId")];
  if (personIds.length === 0) throw new Error("Projection job has no people.");
  return [...new Set(personIds)];
}

export async function handlePersonEventBests(
  connection: Connection,
  payload: Record<string, string>,
): Promise<void> {
  const year = Number(required(payload.year, "year"));
  if (!Number.isSafeInteger(year))
    throw new Error("Projection year is invalid.");

  for (const personId of personIdsFromPayload(payload)) {
    const remove = deletePersonEventBestsQuery({ personId, year });
    const insert = insertPersonEventBestsQuery({ personId, year });
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

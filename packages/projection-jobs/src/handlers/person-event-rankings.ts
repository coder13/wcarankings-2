import type { Connection, RowDataPacket } from "mysql2/promise";
import {
  affectedPersonEventIdsQuery,
  upsertProvisionalPersonEventRankingsQuery,
  type PersonEventResultType,
} from "../queries/person-event-rankings.ts";
import { required } from "./shared.ts";

type EventRow = RowDataPacket & { event_id: string };

function personIdsFromPayload(payload: Record<string, string>): string[] {
  const personIds = payload.personIds
    ? payload.personIds.split(",").filter(Boolean)
    : [required(payload.personId, "personId")];
  if (personIds.length === 0) throw new Error("Projection job has no people.");
  return [...new Set(personIds)];
}

export async function handlePersonEventRankings(
  connection: Connection,
  payload: Record<string, string>,
): Promise<void> {
  const personIds = personIdsFromPayload(payload);
  const eventQuery = affectedPersonEventIdsQuery(personIds);
  const [events] = await connection.query<EventRow[]>(
    eventQuery.sql,
    eventQuery.values,
  );
  for (const event of events)
    for (const resultType of ["single", "average"] as PersonEventResultType[]) {
      const query = upsertProvisionalPersonEventRankingsQuery({
        eventId: event.event_id,
        resultType,
      });
      await connection.query(query.sql, query.values);
    }
}

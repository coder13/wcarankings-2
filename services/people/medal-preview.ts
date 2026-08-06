import { query } from "@/db";
import { ApiInputError, parseEvent } from "@/lib/api/projection";

type MedalPreviewInput = {
  personId: string;
  eventId: string | null;
};

type MedalPreviewRow = {
  gold_count: number;
  silver_count: number;
  bronze_count: number;
};

export function parsePersonMedalPreviewInput(
  personId: string,
  params: URLSearchParams,
): MedalPreviewInput {
  const normalizedPersonId = personId.trim().toUpperCase();
  if (!/^\d{4}[A-Z]{4}\d{2}$/.test(normalizedPersonId)) {
    throw new ApiInputError("wcaId must be a valid WCA ID.");
  }
  return {
    personId: normalizedPersonId,
    eventId: parseEvent(params, { required: false }),
  };
}

export function personMedalPreviewQuery(eventId: string | null) {
  return `SELECT
      COALESCE(SUM(facts.position = 1), 0) AS gold_count,
      COALESCE(SUM(facts.position = 2), 0) AS silver_count,
      COALESCE(SUM(facts.position = 3), 0) AS bronze_count
    FROM result_facts facts
    WHERE facts.person_id = ?
      AND facts.is_final_round = 1
      AND facts.position BETWEEN 1 AND 3
      AND (facts.best > 0 OR facts.average > 0)${eventId === null ? "" : "\n      AND facts.event_id = ?"}`;
}

export async function loadPersonMedalPreview(
  personId: string,
  params: URLSearchParams,
) {
  const input = parsePersonMedalPreviewInput(personId, params);
  const result = await query<MedalPreviewRow>(
    personMedalPreviewQuery(input.eventId),
    input.eventId === null ? [input.personId] : [input.personId, input.eventId],
  );
  const counts = result.rows[0] ?? {
    gold_count: 0,
    silver_count: 0,
    bronze_count: 0,
  };
  const gold = Number(counts.gold_count);
  const silver = Number(counts.silver_count);
  const bronze = Number(counts.bronze_count);

  return {
    data: {
      counts: { gold, silver, bronze, total: gold + silver + bronze },
    },
    diagnostics: {
      timings: result.timings,
      queryCount: 1,
      returnedRows: result.rowCount,
    },
  };
}

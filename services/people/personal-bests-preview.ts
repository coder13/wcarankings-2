import { query } from "@/db";
import { ApiInputError } from "@/lib/api/projection";
import { WCA_EVENTS, type RankingType } from "@/lib/wca";

export type PersonalBestPreview = {
  eventId: string;
  single?: PersonalBestPreviewResult;
  average?: PersonalBestPreviewResult;
};

export type PersonalBestPreviewResult = {
  value: number;
  ranks: readonly PersonalBestPreviewRank[];
};

export type PersonalBestPreviewRank = {
  scope: "WR" | "CR" | "NR";
  value: number;
};

type PersonalBestPreviewRow = {
  event_id: string;
  result_type: RankingType;
  result_value: number;
  world_rank: number;
  continent_rank: number;
  country_rank: number;
};

const WCA_ID_PATTERN = /^\d{4}[A-Z]{4}\d{2}$/;

export function parsePersonalBestsPreviewPersonId(personId: string) {
  const normalized = personId.trim().toUpperCase();
  if (!WCA_ID_PATTERN.test(normalized)) {
    throw new ApiInputError("wcaId must be a valid WCA ID.");
  }
  return normalized;
}

export function personalBestsPreviewQuery() {
  return `SELECT event_id, result_type, result_value,
      world_rank, continent_rank, country_rank
    FROM person_event_rankings
    WHERE person_id = ?`;
}

function toResult(row: PersonalBestPreviewRow): PersonalBestPreviewResult {
  return {
    value: Number(row.result_value),
    ranks: [
      { scope: "WR", value: Number(row.world_rank) },
      { scope: "CR", value: Number(row.continent_rank) },
      { scope: "NR", value: Number(row.country_rank) },
    ],
  };
}

export function mapPersonalBestsPreviewRows(
  rows: readonly PersonalBestPreviewRow[],
) {
  const byEvent = new Map<string, PersonalBestPreview>();
  for (const row of rows) {
    const entry = byEvent.get(row.event_id) ?? { eventId: row.event_id };
    entry[row.result_type] = toResult(row);
    byEvent.set(row.event_id, entry);
  }
  return WCA_EVENTS.flatMap((event) => {
    const entry = byEvent.get(event.id);
    return entry ? [entry] : [];
  });
}

export async function loadPersonalBestsPreview(personId: string) {
  const normalizedPersonId = parsePersonalBestsPreviewPersonId(personId);
  const result = await query<PersonalBestPreviewRow>(
    personalBestsPreviewQuery(),
    [normalizedPersonId],
  );

  return {
    data: { entries: mapPersonalBestsPreviewRows(result.rows) },
    diagnostics: {
      timings: result.timings,
      queryCount: 1,
      returnedRows: result.rowCount,
    },
  };
}

import { query as defaultQuery } from "@/db";
import type { GenderFilter } from "@/lib/wca";
import type { FeedInventoryStat } from "./inventory";
import type { RecentResultReference } from "./recent-changes";
import type { FeedInterestingResult } from "./stat-previews";

type FeedQuery = (
  text: string,
  values?: unknown[],
) => Promise<{ rows: Record<string, unknown>[] }>;

type CandidateRow = {
  event_id: string;
  person_id: string;
  result_id?: number | string | null;
  gender?: string | null;
  country_id: string | null;
  continent_id: string | null;
  competition_id?: string | null;
  world_position?: number | string | null;
  continent_position?: number | string | null;
  country_position?: number | string | null;
  world_sub_rank?: number | string | null;
  continent_sub_rank?: number | string | null;
  country_sub_rank?: number | string | null;
};

function placeholders(count: number) {
  return Array.from({ length: count }, () => "?").join(", ");
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isTopTen(row: CandidateRow) {
  return [
    row.world_position,
    row.continent_position,
    row.country_position,
    row.world_sub_rank,
    row.continent_sub_rank,
    row.country_sub_rank,
  ].some((value) => (number(value) ?? Infinity) <= 10);
}

function rowGender(row: CandidateRow, reference: RecentResultReference) {
  return row.gender === "m" || row.gender === "f" || row.gender === "o"
    ? row.gender
    : reference.gender;
}

function candidate(
  inventory: ReadonlyMap<string, FeedInventoryStat>,
  input: {
    kind: "person" | "result";
    resultType: "single" | "average";
    year: 2026 | null;
    scope: "world" | "continent" | "country";
    regionId: string;
    gender: GenderFilter | null;
    reference: RecentResultReference;
  },
) {
  const id = `${input.kind}-${input.reference.eventId}-${input.resultType}-${input.scope}-${input.regionId || "world"}-${input.gender ?? "all"}-${input.year ?? "all"}`;
  const source = inventory.get(id);
  if (!source) return null;
  return {
    ...source,
    interestingEntityId:
      input.kind === "result"
        ? String(input.reference.resultId)
        : input.reference.personId,
    interestingResultId: input.reference.resultId,
  } satisfies FeedInterestingResult;
}

function addRowCandidates(
  output: Map<string, FeedInterestingResult>,
  inventory: ReadonlyMap<string, FeedInventoryStat>,
  row: CandidateRow,
  reference: RecentResultReference,
  resultType: "single" | "average",
  year: 2026 | null,
  kind: "person" | "result",
) {
  if (!isTopTen(row)) return;
  const gender = rowGender(row, reference);
  const regions = [
    ["world", ""],
    ["continent", row.continent_id ?? reference.continentId],
    ["country", row.country_id ?? reference.countryId],
  ] as const;
  for (const [scope, regionId] of regions) {
    if (scope !== "world" && !regionId) continue;
    for (const selectedGender of [null, gender]) {
      const item = candidate(inventory, {
        kind,
        resultType,
        year,
        scope,
        regionId,
        gender: selectedGender,
        reference,
      });
      if (item) output.set(`${item.id}:${item.interestingEntityId}`, item);
    }
  }
}

async function groupedResultRows(
  query: FeedQuery,
  references: readonly RecentResultReference[],
  resultType: "single" | "average",
) {
  const table = `result_rankings_${resultType}`;
  const resultIds = references.map((reference) => reference.resultId);
  if (!resultIds.length) return [];
  const result = await query(
    `SELECT result_id, event_id, person_id, gender, country_id, continent_id,
       competition_id, world_position, continent_position, country_position
     FROM ${table}
     WHERE result_id IN (${placeholders(resultIds.length)})
       AND (world_position <= 10 OR continent_position <= 10 OR country_position <= 10)`,
    resultIds,
  );
  return result.rows as unknown as CandidateRow[];
}

async function groupedPersonRows(
  query: FeedQuery,
  references: readonly RecentResultReference[],
  resultType: "single" | "average",
) {
  const people = [
    ...new Set(references.map((reference) => reference.personId)),
  ];
  const competitions = [
    ...new Set(references.map((reference) => reference.competitionId)),
  ];
  if (!people.length || !competitions.length) return [];
  const result = await query(
    `SELECT ranking.event_id, ranking.person_id, person.gender,
       ranking.country_id, ranking.continent_id, ranking.competition_id,
       ranking.world_sub_rank, ranking.continent_sub_rank, ranking.country_sub_rank
     FROM ranking_entries_${resultType} ranking
     LEFT JOIN persons person ON person.wca_id = ranking.person_id AND person.sub_id = 1
     WHERE ranking.person_id IN (${placeholders(people.length)})
       AND ranking.competition_id IN (${placeholders(competitions.length)})
       AND (ranking.world_sub_rank <= 10 OR ranking.continent_sub_rank <= 10 OR ranking.country_sub_rank <= 10)`,
    [...people, ...competitions],
  );
  return result.rows as unknown as CandidateRow[];
}

async function groupedCurrentYearPersonRows(
  query: FeedQuery,
  references: readonly RecentResultReference[],
  resultType: "single" | "average",
) {
  const resultIds = references.map((reference) => reference.resultId);
  if (!resultIds.length) return [];
  const result = await query(
    `SELECT ranking.event_id, ranking.person_id, ranking.result_id,
       person.gender, facts.person_country_id AS country_id,
       country.continent_id, facts.competition_id,
       ranking.position AS world_sub_rank
     FROM person_year_rankings_${resultType} ranking
     INNER JOIN result_facts facts ON facts.result_id = ranking.result_id
     LEFT JOIN persons person ON person.wca_id = ranking.person_id AND person.sub_id = 1
     LEFT JOIN countries country ON country.id = facts.person_country_id
     WHERE ranking.year = 2026
       AND ranking.result_id IN (${placeholders(resultIds.length)})
       AND ranking.position <= 10`,
    resultIds,
  );
  return result.rows as unknown as CandidateRow[];
}

export async function generateBatchedFeedCandidates({
  references,
  inventory,
  query = defaultQuery,
}: {
  references: readonly RecentResultReference[];
  inventory: readonly FeedInventoryStat[];
  query?: FeedQuery;
}) {
  const inventoryMap = new Map(inventory.map((source) => [source.id, source]));
  const referenceByResult = new Map(
    references.map((reference) => [reference.resultId, reference]),
  );
  const output = new Map<string, FeedInterestingResult>();
  for (const resultType of ["single", "average"] as const) {
    const [resultRows, personRows, currentYearRows] = await Promise.all([
      groupedResultRows(query, references, resultType),
      groupedPersonRows(query, references, resultType),
      groupedCurrentYearPersonRows(query, references, resultType),
    ]);
    for (const row of resultRows) {
      const reference = referenceByResult.get(Number(row.result_id));
      if (reference)
        addRowCandidates(
          output,
          inventoryMap,
          row,
          reference,
          resultType,
          null,
          "result",
        );
    }
    for (const row of personRows) {
      const reference = references.find(
        (candidate) =>
          candidate.personId === row.person_id &&
          candidate.competitionId === row.competition_id,
      );
      if (reference)
        addRowCandidates(
          output,
          inventoryMap,
          row,
          reference,
          resultType,
          null,
          "person",
        );
    }
    for (const row of currentYearRows) {
      const reference = referenceByResult.get(Number(row.result_id));
      if (reference)
        addRowCandidates(
          output,
          inventoryMap,
          row,
          reference,
          resultType,
          2026,
          "person",
        );
    }
  }
  return [...output.values()];
}

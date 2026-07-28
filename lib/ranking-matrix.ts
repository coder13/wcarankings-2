import { query } from "@/db";
import { WCA_EVENTS, type RankingType, type RegionScope } from "@/lib/wca";
import type { RankingView } from "@/lib/ranking-views";

export type MatrixEventValue = {
  rank: number;
  kinch: number | null;
};

export type MatrixEntry = {
  rank: number;
  personId: string;
  personName: string;
  countryName: string;
  countryIso2: string;
  overall: number;
  coverage: number;
  eventValues: Record<string, MatrixEventValue>;
};

export type MatrixPage = {
  entries: MatrixEntry[];
  total: number;
  fetchedAt: string | null;
  supportedEventIds: string[];
  coveragePolicy: string;
};

export type MatrixSourceRow = {
  event_id: string;
  person_id: string;
  person_name: string;
  country_name: string;
  country_iso2: string;
  rank: number;
  best: number;
  reference_best: number | null;
};

const ALL_EVENT_IDS = WCA_EVENTS.map((event) => event.id);
// WCA does not define an Average result for Multi-Blind. Kinch also leaves it
// out until its higher-is-better encoding gets a dedicated formula.
export function getSupportedMatrixEventIds(view: Exclude<RankingView, "wca">, type: RankingType) {
  if (view === "kinch") return ALL_EVENT_IDS.filter((id) => id !== "333mbf");
  return type === "average"
    ? ALL_EVENT_IDS.filter((id) => id !== "333mbf")
    : ALL_EVENT_IDS;
}

function projectionTable(type: RankingType) {
  return type === "average" ? "ranking_entries_average" : "ranking_entries_single";
}

function rankColumn(scope: RegionScope) {
  if (scope === "continent") return "continent_rank";
  if (scope === "country") return "country_rank";
  return "world_rank";
}

function regionClause(scope: RegionScope) {
  if (scope === "continent") return "continent_id = ?";
  if (scope === "country") return "country_id = ?";
  return "1 = 1";
}

function competitionRanks(entries: MatrixEntry[]) {
  let previous = Number.NaN;
  let rank = 0;
  return entries.map((entry, index) => {
    if (entry.overall !== previous) rank = index + 1;
    previous = entry.overall;
    return { ...entry, rank };
  });
}

export function buildMatrixEntries({
  view,
  eventIds,
  rows,
  search,
}: {
  view: Exclude<RankingView, "wca">;
  eventIds: string[];
  rows: MatrixSourceRow[];
  search: string;
}) {
  const people = new Map<string, Omit<MatrixEntry, "rank" | "overall"> & { total: number }>();
  for (const row of rows) {
    let person = people.get(row.person_id);
    if (!person) {
      person = {
        personId: row.person_id,
        personName: row.person_name,
        countryName: row.country_name,
        countryIso2: row.country_iso2,
        coverage: 0,
        total: 0,
        eventValues: {},
      };
      people.set(row.person_id, person);
    }
    const kinch = view === "kinch"
      ? Number(row.reference_best ?? row.best) / row.best * 100
      : null;
    person.coverage += 1;
    person.total += view === "kinch" ? kinch ?? 0 : Number(row.rank);
    person.eventValues[row.event_id] = { rank: Number(row.rank), kinch };
  }

  const normalizedSearch = search.trim().toLocaleLowerCase();
  const entries = [...people.values()]
    .map((person) => ({
      ...person,
      overall: view === "kinch" ? person.total / eventIds.length : person.total,
    }))
    .filter((person) => !normalizedSearch ||
      person.personName.toLocaleLowerCase().includes(normalizedSearch) ||
      person.personId.toLocaleLowerCase().includes(normalizedSearch))
    .sort((left, right) =>
      (view === "kinch" ? right.overall - left.overall : left.overall - right.overall) ||
      left.personName.localeCompare(right.personName) ||
      left.personId.localeCompare(right.personId),
    );
  return competitionRanks(entries);
}

/**
 * Builds the two all-events rankings from the same per-event materialized
 * projections as the normal explorer. A person must have a ranked result for
 * every supported event, so a missing result can never lower a total or make
 * an incomplete Kinch score look comparable to a complete one.
 */
export async function loadRankingMatrix({
  view,
  type,
  scope,
  regionId,
  search,
}: {
  view: Exclude<RankingView, "wca">;
  type: RankingType;
  scope: RegionScope;
  regionId: string;
  search: string;
}): Promise<MatrixPage> {
  const eventIds = getSupportedMatrixEventIds(view, type);
  const placeholders = eventIds.map(() => "?").join(", ");
  const table = projectionTable(type);
  const selectedRankColumn = rankColumn(scope);
  const regionFilter = regionClause(scope);
  const values = [
    ...eventIds,
    ...(scope === "world" ? [] : [regionId]),
    eventIds.length,
  ];

  const result = await query<MatrixSourceRow>(
    `WITH scoped AS (
      SELECT event_id, person_id, person_name, country_name, country_iso2,
        ${selectedRankColumn} AS rank, best
      FROM ${table}
      WHERE event_id IN (${placeholders})
        AND ${selectedRankColumn} > 0
        AND ${regionFilter}
    ), complete_people AS (
      SELECT person_id
      FROM scoped
      GROUP BY person_id
      HAVING COUNT(DISTINCT event_id) = ?
    ), event_references AS (
      SELECT event_id, MIN(best) AS reference_best
      FROM scoped
      GROUP BY event_id
    )
    SELECT scoped.*, event_references.reference_best
    FROM scoped
    INNER JOIN complete_people ON complete_people.person_id = scoped.person_id
    INNER JOIN event_references ON event_references.event_id = scoped.event_id`,
    values,
  );
  const metadataResult = await query<{ key: string; value: string }>(
    "SELECT `key`, value FROM export_metadata WHERE `key` IN ('export_date', 'fetched_at')",
  );
  const metadata = new Map(metadataResult.rows.map((row) => [row.key, row.value]));
  const entries = buildMatrixEntries({ view, eventIds, rows: result.rows, search });

  return {
    entries,
    total: entries.length,
    fetchedAt: metadata.get("fetched_at") ?? metadata.get("export_date") ?? null,
    supportedEventIds: eventIds,
    coveragePolicy: `Ranked in all ${eventIds.length} supported events`,
  };
}

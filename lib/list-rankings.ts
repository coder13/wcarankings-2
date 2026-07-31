import { query } from "@/db";
import { getCurrentRankingsMetadata } from "@/lib/rankings-metadata";
import {
  getRecordBadges,
  isEventId,
  isRankingType,
  normalizeGenderFilters,
  parseRegionQuery,
  type GenderFilter,
  type RankingType,
} from "@/lib/wca";
import type { ListSummary } from "@/lib/lists";

type ListRankingRow = {
  rank: number;
  sub_rank: number;
  total: number;
  person_id: string;
  person_name: string;
  country_id: string;
  country_name: string;
  country_iso2: string;
  continent_id: string;
  best: number;
  competition_id: string;
  competition_name: string;
  is_world_record: number;
  is_continent_record: number;
  is_country_record: number;
};

function rankingTable(type: RankingType) {
  return type === "average"
    ? "ranking_entries_average"
    : "ranking_entries_single";
}

export function parseListRankingInput(searchParams: URLSearchParams) {
  const rawEventId = searchParams.get("eventId") ?? searchParams.get("event");
  const eventId = isEventId(rawEventId) ? rawEventId : "333";
  const rawType = searchParams.get("result") ?? searchParams.get("type");
  let type: RankingType = "single";
  if (eventId !== "333mbf" && isRankingType(rawType)) type = rawType;
  const rawStart = Number(searchParams.get("start"));
  const start = Number.isFinite(rawStart) ? Math.max(0, Math.floor(rawStart)) : 0;
  const pageLimit = Math.max(
    1,
    Math.min(100, Math.floor(Number(searchParams.get("limit")) || 50)),
  );
  const search = (searchParams.get("search") ?? "").trim().slice(0, 80);
  const locate = (searchParams.get("locate") ?? "").trim().toUpperCase();
  const searchLimit = Math.max(
    1,
    Math.min(500, Math.floor(Number(searchParams.get("searchLimit")) || 50)),
  );
  const limit = search && !locate ? searchLimit : pageLimit;
  const region = parseRegionQuery(searchParams.get("region"));
  const gender = normalizeGenderFilters(
    searchParams.getAll("gender")
      .flatMap((value) => value.split(","))
      .filter((value): value is GenderFilter => value === "m" || value === "f" || value === "o"),
  );
  return { eventId, type, start, limit, search, locate, region, gender };
}

type ScopedRankingSource = {
  from: (rankingTable: string) => string;
  conditions: string[];
  values: unknown[];
};

async function loadScopedRankings(
  scopedSource: ScopedRankingSource,
  searchParams: URLSearchParams,
) {
  const input = parseListRankingInput(searchParams);
  const source = rankingTable(input.type);
  let rankingColumn = "world_rank";
  if (input.region.scope === "continent") rankingColumn = "continent_rank";
  if (input.region.scope === "country") rankingColumn = "country_rank";
  const scopedConditions = [...scopedSource.conditions, `ranking.${rankingColumn} > 0`];
  const scopedValues = [...scopedSource.values];
  if (input.region.scope === "continent") {
    scopedConditions.push("ranking.continent_id = ?");
    scopedValues.push(input.region.regionId);
  } else if (input.region.scope === "country") {
    scopedConditions.push("ranking.country_id = ?");
    scopedValues.push(input.region.regionId);
  }
  if (input.gender.length) {
    scopedConditions.push(
      `(${input.gender.map(() => "(? = 'o' AND (person_gender.gender = 'o' OR person_gender.gender IS NULL)) OR person_gender.gender = ?").join(" OR ")})`,
    );
    scopedValues.push(...input.gender.flatMap((gender) => [gender, gender]));
  }
  const conditions = ["sub_rank > ?"];
  const values: unknown[] = [input.start];
  if (input.locate) {
    conditions.push("person_id = ?");
    values.push(input.locate);
  } else if (input.search) {
    conditions.push("(person_name LIKE ? OR person_id LIKE ?)");
    values.push(`%${input.search}%`, `%${input.search}%`);
  }
  values.push(input.locate ? 1 : input.limit + 1);

  const result = await query<ListRankingRow>(
    `WITH scoped_rankings AS (
       SELECT
         RANK() OVER (ORDER BY ranking.best) AS rank,
         ROW_NUMBER() OVER (
           ORDER BY ranking.best, ranking.person_name, ranking.person_id
         ) AS sub_rank,
         COUNT(*) OVER () AS total,
         ranking.person_id,
         ranking.person_name,
         ranking.country_id,
         ranking.country_name,
         ranking.country_iso2,
         ranking.continent_id,
         ranking.best,
         ranking.competition_id,
         ranking.competition_name,
         ranking.is_world_record,
         ranking.is_continent_record,
         ranking.is_country_record
       FROM ${scopedSource.from(source)}
       JOIN persons AS person_gender
         ON person_gender.wca_id = ranking.person_id
        AND person_gender.sub_id = 1
       WHERE ${scopedConditions.join("\n         AND ")}
     )
     SELECT *
     FROM scoped_rankings
     WHERE ${conditions.join(" AND ")}
     ORDER BY sub_rank
     LIMIT ?`,
    [input.eventId, ...scopedValues, ...values],
    { rankingStatementTimeout: true },
  );

  const selectedRows = result.rows.slice(0, input.locate ? 1 : input.limit);
  const total = Number(result.rows[0]?.total ?? 0);
  const metadata = await getCurrentRankingsMetadata();
  return {
    entries: selectedRows.map((row) => ({
      rank: Number(row.rank),
      subRank: Number(row.sub_rank),
      personId: row.person_id,
      personName: row.person_name,
      countryId: row.country_id,
      countryName: row.country_name,
      countryIso2: row.country_iso2,
      continentId: row.continent_id,
      best: Number(row.best),
      competitionId: row.competition_id,
      competitionName: row.competition_name,
      recordBadges: getRecordBadges({
        isWorldRecord: Number(row.is_world_record) === 1,
        isContinentRecord: Number(row.is_continent_record) === 1,
        isCountryRecord: Number(row.is_country_record) === 1,
        continentId: row.continent_id,
      }),
    })),
    hasMore: !input.locate && result.rows.length > input.limit,
    nextStart:
      !input.locate && result.rows.length > input.limit
        ? input.start + input.limit
        : null,
    total,
    exportDate: metadata.exportDate,
  };
}

export async function loadListRankings(
  list: ListSummary,
  searchParams: URLSearchParams,
) {
  const rankings = await loadScopedRankings({
    from: (source) => `list_members AS member
       JOIN ${source} AS ranking
         ON ranking.person_id = member.person_id
        AND ranking.event_id = ?`,
    conditions: ["member.list_id = ?"],
    values: [list.id],
  }, searchParams);
  return {
    list: {
      publicId: list.publicId,
      systemAlias: list.systemAlias,
      name: list.name,
      kind: list.kind,
      memberCount: list.memberCount,
      membershipVersion: list.membershipVersion,
    },
    ...rankings,
  };
}

export async function loadDynamicListRankings(
  personIds: string[],
  searchParams: URLSearchParams,
) {
  if (!personIds.length) {
    const metadata = await getCurrentRankingsMetadata();
    return { entries: [], hasMore: false, nextStart: null, total: 0, exportDate: metadata.exportDate };
  }
  const placeholders = personIds.map(() => "?").join(",");
  return loadScopedRankings({
    from: (source) => `${source} AS ranking`,
    conditions: ["ranking.event_id = ?", `ranking.person_id IN (${placeholders})`],
    values: [...personIds],
  }, searchParams);
}

import { query } from "@/db";
import { raiseListRankingRebuildPriority } from "@/lib/list-ranking-cache";
import { getCurrentRankingsMetadata } from "@/services/rankings/metadata";
import {
  getRecordBadges,
  isEventId,
  isRankingType,
  normalizeGenderFilters,
  parseRegionQuery,
  type GenderFilter,
  type RankingType,
} from "@/lib/wca";
import type { ListRankingRow, ListSummary, ScopedRankingSource } from "@/services/lists/types";
import { listRankingsQuery } from "@/services/lists/queries";

function rankingTable(type: RankingType) {
  return type === "average" ? "ranking_entries_average" : "ranking_entries_single";
}

export function parseListRankingInput(searchParams: URLSearchParams) {
  const rawEventId = searchParams.get("eventId") ?? searchParams.get("event");
  const eventId = isEventId(rawEventId) ? rawEventId : "333";
  const rawType = searchParams.get("result") ?? searchParams.get("type");
  let type: RankingType = "single";
  if (eventId !== "333mbf" && isRankingType(rawType)) type = rawType;
  const rawStart = Number(searchParams.get("start"));
  const start = Number.isFinite(rawStart) ? Math.max(0, Math.floor(rawStart)) : 0;
  const pageLimit = Math.max(1, Math.min(100, Math.floor(Number(searchParams.get("limit")) || 50)));
  const search = (searchParams.get("search") ?? "").trim().slice(0, 80);
  const locate = (searchParams.get("locate") ?? "").trim().toUpperCase();
  const searchLimit = Math.max(
    1,
    Math.min(500, Math.floor(Number(searchParams.get("searchLimit")) || 50)),
  );
  const limit = search && !locate ? searchLimit : pageLimit;
  const region = parseRegionQuery(searchParams.get("region"));
  const gender = normalizeGenderFilters(
    searchParams
      .getAll("gender")
      .flatMap((value) => value.split(","))
      .filter((value): value is GenderFilter => value === "m" || value === "f" || value === "o"),
  );
  const requestedMembershipVersion = Number(searchParams.get("membershipVersion"));
  const requestedDataVersion = (searchParams.get("rankingsDataVersion") ?? "").slice(0, 64);
  return {
    eventId,
    type,
    start,
    limit,
    search,
    locate,
    region,
    gender,
    membershipVersion:
      Number.isSafeInteger(requestedMembershipVersion) && requestedMembershipVersion > 0
        ? requestedMembershipVersion
        : null,
    rankingsDataVersion: requestedDataVersion || null,
  };
}

async function loadScopedRankings(
  scopedSource: ScopedRankingSource,
  searchParams: URLSearchParams,
  minimumPageLimit = 0,
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
  const effectiveLimit = Math.max(input.limit, minimumPageLimit);
  values.push(input.locate ? 1 : effectiveLimit + 1);

  const result = await query<ListRankingRow>(
    listRankingsQuery({ source: scopedSource.from(source), scopedConditions, conditions }),
    [input.eventId, ...scopedValues, ...values],
  );

  const selectedRows = result.rows.slice(0, input.locate ? 1 : effectiveLimit);
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
    hasMore: !input.locate && result.rows.length > effectiveLimit,
    nextStart:
      !input.locate && result.rows.length > effectiveLimit
        ? input.start + effectiveLimit
        : null,
    total,
    exportDate: metadata.exportDate,
  };
}

async function loadCachedListRankings(
  list: ListSummary,
  input: ReturnType<typeof parseListRankingInput>,
) {
  const metadata = await getCurrentRankingsMetadata();
  const dataVersion = await query<{ value: string }>(
    "SELECT value FROM export_metadata WHERE `key` = 'fetched_at' LIMIT 1",
  );
  const currentDataVersion = dataVersion.rows[0]?.value;
  const rankingsDataVersion = input.rankingsDataVersion ?? currentDataVersion;
  const membershipVersion = input.membershipVersion ?? list.membershipVersion;
  if (!rankingsDataVersion) return null;
  const source = rankingTable(input.type);
  const cache = await query<ListRankingRow>(
    `SELECT entry.list_rank AS rank, entry.list_position AS sub_rank,
        scope.total_count AS total, entry.person_id, ranking.person_name,
        ranking.country_id, ranking.country_name, ranking.country_iso2,
        ranking.continent_id, entry.score AS best, ranking.competition_id,
        ranking.competition_name, ranking.is_world_record,
        ranking.is_continent_record, ranking.is_country_record
      FROM list_ranking_cache_versions version
      JOIN list_ranking_cache_scopes scope
        ON scope.cache_version_id = version.id
       AND scope.event_id = ? AND scope.result_type = ?
      JOIN list_ranking_cache_entries entry
        ON entry.cache_version_id = version.id
       AND entry.event_id = scope.event_id AND entry.result_type = scope.result_type
      JOIN ${source} ranking
        ON ranking.event_id = entry.event_id AND ranking.person_id = entry.person_id
      WHERE version.list_id = ? AND version.membership_version = ?
        AND version.rankings_data_version = ? AND version.status = 'ready'
        AND entry.list_position > ?
      ORDER BY entry.list_position LIMIT ?`,
    [
      input.eventId,
      input.type,
      list.id,
      membershipVersion,
      rankingsDataVersion,
      input.start,
      input.limit + 1,
    ],
    { rankingStatementTimeout: true },
  );
  if (!cache.rows.length) {
    const exists = await query<{ id: number }>(
      `SELECT id FROM list_ranking_cache_versions
       WHERE list_id = ? AND membership_version = ?
         AND rankings_data_version = ? AND status = 'ready' LIMIT 1`,
      [list.id, membershipVersion, rankingsDataVersion],
    );
    if (!exists.rows.length) return null;
  }
  const rows = cache.rows.slice(0, input.limit);
  const total = Number(cache.rows[0]?.total ?? 0);
  return {
    entries: rows.map((row) => ({
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
    hasMore: cache.rows.length > input.limit,
    nextStart: cache.rows.length > input.limit ? input.start + input.limit : null,
    total,
    exportDate: metadata.exportDate,
    cacheMembershipVersion: membershipVersion,
    cacheDataVersion: rankingsDataVersion,
  };
}

export async function loadListRankings(list: ListSummary, searchParams: URLSearchParams) {
  const input = parseListRankingInput(searchParams);
  const isDefaultScope =
    input.region.scope === "world" &&
    input.gender.length === 0 &&
    !input.search &&
    !input.locate;
  if (isDefaultScope) {
    const cached = await loadCachedListRankings(list, input);
    if (cached) {
      return {
        list: {
          publicId: list.publicId,
          systemAlias: list.systemAlias,
          name: list.name,
          kind: list.kind,
          memberCount: list.memberCount,
          membershipVersion: list.membershipVersion,
        },
        ...cached,
      };
    }
    if (!input.membershipVersion && !input.rankingsDataVersion) {
      void raiseListRankingRebuildPriority(list).catch(() => undefined);
    }
  }
  const rankings = await loadScopedRankings(
    {
      from: (source) => `list_members AS member
       JOIN ${source} AS ranking
         ON ranking.person_id = member.person_id
        AND ranking.event_id = ?`,
      conditions: ["member.list_id = ?"],
      values: [list.id],
    },
    searchParams,
    isDefaultScope ? 100 : 0,
  );
  const fallbackDataVersion = isDefaultScope
    ? (await query<{ value: string }>(
      "SELECT value FROM export_metadata WHERE `key` = 'fetched_at' LIMIT 1",
    )).rows[0]?.value ?? null
    : null;
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
    cacheMembershipVersion: isDefaultScope ? list.membershipVersion : undefined,
    cacheDataVersion: fallbackDataVersion,
  };
}

export async function loadDynamicListRankings(personIds: string[], searchParams: URLSearchParams) {
  if (!personIds.length) {
    const metadata = await getCurrentRankingsMetadata();
    return {
      entries: [],
      hasMore: false,
      nextStart: null,
      total: 0,
      exportDate: metadata.exportDate,
    };
  }
  const placeholders = personIds.map(() => "?").join(",");
  return loadScopedRankings(
    {
      from: (source) => `${source} AS ranking`,
      conditions: ["ranking.event_id = ?", `ranking.person_id IN (${placeholders})`],
      values: [...personIds],
    },
    searchParams,
  );
}

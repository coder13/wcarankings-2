import { query } from "@/db";
import {
  ensureDynamicListRankingTarget,
  isListRankingCacheable,
  listRankingFilterKey,
  raiseListRankingRebuildPriority,
} from "@/lib/list-ranking-cache";
import { getRecordBadges } from "@/lib/wca";
import { searchPersonIds } from "@/services/people/service";
import { filteredResultRankingsQuery } from "@/services/rankings/queries";
import type { ResultRankingRow } from "@/services/rankings/types";
import type { ListSummary } from "@/services/lists/types";
import { parseListRankingInput } from "@/services/lists/input";

type ResultListTarget = {
  targetKey: string;
  membershipVersion: number;
  list?: ListSummary;
  personIds?: string[];
};

function resultSource(resultType: "single" | "average") {
  return resultType === "average"
    ? "result_rankings_average"
    : "result_rankings_single";
}

function resultEntry(row: ResultRankingRow & { record_code?: string | null }) {
  return {
    entryKey: `result:${row.attempt_number == null ? "average" : "single"}:${row.result_id}:${row.attempt_number ?? 0}`,
    resultId: Number(row.result_id),
    rank: Number(row.rank),
    subRank: Number(row.position),
    personId: row.person_id,
    personName: row.person_name,
    countryId: row.country_id,
    countryName: row.country_name,
    countryIso2: row.country_iso2,
    continentId: row.continent_id,
    best: Number(row.result_value),
    competitionId: row.competition_id,
    competitionName: row.competition_name,
    recordBadges: getRecordBadges({
      isWorldRecord: row.record_code === "WR",
      isContinentRecord: row.record_code === "CR",
      isCountryRecord: row.record_code === "NR",
      continentId: row.continent_id,
    }),
  };
}

async function loadCachedResults(
  target: ResultListTarget,
  input: ReturnType<typeof parseListRankingInput>,
) {
  const dataVersionResult = await query<{ value: string }>(
    "SELECT value FROM export_metadata WHERE `key` = 'fetched_at' LIMIT 1",
  );
  const rankingsDataVersion =
    input.rankingsDataVersion ?? dataVersionResult.rows[0]?.value;
  if (!rankingsDataVersion) return null;
  const filterKey = listRankingFilterKey({
    scope: input.region.scope,
    regionId: input.region.regionId,
    genders: input.gender,
  });
  const source = resultSource(input.type);
  const sourceGender = input.gender.length
    ? ` AND ranking.gender IN (${input.gender.map(() => "?").join(",")})`
    : "";
  const sourceAttempt =
    input.type === "single"
      ? " AND ranking.attempt_number = entry.attempt_number"
      : "";
  const cache = await query<ResultRankingRow & { total: number }>(
    `SELECT entry.result_id, NULLIF(entry.attempt_number, 0) AS attempt_number,
        entry.score AS result_value, entry.list_rank AS rank, entry.list_position AS position,
        entry.person_id, ranking.country_id, ranking.continent_id, ranking.competition_id,
        ranking.record_code, scope.total_count AS total,
        COALESCE(person.name, entry.person_id) AS person_name,
        COALESCE(country.name, ranking.country_id) AS country_name,
        COALESCE(country.iso2, '') AS country_iso2,
        COALESCE(competition.name, ranking.competition_id) AS competition_name
      FROM list_ranking_cache_versions version
      JOIN list_result_ranking_cache_scopes scope
        ON scope.cache_version_id = version.id
       AND scope.event_id = ? AND scope.result_type = ?
      JOIN list_result_ranking_cache_entries entry
        ON entry.cache_version_id = version.id
       AND entry.event_id = scope.event_id AND entry.result_type = scope.result_type
      JOIN ${source} ranking
        ON ranking.event_id = CONVERT(entry.event_id USING utf8mb4)
       AND ranking.result_id = entry.result_id${sourceAttempt}${sourceGender}
      LEFT JOIN persons person ON person.wca_id = entry.person_id AND person.sub_id = 1
      LEFT JOIN countries country ON country.id = ranking.country_id
      LEFT JOIN competitions competition ON competition.id = ranking.competition_id
      WHERE version.target_key = ? AND version.grain = 'result' AND version.filter_key = ?
        AND version.membership_version = ? AND version.rankings_data_version = ?
        AND version.status IN ('building', 'ready')
        AND scope.completed_count > ? AND entry.list_position > ?
      ORDER BY version.status = 'ready' DESC, version.id DESC, entry.list_position
      LIMIT ?`,
    [
      input.eventId,
      input.type,
      ...input.gender,
      target.targetKey,
      filterKey,
      target.membershipVersion,
      rankingsDataVersion,
      input.start,
      input.start,
      input.limit + 1,
    ],
  );
  if (!cache.rows.length) {
    const exists = await query<{ id: number }>(
      `SELECT version.id
       FROM list_ranking_cache_versions version
       JOIN list_result_ranking_cache_scopes scope
         ON scope.cache_version_id = version.id
        AND scope.event_id = ? AND scope.result_type = ?
       WHERE version.target_key = ? AND version.grain = 'result' AND version.filter_key = ?
         AND version.membership_version = ? AND version.rankings_data_version = ?
         AND version.status IN ('building', 'ready') AND scope.completed_count > ?
       LIMIT 1`,
      [
        input.eventId,
        input.type,
        target.targetKey,
        filterKey,
        target.membershipVersion,
        rankingsDataVersion,
        input.start,
      ],
    );
    if (!exists.rows.length) return null;
  }
  const rows = cache.rows.slice(0, input.limit);
  const total = Number(cache.rows[0]?.total ?? 0);
  return {
    entries: rows.map(resultEntry),
    hasMore: cache.rows.length > input.limit,
    nextPageStart:
      cache.rows.length > input.limit ? input.start + input.limit : null,
    previousPageStart:
      input.start > 0 ? Math.max(0, input.start - input.limit) : null,
    startPosition: input.start,
    lastRank: rows.at(-1)?.rank == null ? null : Number(rows.at(-1)?.rank),
    total,
    cacheMembershipVersion: target.membershipVersion,
    cacheDataVersion: rankingsDataVersion,
  };
}

async function loadDirectResults(
  target: ResultListTarget,
  input: ReturnType<typeof parseListRankingInput>,
) {
  const conditions = ["source.event_id = ?"];
  const values: unknown[] = [input.eventId];
  const joinValues: unknown[] = [];
  const joins: string[] = [];
  const source = `${resultSource(input.type)} source`;
  const attemptNumber =
    input.type === "single" ? "source.attempt_number" : "NULL";
  const competitionStartDate =
    input.type === "average"
      ? "order_facts.competition_start_date"
      : "source.competition_start_date";
  if (input.type === "average") {
    joins.push(
      "JOIN result_facts order_facts ON order_facts.result_id = source.result_id",
    );
  }
  if (target.list) {
    joins.push(
      "JOIN list_members member ON member.person_id = source.person_id AND member.list_id = ?",
    );
    joinValues.push(target.list.id);
  } else {
    const ids = target.personIds ?? [];
    if (!ids.length) return emptyDirectResult();
    conditions.push(`source.person_id IN (${ids.map(() => "?").join(",")})`);
    values.push(...ids);
  }
  if (input.region.scope === "continent") {
    conditions.push(`source.continent_id = ?`);
    values.push(input.region.regionId);
  } else if (input.region.scope === "country") {
    conditions.push(`source.country_id = ?`);
    values.push(input.region.regionId);
  }
  if (input.gender.length) {
    conditions.push(
      `source.gender IN (${input.gender.map(() => "?").join(",")})`,
    );
    values.push(...input.gender);
  }
  if (input.locate) {
    conditions.push("source.person_id = ?");
    values.push(input.locate);
  }
  if (input.search) {
    const people = await searchPersonIds(input.search, false, input.limit);
    if (!people.personIds.length) return emptyDirectResult();
    conditions.push(
      `source.person_id IN (${people.personIds.map(() => "?").join(",")})`,
    );
    values.push(...people.personIds);
  }
  const rows = await query<ResultRankingRow & { total_count?: number }>(
    filteredResultRankingsQuery({
      source,
      joins: joins.join(" "),
      candidateColumns: `source.result_id, ${attemptNumber} AS attempt_number, source.result_value,
        source.person_id, source.country_id, source.continent_id,
        source.competition_id, ${competitionStartDate}, source.record_code`,
      conditions,
    }),
    [...joinValues, ...values, input.start, input.limit + 1],
  );
  const pageRows = rows.rows.slice(0, input.limit);
  const last = pageRows.at(-1);
  return {
    entries: pageRows.map(resultEntry),
    hasMore: rows.rows.length > input.limit,
    nextPageStart:
      rows.rows.length > input.limit && last ? Number(last.position) + 1 : null,
    previousPageStart:
      input.start > 0 ? Math.max(0, input.start - input.limit) : null,
    startPosition: input.start,
    lastRank: last ? Number(last.rank) : null,
    total: Number(rows.rows[0]?.total_count ?? 0),
    diagnostics: rows,
  };
}

function emptyResultData() {
  return {
    entries: [],
    hasMore: false,
    nextPageStart: null,
    previousPageStart: null,
    startPosition: 0,
    lastRank: null,
    total: 0,
  };
}

function emptyDirectResult() {
  return {
    ...emptyResultData(),
    diagnostics: { timings: { queueMs: 0, statementMs: 0 }, rows: [] },
  };
}

export async function loadSavedListResultRankings(
  list: ListSummary,
  params: URLSearchParams,
) {
  const input = parseListRankingInput(params);
  const filter = {
    scope: input.region.scope,
    regionId: input.region.regionId,
    genders: input.gender,
  } as const;
  const cacheable =
    !input.search &&
    !input.locate &&
    isListRankingCacheable("result", input.type, filter);
  const filterKey = listRankingFilterKey(filter);
  const target = {
    targetKey: `list:${list.id}`,
    membershipVersion: list.membershipVersion,
    list,
  };
  if (cacheable) {
    const cached = await loadCachedResults(target, input);
    if (cached)
      return {
        data: cached,
        diagnostics: {
          timings: { queueMs: 0, statementMs: 0 },
          queryCount: 2,
          returnedRows: cached.entries.length,
          cacheOutcome: "hit" as const,
          cacheLayer: "list-ranking" as const,
        },
      };
    if (!input.membershipVersion && !input.rankingsDataVersion) {
      void raiseListRankingRebuildPriority(list, "result", filterKey).catch(
        () => undefined,
      );
    }
  }
  const direct = await loadDirectResults(target, input);
  const { diagnostics, ...data } = direct;
  return {
    data,
    diagnostics: {
      timings: diagnostics.timings,
      queryCount: 1,
      returnedRows: diagnostics.rows.length,
      cacheOutcome: cacheable ? ("miss" as const) : ("bypass" as const),
      cacheLayer: "list-ranking" as const,
    },
  };
}

export async function loadDynamicListResultRankings(
  personIds: string[],
  params: URLSearchParams,
) {
  const input = parseListRankingInput(params);
  const filter = {
    scope: input.region.scope,
    regionId: input.region.regionId,
    genders: input.gender,
  } as const;
  const cacheable =
    !input.search &&
    !input.locate &&
    isListRankingCacheable("result", input.type, filter);
  const filterKey = listRankingFilterKey(filter);
  if (!personIds.length)
    return {
      data: emptyResultData(),
      diagnostics: {
        timings: { queueMs: 0, statementMs: 0 },
        queryCount: 0,
        returnedRows: 0,
        cacheOutcome: "bypass" as const,
      },
    };
  const target = cacheable
    ? await ensureDynamicListRankingTarget(personIds, "result", filterKey)
    : null;
  if (cacheable && target) {
    const cached = await loadCachedResults(target, input);
    if (cached)
      return {
        data: cached,
        diagnostics: {
          timings: { queueMs: 0, statementMs: 0 },
          queryCount: 2,
          returnedRows: cached.entries.length,
          cacheOutcome: "hit" as const,
          cacheLayer: "list-ranking" as const,
        },
      };
  }
  const direct = await loadDirectResults(
    { targetKey: target?.targetKey ?? "", membershipVersion: 1, personIds },
    input,
  );
  const { diagnostics, ...data } = direct;
  return {
    data,
    diagnostics: {
      timings: diagnostics.timings,
      queryCount: 1,
      returnedRows: diagnostics.rows.length,
      cacheOutcome: cacheable ? ("miss" as const) : ("bypass" as const),
      cacheLayer: "list-ranking" as const,
    },
  };
}

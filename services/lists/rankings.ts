import { query } from "@/db";
import {
  ensureDynamicListRankingTarget,
  isListRankingCacheable,
  listRankingFilterKey,
  raiseListRankingRebuildPriority,
} from "@/lib/list-ranking-cache";
import { getCurrentRankingsMetadata } from "@/services/rankings/metadata";
import { getRecordBadges } from "@/lib/wca";
import { parseListRankingInput } from "@/services/lists/input";
import type {
  ListRankingRow,
  ListSummary,
  ScopedRankingSource,
} from "@/services/lists/types";

function isMissingRankingProjection(error: unknown) {
  const databaseError = error as { code?: string; message?: string };
  return (
    databaseError.code === "ER_NO_SUCH_TABLE" &&
    (databaseError.message?.includes("person_event_rankings") ||
      databaseError.message?.includes("result_facts"))
  );
}

async function loadScopedRankings(
  scopedSource: ScopedRankingSource,
  searchParams: URLSearchParams,
  minimumPageLimit = 0,
) {
  const input = parseListRankingInput(searchParams);
  const source = "person_event_rankings";
  let rankingColumn = "world_rank";
  if (input.region.scope === "continent") rankingColumn = "continent_rank";
  if (input.region.scope === "country") rankingColumn = "country_rank";
  const scopedConditions = [
    "ranking.event_id = ?",
    ...scopedSource.conditions,
    "ranking.result_type = ?",
    `ranking.${rankingColumn} > 0`,
  ];
  const scopedValues = [input.eventId, ...scopedSource.values];
  scopedValues.push(input.type);
  if (input.region.scope === "continent") {
    scopedConditions.push("ranking.continent_id = ?");
    scopedValues.push(input.region.regionId);
  } else if (input.region.scope === "country") {
    scopedConditions.push("ranking.country_id = ?");
    scopedValues.push(input.region.regionId);
  }
  if (input.gender.length) {
    scopedConditions.push(
      `ranking.gender IN (${input.gender.map(() => "?").join(",")})`,
    );
    scopedValues.push(...input.gender);
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

  const rankingColumns = input.gender.length
    ? `RANK() OVER (ORDER BY ranking.result_value) AS rank,
       ROW_NUMBER() OVER (ORDER BY ranking.result_value, ranking.person_id) AS sub_rank`
    : `ranking.${rankingColumn} AS rank, ranking.${rankingColumn.replace("rank", "position")} AS sub_rank`;
  const result = await query<ListRankingRow>(
    `WITH scoped_rankings AS (
       SELECT ${rankingColumns}, COUNT(*) OVER () AS total,
         ranking.person_id, COALESCE(person.name, CONVERT(ranking.person_id USING utf8mb4)) AS person_name,
         ranking.result_id, ranking.result_value AS best,
         ranking.country_id, ranking.continent_id
       FROM ${scopedSource.from(source)}
       LEFT JOIN persons person
         ON person.wca_id = CONVERT(ranking.person_id USING utf8mb4)
        AND person.sub_id = 1
       WHERE ${scopedConditions.join(" AND ")}
     ), page AS (
       SELECT * FROM scoped_rankings WHERE ${conditions.join(" AND ")}
       ORDER BY sub_rank LIMIT ?
     )
     SELECT page.rank, page.sub_rank, page.total, page.person_id,
       page.person_name, page.country_id,
       COALESCE(country.name, CONVERT(page.country_id USING utf8mb4)) AS country_name,
       COALESCE(country.iso2, '') AS country_iso2, page.continent_id, page.best,
       facts.competition_id, COALESCE(competition.name, facts.competition_id) AS competition_name,
       IF(facts.${input.type === "average" ? "regional_average_record" : "regional_single_record"} = 'WR', 1, 0) AS is_world_record,
       IF(facts.${input.type === "average" ? "regional_average_record" : "regional_single_record"} IN ('AfR', 'AsR', 'ER', 'NaR', 'OcR', 'SaR'), 1, 0) AS is_continent_record,
       IF(facts.${input.type === "average" ? "regional_average_record" : "regional_single_record"} = 'NR', 1, 0) AS is_country_record
     FROM page
     JOIN result_facts facts ON facts.result_id = page.result_id
     LEFT JOIN countries country ON country.id = CONVERT(page.country_id USING utf8mb4)
     LEFT JOIN competitions competition ON competition.id = facts.competition_id
     ORDER BY page.sub_rank`,
    [...scopedValues, ...values],
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

async function loadCachedTargetRankings(
  targetKey: string,
  membershipVersion: number,
  input: ReturnType<typeof parseListRankingInput>,
) {
  const metadata = await getCurrentRankingsMetadata();
  const dataVersion = await query<{ value: string }>(
    "SELECT value FROM export_metadata WHERE `key` = 'fetched_at' LIMIT 1",
  );
  const currentDataVersion = dataVersion.rows[0]?.value;
  const rankingsDataVersion = input.rankingsDataVersion ?? currentDataVersion;
  const effectiveMembershipVersion =
    input.membershipVersion ?? membershipVersion;
  const filterKey = listRankingFilterKey({
    scope: input.region.scope,
    regionId: input.region.regionId,
    genders: input.gender,
  });
  if (!rankingsDataVersion) return null;
  const recordColumn =
    input.type === "average"
      ? "regional_average_record"
      : "regional_single_record";
  const cache = await query<ListRankingRow>(
    `SELECT entry.list_rank AS rank, entry.list_position AS sub_rank,
        scope.total_count AS total, entry.person_id, person.name AS person_name,
        person.country_id, country.name AS country_name, country.iso2 AS country_iso2,
        country.continent_id, entry.score AS best, facts.competition_id,
        competition.name AS competition_name,
        IF(facts.${recordColumn} = 'WR', 1, 0) AS is_world_record,
        IF(facts.${recordColumn} = 'CR', 1, 0) AS is_continent_record,
        IF(facts.${recordColumn} = 'NR', 1, 0) AS is_country_record
      FROM list_ranking_cache_versions version
      JOIN list_person_ranking_cache_scopes scope
        ON scope.cache_version_id = version.id
       AND scope.event_id = ? AND scope.result_type = ?
      JOIN list_person_ranking_cache_entries entry
        ON entry.cache_version_id = version.id
       AND entry.event_id = scope.event_id AND entry.result_type = scope.result_type
      JOIN person_event_rankings ranking
        ON ranking.event_id = CONVERT(entry.event_id USING utf8mb4)
       AND ranking.result_type = CONVERT(entry.result_type USING utf8mb4)
       AND ranking.person_id = CONVERT(entry.person_id USING utf8mb4)
       AND ranking.result_id = entry.result_id
      JOIN persons person ON person.wca_id = CONVERT(entry.person_id USING utf8mb4) AND person.sub_id = 1
      LEFT JOIN countries country ON country.id = person.country_id
      LEFT JOIN result_facts facts ON facts.result_id = entry.result_id
      LEFT JOIN competitions competition ON competition.id = facts.competition_id
      WHERE version.target_key = ? AND version.grain = 'person' AND version.filter_key = ?
        AND version.membership_version = ?
        AND version.rankings_data_version = ? AND version.status IN ('building', 'ready')
        AND scope.completed_count > ?
        AND entry.list_position > ?
      ORDER BY version.status = 'ready' DESC, version.id DESC, entry.list_position LIMIT ?`,
    [
      input.eventId,
      input.type,
      targetKey,
      filterKey,
      effectiveMembershipVersion,
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
       JOIN list_person_ranking_cache_scopes scope
         ON scope.cache_version_id = version.id
        AND scope.event_id = ? AND scope.result_type = ?
       WHERE version.target_key = ? AND version.grain = 'person' AND version.filter_key = ?
         AND version.membership_version = ?
         AND version.rankings_data_version = ? AND version.status IN ('building', 'ready')
         AND scope.completed_count > ?
       LIMIT 1`,
      [
        input.eventId,
        input.type,
        targetKey,
        filterKey,
        effectiveMembershipVersion,
        rankingsDataVersion,
        input.start,
      ],
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
    nextStart:
      cache.rows.length > input.limit ? input.start + input.limit : null,
    total,
    exportDate: metadata.exportDate,
    cacheMembershipVersion: effectiveMembershipVersion,
    cacheDataVersion: rankingsDataVersion,
  };
}

async function loadCachedListRankings(
  list: ListSummary,
  input: ReturnType<typeof parseListRankingInput>,
) {
  return loadCachedTargetRankings(
    `list:${list.id}`,
    list.membershipVersion,
    input,
  );
}

export async function loadListRankings(
  list: ListSummary,
  searchParams: URLSearchParams,
) {
  try {
    const input = parseListRankingInput(searchParams);
    const filter = {
      scope: input.region.scope,
      regionId: input.region.regionId,
      genders: input.gender,
    } as const;
    const cacheable =
      !input.search &&
      !input.locate &&
      isListRankingCacheable("person", input.type, filter);
    const filterKey = listRankingFilterKey(filter);
    if (cacheable) {
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
          cacheOutcome: "hit" as const,
        };
      }
      if (!input.membershipVersion && !input.rankingsDataVersion) {
        void raiseListRankingRebuildPriority(list, "person", filterKey).catch(
          () => undefined,
        );
      }
    }
    const rankings = await loadScopedRankings(
      {
        from: (source) => `list_members AS member
       JOIN ${source} AS ranking
         ON ranking.person_id = CONVERT(member.person_id USING utf8mb4)`,
        conditions: ["member.list_id = ?"],
        values: [list.id],
      },
      searchParams,
      cacheable ? 100 : 0,
    );
    const fallbackDataVersion = cacheable
      ? ((
          await query<{ value: string }>(
            "SELECT value FROM export_metadata WHERE `key` = 'fetched_at' LIMIT 1",
          )
        ).rows[0]?.value ?? null)
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
      cacheMembershipVersion: cacheable ? list.membershipVersion : undefined,
      cacheDataVersion: fallbackDataVersion,
      cacheOutcome: cacheable ? ("miss" as const) : ("bypass" as const),
    };
  } catch (error) {
    if (!isMissingRankingProjection(error)) {
      const databaseError = error as { code?: string; message?: string };
      console.error("[list rankings] failed to load rankings", {
        code: databaseError.code,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
    const metadata = await getCurrentRankingsMetadata();
    return {
      list: {
        publicId: list.publicId,
        systemAlias: list.systemAlias,
        name: list.name,
        kind: list.kind,
        memberCount: list.memberCount,
        membershipVersion: list.membershipVersion,
      },
      entries: [],
      hasMore: false,
      nextStart: null,
      total: 0,
      exportDate: metadata.exportDate,
      cacheMembershipVersion: undefined,
      cacheDataVersion: undefined,
      cacheOutcome: "bypass" as const,
    };
  }
}

export async function loadDynamicListRankings(
  personIds: string[],
  searchParams: URLSearchParams,
) {
  if (!personIds.length) {
    const metadata = await getCurrentRankingsMetadata();
    return {
      entries: [],
      hasMore: false,
      nextStart: null,
      total: 0,
      exportDate: metadata.exportDate,
      cacheOutcome: "bypass" as const,
    };
  }
  const input = parseListRankingInput(searchParams);
  const filter = {
    scope: input.region.scope,
    regionId: input.region.regionId,
    genders: input.gender,
  } as const;
  const cacheable =
    !input.search &&
    !input.locate &&
    isListRankingCacheable("person", input.type, filter);
  const filterKey = listRankingFilterKey(filter);
  if (cacheable) {
    const target = await ensureDynamicListRankingTarget(
      personIds,
      "person",
      filterKey,
    );
    if (target) {
      const cached = await loadCachedTargetRankings(
        target.targetKey,
        target.membershipVersion,
        input,
      );
      if (cached) return { ...cached, cacheOutcome: "hit" as const };
    }
  }
  const placeholders = personIds.map(() => "?").join(",");
  const rankings = await loadScopedRankings(
    {
      from: (source) => `${source} AS ranking`,
      conditions: [`ranking.person_id IN (${placeholders})`],
      values: [...personIds],
    },
    searchParams,
  );
  return {
    ...rankings,
    cacheOutcome: cacheable ? ("miss" as const) : ("bypass" as const),
  };
}

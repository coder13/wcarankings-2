import { query } from "@/db";
import { RESULTS_PAGE_SIZE } from "@/lib/rankings-config";
import { SEARCH_PAGE_SIZE, normalizeSearchPage } from "@/lib/search-pagination";
import {
  normalPageKey,
  prewarmPageKeys,
  rankingsPageCache,
  refreshRankingsCacheGeneration,
  setRankingsCacheInvalidator,
  setRankingsCachePrewarmer,
} from "@/lib/rankings-cache";
import {
  isEventId,
  isRankingType,
  isValidRegexPattern,
  parseRegionQuery,
  getRecordBadges,
  type RankingEntry,
  type RankingType,
  type RegionScope,
} from "@/lib/wca";

const PAGE_SIZE = RESULTS_PAGE_SIZE;
const MAX_PAGE_SIZE = RESULTS_PAGE_SIZE;
type RankingRow = {
  rank: number;
  sub_rank: number;
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

function toRankingEntry(row: RankingRow): RankingEntry {
  return {
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
  };
}

function getQueryShape(scope: RegionScope) {
  if (scope === "continent") {
    return { rankColumn: "continent_rank", subRankColumn: "continent_sub_rank", regionColumn: "continent_id" } as const;
  }
  if (scope === "country") {
    return { rankColumn: "country_rank", subRankColumn: "country_sub_rank", regionColumn: "country_id" } as const;
  }
  return { rankColumn: "world_rank", subRankColumn: "world_sub_rank", regionColumn: null } as const;
}

function addParameter(values: unknown[], value: unknown) {
  values.push(value);
  return "?";
}

function getRankingTable(type: RankingType) {
  return type === "average" ? "ranking_entries_average" : "ranking_entries_single";
}

type ProjectionCapability = { tables: Set<string>; storedSubRanks: Set<string> };
let projectionCapability: Promise<ProjectionCapability> | null = null;

function getProjectionCapability() {
  if (!projectionCapability) {
    projectionCapability = (async () => {
      const tables = ["ranking_entries_single", "ranking_entries_average", "ranking_entries"];
      const columns = ["world_sub_rank", "continent_sub_rank", "country_sub_rank"];
      const [tableResult, columnResult] = await Promise.all([
        query<{ name: string }>(
          "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN (?, ?, ?)",
          tables,
        ),
        query<{ name: string }>(
          "SELECT column_name AS name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name IN (?, ?, ?) AND column_name IN (?, ?, ?)",
          [...tables, ...columns],
        ),
      ]);
      return {
        tables: new Set(tableResult.rows.map((row) => row.name)),
        storedSubRanks: new Set(columnResult.rows.map((row) => row.name)),
      };
    })();
  }
  return projectionCapability;
}

function getSubRankPartition(scope: RegionScope, legacy: boolean) {
  if (scope === "continent") return legacy ? "event_id, ranking_type, continent_id" : "event_id, continent_id";
  if (scope === "country") return legacy ? "event_id, ranking_type, country_id" : "event_id, country_id";
  return legacy ? "event_id, ranking_type" : "event_id";
}

function getRankingSource(
  table: string,
  scope: RegionScope,
  rankColumn: string,
  subRankColumn: string,
  storedSubRank: boolean,
  legacy: boolean,
) {
  if (storedSubRank) return table;
  const partition = getSubRankPartition(scope, legacy);
  return `(SELECT ${table}.*,
      ROW_NUMBER() OVER (
        PARTITION BY ${partition}
        ORDER BY ${rankColumn}, person_name, person_id
      ) AS ${subRankColumn}
    FROM ${table}) AS ${table}`;
}

// Legacy production projections predate persisted record flag columns. Derive
// them from the public WCA ranks so both schema generations return badges.
const recordBadgeColumns = `
  CASE WHEN world_rank = 1 THEN 1 ELSE 0 END AS is_world_record,
  CASE WHEN continent_rank = 1 THEN 1 ELSE 0 END AS is_continent_record,
  CASE WHEN country_rank = 1 THEN 1 ELSE 0 END AS is_country_record`;

function makeFilters({
  eventId,
  type,
  scope,
  regionId,
  legacy,
}: {
  eventId: string;
  type: RankingType;
  scope: RegionScope;
  regionId: string;
  legacy: boolean;
}) {
  const { rankColumn, subRankColumn, regionColumn } = getQueryShape(scope);
  const values: unknown[] = [];
  const conditions = [
    `event_id = ${addParameter(values, eventId)}`,
  ];
  if (legacy) conditions.push(`ranking_type = ${addParameter(values, type)}`);
  if (regionColumn) {
    conditions.push(`${regionColumn} = ${addParameter(values, regionId)}`);
  }
  conditions.push(`${rankColumn} > 0`);
  return { rankColumn, subRankColumn, conditions, values };
}

export async function queryMysql({
  eventId,
  type,
  scope,
  regionId,
  startRank,
  cursorRank,
  cursorId,
  limit,
  locate,
  search,
  regexSearch = false,
  searchPage,
  paged,
}: {
  eventId: string;
  type: RankingType;
  scope: RegionScope;
  regionId: string;
  startRank: number;
  cursorRank: number | null;
  cursorId: string;
  limit: number;
  locate: string;
  search: string;
  regexSearch?: boolean;
  searchPage: number;
  paged: boolean;
}) {
  const splitEntriesTable = getRankingTable(type);
  const capability = await getProjectionCapability();
  const splitProjectionExists = capability.tables.has(splitEntriesTable);
  const entriesTable = splitProjectionExists ? splitEntriesTable : "ranking_entries";
  const legacy = !splitProjectionExists;
  const filter = makeFilters({ eventId, type, scope, regionId, legacy });
  const { rankColumn, subRankColumn: storedSubRankColumn, conditions } = filter;
  const storedSubRank = capability.storedSubRanks.has(storedSubRankColumn);
  const subRankColumn = storedSubRank ? storedSubRankColumn : "sub_rank";
  const rankingSource = getRankingSource(
    entriesTable,
    scope,
    rankColumn,
    subRankColumn,
    storedSubRank,
    legacy,
  );

  if (locate) {
    const values = [...filter.values];
    const locateParameter = addParameter(values, locate);
    const located = await query<RankingRow>(
      `SELECT ${rankColumn} AS rank, ${subRankColumn} AS sub_rank, person_id, person_name, country_id, country_name,
        country_iso2, continent_id, best, competition_id, competition_name,
        ${recordBadgeColumns}
      FROM ${rankingSource}
      WHERE ${conditions.join(" AND ")} AND person_id = ${locateParameter}
      LIMIT 1`,
      values,
    );

    return { located: located.rows[0] ? toRankingEntry(located.rows[0]) : null, source: "wca" as const };
  }

  if (search) {
    if (regexSearch && !isValidRegexPattern(search)) {
      throw new Error("Invalid regular expression.");
    }
    const values = [...filter.values];
    const searchPattern = regexSearch ? search : `%${search}%`;
    const searchNameParameter = addParameter(values, searchPattern);
    const searchIdParameter = addParameter(values, searchPattern);
    const searchOperator = regexSearch ? "REGEXP" : "LIKE";
    const searchConditions = [
      ...conditions,
      `(person_name ${searchOperator} ${searchNameParameter} OR person_id ${searchOperator} ${searchIdParameter})`,
    ];
    const offset = searchPage * SEARCH_PAGE_SIZE;
    const [searchResult, countResult] = await Promise.all([
      query<RankingRow>(
      `SELECT ${rankColumn} AS rank, ${subRankColumn} AS sub_rank, person_id, person_name, country_id, country_name,
        country_iso2, continent_id, best, competition_id, competition_name,
        ${recordBadgeColumns}
      FROM ${rankingSource}
      WHERE ${searchConditions.join(" AND ")}
      ORDER BY ${subRankColumn}, person_id
      LIMIT ${addParameter(values, SEARCH_PAGE_SIZE)} OFFSET ${addParameter(values, offset)}`,
      values,
      ),
      query<{ count: number }>(
        `SELECT COUNT(*) AS count FROM ${rankingSource}
        WHERE ${searchConditions.join(" AND ")}`,
        values.slice(0, -2),
      ),
    ]);

    return {
      entries: searchResult.rows.map(toRankingEntry),
      hasMore: false,
      nextPageStart: null,
      previousPageStart: null,
      nextCursor: null,
      total: Number(countResult.rows[0]?.count ?? 0),
      searchPage,
      searchPageSize: SEARCH_PAGE_SIZE,
      exportDate: null,
      source: "wca" as const,
    };
  }

  // The public row rank stays in `rank`; all paging coordinates use sub_rank.
  const pageStartRank = startRank;

  const values = [...filter.values];
  const pageConditions = [...conditions];
  const cursorClause = paged
    ? ` AND ${subRankColumn} >= ${addParameter(values, pageStartRank)} AND ${subRankColumn} < ${addParameter(values, pageStartRank + limit)}`
    : cursorRank
      ? ` AND (${subRankColumn} > ${addParameter(values, cursorRank)} OR (${subRankColumn} = ${addParameter(values, cursorRank)} AND person_id > ${addParameter(values, cursorId)}))`
      : ` AND ${subRankColumn} >= ${addParameter(values, startRank)}`;
  pageConditions.push(cursorClause.slice(5));
  const limitParameter = paged ? "" : ` LIMIT ${addParameter(values, limit + 1)}`;
  const querySql = `SELECT ${rankColumn} AS rank, ${subRankColumn} AS sub_rank, person_id, person_name, country_id, country_name,
      country_iso2, continent_id, best, competition_id, competition_name,
      ${recordBadgeColumns}
    FROM ${rankingSource}
    WHERE ${pageConditions.join(" AND ")}
    ORDER BY ${subRankColumn}${limitParameter}`;

  const nextPageRank = paged
    ? query<{ rank: number | null }>(
      `SELECT MIN(${subRankColumn}) AS rank FROM ${rankingSource} WHERE ${conditions.join(" AND ")} AND ${subRankColumn} >= ?`,
      [...filter.values, pageStartRank + limit],
    ).then((result) => result.rows[0] ?? null)
    : Promise.resolve(null);
  const previousPageRank = paged && pageStartRank > 1
    ? query<{ rank: number | null }>(
      `SELECT MAX(${subRankColumn}) AS rank FROM ${rankingSource} WHERE ${conditions.join(" AND ")} AND ${subRankColumn} < ?`,
      [...filter.values, pageStartRank],
    ).then((result) => result.rows[0] ?? null)
    : Promise.resolve(null);

  const countValues = [eventId, type, scope, regionId];
  const [result, countResult, exportMetadataResult, nextRankRow, previousRankRow, startPositionRow, lastRankRow] = await Promise.all([
    query<RankingRow>(querySql, values),
    query<{ count: number }>(
      "SELECT count FROM ranking_counts WHERE event_id = ? AND ranking_type = ? AND scope = ? AND region_id = ?",
      countValues,
    ),
    query<{ key: string; value: string }>("SELECT `key`, value FROM export_metadata WHERE `key` IN ('export_date', 'fetched_at')"),
    nextPageRank,
    previousPageRank,
    paged
      ? query<{ count: number }>(
        `SELECT COUNT(*) AS count FROM ${rankingSource} WHERE ${conditions.join(" AND ")} AND ${subRankColumn} < ?`,
        [...filter.values, pageStartRank],
      ).then((result) => result.rows[0] ?? null)
      : Promise.resolve({ count: 0 }),
    query<{ rank: number | null }>(
      `SELECT MAX(${subRankColumn}) AS rank FROM ${rankingSource} WHERE ${conditions.join(" AND ")}`,
      filter.values,
    ).then((result) => result.rows[0] ?? null),
  ]);

  const rows = result.rows.map(toRankingEntry);
  const countRow = countResult.rows[0];
  const exportMetadata = new Map(exportMetadataResult.rows.map((row) => [row.key, row.value]));
  const total = Number(countRow?.count ?? 0);
  const nextPageStart = nextRankRow?.rank
    ? Math.floor((Number(nextRankRow.rank) - 1) / limit) * limit + 1
    : null;
  const previousPageStart = previousRankRow?.rank
    ? Math.floor((Number(previousRankRow.rank) - 1) / limit) * limit + 1
    : null;
  const hasMore = paged ? nextPageStart !== null : rows.length > limit;
  const entries = paged ? rows : (hasMore ? rows.slice(0, limit) : rows);
  const last = entries.at(-1);

  return {
    entries,
    hasMore,
    nextPageStart,
    previousPageStart,
    startPosition: Number(startPositionRow?.count ?? 0),
    lastRank: Number(lastRankRow?.rank ?? 0) || null,
    nextCursor: last ? { rank: last.subRank, personId: last.personId } : null,
    total,
    exportDate: exportMetadata.get("export_date") ?? null,
    fetchedAt: exportMetadata.get("fetched_at") ?? exportMetadata.get("export_date") ?? null,
    source: "wca" as const,
  };
}

type QueryMysqlInput = Parameters<typeof queryMysql>[0];

async function getCachedNormalPage(input: QueryMysqlInput) {
  await refreshRankingsCacheGeneration();
  return rankingsPageCache.get(
    normalPageKey({
      eventId: input.eventId,
      type: input.type,
      scope: input.scope,
      regionId: input.regionId,
      startRank: input.startRank,
    }),
    () => queryMysql(input),
  ) as ReturnType<typeof queryMysql>;
}

setRankingsCacheInvalidator(() => {
  projectionCapability = null;
});

async function prewarmFirstPages() {
  // Each page query fans out to several DB reads; warm sequentially so startup
  // never starves the request pool.
  for (const key of prewarmPageKeys()) {
    await rankingsPageCache.get(key, () => queryMysql({
      ...key,
      cursorRank: null,
      cursorId: "",
      limit: PAGE_SIZE,
      locate: "",
      search: "",
      searchPage: 0,
      paged: true,
    }));
  }
}

setRankingsCachePrewarmer(prewarmFirstPages);
// Deliberately detached: importing the route must not wait for warming every event.
void prewarmFirstPages().catch(() => undefined);

export async function loadRankings(searchParams: URLSearchParams) {
  const rawEventId = searchParams.get("eventId") ?? searchParams.get("event");
  const rawType = searchParams.get("result") ?? searchParams.get("type");
  const eventId = isEventId(rawEventId) ? rawEventId : "333";
  const type = eventId === "333mbf" ? "single" : isRankingType(rawType) ? rawType : "single";
  const { scope, regionId } = parseRegionQuery(searchParams.get("region"));
  const paged = searchParams.get("paged") === "1";
  const requestedLimit =
    Number(searchParams.get("limit")) || (paged ? PAGE_SIZE : 80);
  const limit = paged
    ? PAGE_SIZE
    : Math.min(MAX_PAGE_SIZE, Math.max(20, requestedLimit));
  const rawStart = Number(searchParams.get("start"));
  const requestedStart = Number.isFinite(rawStart) ? rawStart : 0;
  const startRank = paged
    ? Math.floor(Math.max(0, requestedStart) / PAGE_SIZE) * PAGE_SIZE + 1
    : Math.max(1, requestedStart || 1);
  const cursorRank = Number(searchParams.get("cursorRank")) || null;
  const cursorId = searchParams.get("cursorId") ?? "";
  const locate = (searchParams.get("locate") ?? "").trim().toUpperCase();
  const search = (searchParams.get("search") ?? "").trim().slice(0, 80);
  const regexSearch = searchParams.get("mode") === "vim";
  const searchPage = normalizeSearchPage(searchParams.get("searchPage"));

  if (scope !== "world" && !regionId) {
    throw new Error("Choose a region before loading rankings.");
  }

  if (regexSearch && search && !isValidRegexPattern(search)) {
    throw new Error("Invalid regular expression.");
  }

  const input = {
    eventId,
    type,
    scope,
    regionId,
    startRank,
    cursorRank,
    cursorId,
    limit,
    locate,
    search,
    regexSearch,
    searchPage,
    paged,
  };
  const isCacheablePage = paged && !search && !locate && !cursorRank && !cursorId;
  return isCacheablePage ? getCachedNormalPage(input) : queryMysql(input);
}

import { query } from "@/db";
import {
  addTimings,
  ApiInputError,
  parseGender,
  parseLimit,
  parseScope,
  parseStart,
  parseYear,
} from "@/lib/api/projection";
import { sqlFragment } from "@/lib/helpers/database/sql";
import type { QueryTimings } from "@/lib/api/projection";
import type { GenderFilter, RegionScope } from "@/lib/wca";
import {
  rankingsWindowCache,
  RANKINGS_WINDOW_SIZE,
} from "@/services/rankings/cache";
import { getCurrentRankingsMetadata } from "@/services/rankings/metadata";
import {
  personCompetitionRankingCountQuery,
  personCompetitionRankingRowsQuery,
} from "@/services/rankings/queries";
import type { PersonCompetitionRankingRow } from "@/services/rankings/types";

const countFormatter = new Intl.NumberFormat("en-US");

type CompetitionInput = {
  scope: RegionScope;
  regionId: string;
  gender: readonly GenderFilter[];
  year: number | null;
  start: number;
  limit: number;
};

type CompetitionWindow = {
  data: { entries: ReturnType<typeof toEntry>[]; total: number };
  timings: QueryTimings;
  queryCount: number;
  returnedRows: number;
};

function parseInput(params: URLSearchParams): CompetitionInput {
  const { scope, regionId } = parseScope(params);
  if (scope !== "world" && !regionId) {
    throw new ApiInputError(
      "Choose a region before loading competition rankings.",
    );
  }
  return {
    scope,
    regionId,
    gender: parseGender(params),
    year: parseYear(params),
    start: parseStart(params),
    limit: parseLimit(params),
  };
}

function toEntry(row: PersonCompetitionRankingRow) {
  const competitionCount = Number(row.competition_count);
  return {
    rank: Number(row.rank),
    position: Number(row.position),
    personId: row.person_id,
    personName: row.person_name,
    countryName: row.country_name,
    countryIso2: row.country_iso2,
    best: competitionCount,
    formattedValue: `${countFormatter.format(competitionCount)} competitions`,
    competitionId: "",
    competitionName: "",
    recordBadges: [],
  };
}

function lazyConditions(input: CompetitionInput) {
  const conditions = ["counts.competition_count > 0"];
  const values: unknown[] = [];
  if (input.year !== null) {
    conditions.push("counts.year = ?");
    values.push(input.year);
  }
  if (input.scope === "continent") {
    conditions.push("country.continent_id = ?");
    values.push(input.regionId);
  }
  if (input.scope === "country") {
    conditions.push("person.country_id = ?");
    values.push(input.regionId);
  }
  if (input.gender.length) {
    conditions.push(
      `counts.person_gender IN (${input.gender.map(() => "?").join(", ")})`,
    );
    values.push(...input.gender);
  }
  return { conditions, values };
}

function lazyDimensionJoins(input: CompetitionInput) {
  if (input.scope === "continent") {
    return `INNER JOIN persons person ON person.wca_id = counts.person_id
        AND person.sub_id = 1
      INNER JOIN countries country ON country.id = person.country_id`;
  }
  if (input.scope === "country") {
    return `INNER JOIN persons person ON person.wca_id = counts.person_id
        AND person.sub_id = 1`;
  }
  return "";
}

function lazySource(input: CompetitionInput) {
  return input.year === null
    ? "person_competition_counts"
    : "person_competition_year_counts";
}

function lazyRowsQuery(input: CompetitionInput) {
  const { conditions } = lazyConditions(input);
  return sqlFragment`WITH filtered AS (
      SELECT counts.person_id, counts.competition_count
      FROM ${lazySource(input)} counts
      ${lazyDimensionJoins(input)}
      WHERE ${conditions.join(" AND ")}
    ), ranked AS (
      SELECT filtered.*,
        RANK() OVER (ORDER BY competition_count DESC) AS rank,
        ROW_NUMBER() OVER (
          ORDER BY competition_count DESC, person_id
        ) AS position
      FROM filtered
    ), page AS (
      SELECT * FROM ranked
      WHERE position >= ? AND position < ?
      ORDER BY position
    )
    SELECT page.*, COALESCE(person.name, page.person_id) AS person_name,
      COALESCE(country.name, person.country_id, '') AS country_name,
      COALESCE(country.iso2, '') AS country_iso2
    FROM page
    LEFT JOIN persons person ON person.wca_id = page.person_id AND person.sub_id = 1
    LEFT JOIN countries country ON country.id = person.country_id
    ORDER BY page.position, page.person_id`;
}

function lazyCountQuery(input: CompetitionInput) {
  const { conditions } = lazyConditions(input);
  return sqlFragment`SELECT COUNT(*) AS count
    FROM ${lazySource(input)} counts
    ${lazyDimensionJoins(input)}
    WHERE ${conditions.join(" AND ")}`;
}

async function loadLazyWindow(
  input: CompetitionInput,
  windowStart: number,
): Promise<CompetitionWindow> {
  const { values } = lazyConditions(input);
  const [rows, counts] = await Promise.all([
    query<PersonCompetitionRankingRow>(lazyRowsQuery(input), [
      ...values,
      windowStart,
      windowStart + RANKINGS_WINDOW_SIZE,
    ]),
    query<{ count: number }>(lazyCountQuery(input), values),
  ]);
  return {
    data: {
      entries: rows.rows.map(toEntry),
      total: Number(counts.rows[0]?.count ?? 0),
    },
    timings: addTimings(rows.timings, counts.timings),
    queryCount: 2,
    returnedRows: rows.rows.length + counts.rows.length,
  };
}

function windowKey(
  input: CompetitionInput,
  windowStart: number,
  dataVersion: string,
) {
  return JSON.stringify({
    dataVersion,
    scope: input.scope,
    regionId: input.regionId,
    gender: input.gender,
    year: input.year,
    windowStart,
  });
}

export async function loadPersonCompetitionRankings(params: URLSearchParams) {
  const input = parseInput(params);
  if (input.year !== null || input.gender.length > 1) {
    const metadata = await getCurrentRankingsMetadata();
    const windowStart =
      Math.floor((input.start - 1) / RANKINGS_WINDOW_SIZE) *
        RANKINGS_WINDOW_SIZE +
      1;
    const cached = (await rankingsWindowCache.getWithStatus(
      windowKey(input, windowStart, metadata.fetchedAt),
      () => loadLazyWindow(input, windowStart),
    )) as {
      value: CompetitionWindow;
      outcome: "hit" | "miss" | "coalesced";
    };
    const offset = input.start - windowStart;
    const entries = cached.value.data.entries.slice(
      offset,
      offset + input.limit,
    );
    const total = cached.value.data.total;
    const startPosition = Math.min(Math.max(0, input.start - 1), total);
    const hasMore = startPosition + entries.length < total;
    return {
      data: {
        entries,
        hasMore,
        nextPageStart: hasMore ? input.start + input.limit : null,
        previousPageStart:
          input.start > 1 && total > 0
            ? Math.max(1, input.start - input.limit)
            : null,
        startPosition,
        lastRank: entries.at(-1)?.rank ?? null,
        total,
      },
      diagnostics: {
        timings:
          cached.outcome === "hit"
            ? { queueMs: 0, statementMs: 0 }
            : cached.value.timings,
        queryCount: cached.value.queryCount,
        returnedRows: cached.value.returnedRows,
        cacheOutcome: cached.outcome,
        cacheLayer: "memory" as const,
      },
    };
  }

  const gender = input.gender[0] ?? "all";
  const [rows, counts] = await Promise.all([
    query<PersonCompetitionRankingRow>(personCompetitionRankingRowsQuery(), [
      input.scope,
      input.regionId,
      gender,
      input.start,
      input.limit + 1,
    ]),
    query<{ count: number }>(personCompetitionRankingCountQuery(), [
      input.scope,
      input.regionId,
      gender,
    ]),
  ]);
  const pageRows = rows.rows.slice(0, input.limit);
  const last = pageRows.at(-1);
  return {
    data: {
      entries: pageRows.map(toEntry),
      hasMore: rows.rows.length > input.limit,
      nextPageStart:
        rows.rows.length > input.limit && last
          ? Number(last.position) + 1
          : null,
      previousPageStart:
        input.start > 1 ? Math.max(1, input.start - input.limit) : null,
      startPosition: Number(pageRows[0]?.position ?? input.start) - 1,
      lastRank: last ? Number(last.rank) : null,
      total: Number(counts.rows[0]?.count ?? 0),
    },
    diagnostics: {
      timings: addTimings(rows.timings, counts.timings),
      queryCount: 2,
      returnedRows: rows.rows.length + counts.rows.length,
    },
  };
}

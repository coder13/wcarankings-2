import { query } from "@/db";
import {
  addTimings,
  ApiInputError,
  parseGender,
  parseEvent,
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
import { getProjectionFeatureSwitch } from "@/lib/projection-feature-switch";
import { loadPersonCompetitionRankings } from "@/services/rankings/person-competitions";
import { getCurrentRankingsMetadata } from "@/services/rankings/metadata";

const countFormatter = new Intl.NumberFormat("en-US");

export const PERSON_ACTIVITY_METRICS = [
  "competitions",
  "countries",
  "rounds",
  "solves",
] as const;

export type PersonActivityMetric = (typeof PERSON_ACTIVITY_METRICS)[number];

type PersonActivityInput = {
  metric: PersonActivityMetric;
  scope: RegionScope;
  regionId: string;
  gender: readonly GenderFilter[];
  start: number;
  limit: number;
  year: number | null;
  eventId: string | null;
};

type PersonActivityRankingRow = {
  metric_value: number;
  person_id: string;
  person_name: string;
  country_name: string;
  country_iso2: string;
  rank: number;
  position: number;
};

interface PersonActivityWindow extends Record<string, unknown> {
  data: { entries: ReturnType<typeof toEntry>[]; total: number };
  timings: QueryTimings;
  queryCount: number;
  returnedRows: number;
}

function isPersonActivityWindow(
  value: Record<string, unknown>,
): value is PersonActivityWindow {
  if (typeof value.data !== "object" || value.data === null) return false;
  return (
    "entries" in value.data &&
    Array.isArray(value.data.entries) &&
    "total" in value.data &&
    Number.isFinite(Number(value.data.total))
  );
}

const metricColumn: Record<PersonActivityMetric, string> = {
  competitions: "competition_count",
  countries: "country_count",
  rounds: "round_count",
  solves: "official_solve_count",
};

export function parsePersonActivityMetric(
  params: URLSearchParams,
): PersonActivityMetric {
  const value = params.get("metric") ?? "competitions";
  if (!PERSON_ACTIVITY_METRICS.includes(value as PersonActivityMetric)) {
    throw new ApiInputError(
      "metric must be competitions, countries, rounds, or solves.",
    );
  }
  return value as PersonActivityMetric;
}

function parseInput(params: URLSearchParams): PersonActivityInput {
  const { scope, regionId } = parseScope(params);
  if (scope !== "world" && !regionId) {
    throw new ApiInputError(
      "Choose a region before loading activity rankings.",
    );
  }
  return {
    metric: parsePersonActivityMetric(params),
    scope,
    regionId,
    gender: parseGender(params),
    start: parseStart(params),
    limit: parseLimit(params),
    year: parseYear(params),
    eventId: parseEvent(params, { required: false }),
  };
}

function toEntry(input: PersonActivityInput, row: PersonActivityRankingRow) {
  const value = Number(row.metric_value);
  return {
    rank: Number(row.rank),
    position: Number(row.position),
    personId: row.person_id,
    personName: row.person_name,
    countryName: row.country_name,
    countryIso2: row.country_iso2,
    best: value,
    formattedValue: countFormatter.format(value),
    competitionId: "",
    competitionName: "",
    recordBadges: [],
  };
}

function lazyConditions(input: PersonActivityInput) {
  const conditions = [`counts.${metricColumn[input.metric]} > 0`];
  const values: unknown[] = [];
  if (input.year !== null) {
    conditions.push("counts.year = ?");
    values.push(input.year);
  }
  if (input.eventId) {
    conditions.push("counts.event_id = ?");
    values.push(input.eventId);
    if (input.year === null) {
      conditions.push("counts.year = 0");
    }
  }
  if (input.scope === "continent") {
    conditions.push("counts.continent_id = ?");
    values.push(input.regionId);
  }
  if (input.scope === "country") {
    conditions.push("counts.country_id = ?");
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

function countsTable(input: PersonActivityInput) {
  if (input.eventId) return "person_activity_event_counts";
  if (input.year !== null) return "person_activity_year_counts";
  return "person_activity_counts";
}

function lazyRowsQuery(input: PersonActivityInput) {
  const { conditions } = lazyConditions(input);
  const valueColumn = metricColumn[input.metric];
  return sqlFragment`WITH filtered AS (
      SELECT counts.person_id, counts.${valueColumn} AS metric_value
      FROM ${countsTable(input)} counts
      WHERE ${conditions.join(" AND ")}
    ), ranked AS (
      SELECT filtered.*,
        RANK() OVER (ORDER BY metric_value DESC) AS rank,
        ROW_NUMBER() OVER (
          ORDER BY metric_value DESC, person_id
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

function lazyCountQuery(input: PersonActivityInput) {
  const { conditions } = lazyConditions(input);
  return sqlFragment`SELECT COUNT(*) AS count
    FROM ${countsTable(input)} counts
    WHERE ${conditions.join(" AND ")}`;
}

async function loadLazyWindow(
  input: PersonActivityInput,
  windowStart: number,
): Promise<PersonActivityWindow> {
  const { values } = lazyConditions(input);
  const [rows, counts] = await Promise.all([
    query<PersonActivityRankingRow>(lazyRowsQuery(input), [
      ...values,
      windowStart,
      windowStart + RANKINGS_WINDOW_SIZE,
    ]),
    query<{ count: number }>(lazyCountQuery(input), values),
  ]);
  return {
    data: {
      entries: rows.rows.map((row) => toEntry(input, row)),
      total: Number(counts.rows[0]?.count ?? 0),
    },
    timings: addTimings(rows.timings, counts.timings),
    queryCount: 2,
    returnedRows: rows.rows.length + counts.rows.length,
  };
}

function windowKey(
  input: PersonActivityInput,
  windowStart: number,
  dataVersion: string,
) {
  return JSON.stringify({
    dataVersion,
    metric: input.metric,
    scope: input.scope,
    regionId: input.regionId,
    gender: input.gender,
    windowStart,
  });
}

export async function loadPersonActivityRankings(params: URLSearchParams) {
  const input = parseInput(params);
  if (input.metric === "competitions") {
    if (input.eventId) {
      throw new ApiInputError("eventId is only available for rounds and solves.");
    }
    return loadPersonCompetitionRankings(params);
  }
  if (input.eventId && input.metric === "countries") {
    throw new ApiInputError("eventId is only available for rounds and solves.");
  }
  const featureSwitch = await getProjectionFeatureSwitch();
  if (!featureSwitch.personActivityRankings || !featureSwitch.generationId) {
    throw new Error("Person activity rankings are unavailable.");
  }
  const metadata = await getCurrentRankingsMetadata();
  if (input.year !== null || input.eventId || input.scope !== "world" || input.gender.length) {
    const windowStart =
      Math.floor((input.start - 1) / RANKINGS_WINDOW_SIZE) *
        RANKINGS_WINDOW_SIZE +
      1;
    const cached = await rankingsWindowCache.getWithStatus(
      windowKey(input, windowStart, featureSwitch.generationId),
      () => loadLazyWindow(input, windowStart),
    );
    if (!isPersonActivityWindow(cached.value)) {
      throw new Error(
        "The person activity window cache returned invalid data.",
      );
    }
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
        availableYears: metadata.availableYears,
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

  const [rows, counts] = await Promise.all([
    query<PersonActivityRankingRow>(
      `WITH page AS (
        SELECT ranking.person_id, ranking.metric_value, ranking.rank, ranking.position
        FROM person_activity_rankings ranking
        WHERE ranking.metric = ? AND ranking.scope = 'world'
          AND ranking.region_id = '' AND ranking.gender = 'all'
          AND ranking.position >= ?
        ORDER BY ranking.position, ranking.person_id
        LIMIT ?
      )
      SELECT page.*, COALESCE(person.name, page.person_id) AS person_name,
        COALESCE(country.name, person.country_id, '') AS country_name,
        COALESCE(country.iso2, '') AS country_iso2
      FROM page
      LEFT JOIN persons person ON person.wca_id = page.person_id AND person.sub_id = 1
      LEFT JOIN countries country ON country.id = person.country_id
      ORDER BY page.position, page.person_id`,
      [input.metric, input.start, input.limit + 1],
    ),
    query<{ count: number }>(
      `SELECT count FROM person_activity_ranking_counts
       WHERE metric = ? AND scope = 'world' AND region_id = '' AND gender = 'all'`,
      [input.metric],
    ),
  ]);
  const pageRows = rows.rows.slice(0, input.limit);
  const last = pageRows.at(-1);
  return {
    data: {
      entries: pageRows.map((row) => toEntry(input, row)),
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
      availableYears: metadata.availableYears,
    },
    diagnostics: {
      timings: addTimings(rows.timings, counts.timings),
      queryCount: 2,
      returnedRows: rows.rows.length + counts.rows.length,
    },
  };
}

import { query } from "@/db";
import { getCurrentRankingsMetadata } from "@/services/rankings/metadata";
import {
  WCA_EVENTS,
  formatWcaResult,
  type RankingType,
  type RegionScope,
} from "@/lib/wca";
import { fetchPersonThumbnailsFromWca } from "@/services/thumbnails/wca-person-thumbnails";

export type PersonProfileResult = {
  resultType: RankingType;
  resultId: number;
  value: number;
  formatted: string;
  worldRank: number;
  continentRank: number;
  countryRank: number;
  competitionId: string;
  competitionName: string;
  competitionStartDate: string;
};

export type PersonProfileMetricValue = {
  resultType: RankingType;
  eventId: string;
  eventRank: number;
  kinchValue: number | null;
};

export type PersonProfileMetricScore = {
  resultType: RankingType;
  scope: RegionScope;
  regionId: string;
  score: number;
  rank: number;
  coverage: number;
  requiredCoverage: number;
  kinchScore: number;
  kinchRank: number;
  kinchCoverage: number;
};

export type PersonProfile = {
  person: {
    id: string;
    name: string;
    countryId: string;
    countryName: string;
    countryIso2: string;
    continentId: string;
    continentName: string;
    avatarUrl: string | null;
  };
  exportDate: string | null;
  fetchedAt: string;
  eventRows: Array<{
    eventId: string;
    eventName: string;
    eventShortName: string;
    single: PersonProfileResult | null;
    average: PersonProfileResult | null;
    singleMetric: PersonProfileMetricValue | null;
    averageMetric: PersonProfileMetricValue | null;
  }>;
  metricScores: PersonProfileMetricScore[];
};

type IdentityRow = {
  wca_id: string;
  name: string;
  country_id: string;
  country_name: string;
  country_iso2: string;
  continent_id: string;
  continent_name: string;
  avatar_url: string | null;
};

type ResultRow = {
  event_id: string;
  result_type: RankingType;
  result_id: number;
  result_value: number;
  world_rank: number;
  continent_rank: number;
  country_rank: number;
  competition_id: string;
  competition_name: string;
  competition_start_date: string;
};

type MetricValueRow = {
  result_type: RankingType;
  event_id: string;
  event_rank: number;
  kinch_value: string | number | null;
};

type MetricScoreRow = {
  result_type: RankingType;
  scope: RegionScope;
  region_id: string;
  score: number;
  rank: number;
  coverage: number;
  required_coverage: number;
  kinch_score: string | number;
  kinch_rank: number;
  kinch_coverage: number;
};

const WCA_ID_PATTERN = /^\d{4}[A-Z]{4}\d{2}$/;

function isMissingTableError(error: unknown) {
  return (error as { code?: string }).code === "ER_NO_SUCH_TABLE";
}

async function optionalRows<T extends Record<string, unknown>>(
  statement: string,
  values: unknown[],
) {
  try {
    return (await query<T>(statement, values)).rows;
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
}

export function normalizeProfileWcaId(value: string) {
  const wcaId = value.trim().toUpperCase();
  return WCA_ID_PATTERN.test(wcaId) ? wcaId : null;
}

function metricKey(resultType: RankingType, eventId: string) {
  return `${resultType}:${eventId}`;
}

function scoreNumber(value: string | number | null) {
  if (value === null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function rankingHref({
  eventId,
  resultType,
  scope = "world",
  regionId = "",
  wcaId,
}: {
  eventId: string;
  resultType: RankingType;
  scope?: RegionScope;
  regionId?: string;
  wcaId: string;
}) {
  const params = new URLSearchParams();
  if (eventId !== "333") params.set("eventId", eventId);
  if (resultType !== "single" && eventId !== "333mbf")
    params.set("result", resultType);
  if (scope !== "world" && regionId) params.set("region", regionId);
  params.set("wcaId", wcaId);
  const query = params.toString();
  return query ? `/?${query}` : "/";
}

export function metricHref({
  metric,
  resultType,
  scope = "world",
  regionId = "",
  wcaId,
}: {
  metric: "SOR" | "sor-kinch";
  resultType: RankingType;
  scope?: RegionScope;
  regionId?: string;
  wcaId: string;
}) {
  const params = new URLSearchParams({ eventId: metric, wcaId });
  if (metric === "SOR" && resultType === "average")
    params.set("result", "average");
  if (scope !== "world" && regionId) params.set("region", regionId);
  return `/?${params.toString()}`;
}

export async function loadPersonProfile(
  wcaId: string,
): Promise<PersonProfile | null> {
  const normalized = normalizeProfileWcaId(wcaId);
  if (!normalized) return null;

  const metadataPromise = getCurrentRankingsMetadata();
  const identityPromise = query<IdentityRow>(
    `SELECT person.wca_id, COALESCE(person.name, person.wca_id) AS name,
       COALESCE(country.id, '') AS country_id,
       COALESCE(country.name, country.id, '') AS country_name,
       COALESCE(country.iso2, '') AS country_iso2,
       COALESCE(country.continent_id, '') AS continent_id,
       COALESCE(continent.name, country.continent_id, '') AS continent_name,
       app_user.avatar_url
     FROM persons person
     LEFT JOIN countries country ON country.id = person.country_id
     LEFT JOIN continents continent ON continent.id = country.continent_id
     LEFT JOIN app_users app_user ON app_user.wca_id = person.wca_id
     WHERE person.wca_id = ? AND person.sub_id = 1
     LIMIT 1`,
    [normalized],
  );
  const personEventResultsPromise = optionalRows<ResultRow>(
    `SELECT ranking.event_id, ranking.result_type, ranking.result_id,
       ranking.result_value, ranking.world_rank, ranking.continent_rank,
       ranking.country_rank, COALESCE(facts.competition_id, '') AS competition_id,
       COALESCE(competition.name, facts.competition_id, '') AS competition_name,
       COALESCE(facts.competition_start_date, '') AS competition_start_date
     FROM person_event_rankings ranking
     LEFT JOIN result_facts facts ON facts.result_id = ranking.result_id
     LEFT JOIN competitions competition ON competition.id = facts.competition_id
     WHERE ranking.person_id = ?
     ORDER BY ranking.event_id, ranking.result_type`,
    [normalized],
  );
  const rankingEntriesResultsPromise = optionalRows<ResultRow>(
    `SELECT event_id, 'single' AS result_type, 0 AS result_id, best AS result_value,
       world_rank, continent_rank, country_rank,
       COALESCE(competition_id, '') AS competition_id,
       COALESCE(competition_name, '') AS competition_name,
       '' AS competition_start_date
     FROM ranking_entries_single
     WHERE person_id = ?
     UNION ALL
     SELECT event_id, 'average' AS result_type, 0 AS result_id, best AS result_value,
       world_rank, continent_rank, country_rank,
       COALESCE(competition_id, '') AS competition_id,
       COALESCE(competition_name, '') AS competition_name,
       '' AS competition_start_date
     FROM ranking_entries_average
     WHERE person_id = ?
     ORDER BY event_id, result_type`,
    [normalized, normalized],
  );
  const metricValuesPromise = optionalRows<MetricValueRow>(
    `SELECT ranking.result_type, ranking.event_id,
       ranking.world_rank AS event_rank,
       CASE
         WHEN ranking.event_id = '333mbf' THEN NULL
         ELSE CAST(100.0 * reference.result_value / ranking.result_value AS DECIMAL(18, 6))
       END AS kinch_value
     FROM person_event_rankings ranking
     INNER JOIN person_event_rankings reference
       ON reference.event_id = ranking.event_id
      AND reference.result_type = ranking.result_type
      AND reference.world_position = 1
     WHERE ranking.person_id = ?
       AND ranking.event_id IN (
         '333', '222', '444', '555', '666', '777', '333bf', '333fm',
         '333oh', 'clock', 'minx', 'pyram', 'skewb', 'sq1', '444bf',
         '555bf', '333mbf'
       )
     ORDER BY ranking.result_type, ranking.event_id`,
    [normalized],
  );
  const metricScoresPromise = optionalRows<MetricScoreRow>(
    `SELECT result_type, scope, region_id, score, rank, coverage,
       required_coverage, kinch_score, kinch_rank, kinch_coverage
     FROM person_sum_of_ranks_scores
     WHERE metric_version = 1 AND event_set_version = 1
       AND person_id = ?
     ORDER BY result_type, FIELD(scope, 'world', 'continent', 'country')`,
    [normalized],
  );

  const thumbPromise = fetchPersonThumbnailsFromWca(
    normalized,
    [normalized],
    1,
    1,
  ).catch(() => new Map<string, string | null>());
  const [
    metadata,
    identity,
    personEventResults,
    rankingEntriesResults,
    metricValues,
    metricScores,
    thumbs,
  ] = await Promise.all([
    metadataPromise,
    identityPromise,
    personEventResultsPromise,
    rankingEntriesResultsPromise,
    metricValuesPromise,
    metricScoresPromise,
    thumbPromise,
  ]);
  const person = identity.rows[0];
  if (!person) return null;
  const resultRows = personEventResults.length
    ? personEventResults
    : rankingEntriesResults;

  const resultByKey = new Map(
    resultRows.map((row) => [
      metricKey(row.result_type, row.event_id),
      {
        resultType: row.result_type,
        resultId: Number(row.result_id),
        value: Number(row.result_value),
        formatted: formatWcaResult(
          row.event_id,
          Number(row.result_value),
          row.result_type,
        ),
        worldRank: Number(row.world_rank),
        continentRank: Number(row.continent_rank),
        countryRank: Number(row.country_rank),
        competitionId: row.competition_id,
        competitionName: row.competition_name,
        competitionStartDate: row.competition_start_date,
      } satisfies PersonProfileResult,
    ]),
  );
  const metricByKey = new Map(
    metricValues.map((row) => [
      metricKey(row.result_type, row.event_id),
      {
        resultType: row.result_type,
        eventId: row.event_id,
        eventRank: Number(row.event_rank),
        kinchValue: scoreNumber(row.kinch_value),
      } satisfies PersonProfileMetricValue,
    ]),
  );

  return {
    person: {
      id: person.wca_id,
      name: person.name,
      countryId: person.country_id,
      countryName: person.country_name,
      countryIso2: person.country_iso2,
      continentId: person.continent_id,
      continentName: person.continent_name,
      avatarUrl: thumbs.get(person.wca_id) ?? person.avatar_url,
    },
    exportDate: metadata.exportDate,
    fetchedAt: metadata.fetchedAt,
    eventRows: WCA_EVENTS.map((event) => ({
      eventId: event.id,
      eventName: event.name,
      eventShortName: event.shortName,
      single: resultByKey.get(metricKey("single", event.id)) ?? null,
      average:
        event.id === "333mbf"
          ? null
          : (resultByKey.get(metricKey("average", event.id)) ?? null),
      singleMetric: metricByKey.get(metricKey("single", event.id)) ?? null,
      averageMetric:
        event.id === "333mbf"
          ? null
          : (metricByKey.get(metricKey("average", event.id)) ?? null),
    })),
    metricScores: metricScores.map((row) => ({
      resultType: row.result_type,
      scope: row.scope,
      regionId: row.region_id,
      score: Number(row.score),
      rank: Number(row.rank),
      coverage: Number(row.coverage),
      requiredCoverage: Number(row.required_coverage),
      kinchScore: Number(row.kinch_score),
      kinchRank: Number(row.kinch_rank),
      kinchCoverage: Number(row.kinch_coverage),
    })),
  };
}

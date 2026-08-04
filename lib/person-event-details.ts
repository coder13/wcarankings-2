import { query } from "@/db";
import {
  formatWcaResult,
  isEventId,
  WCA_EVENTS,
  type RankingType,
} from "@/lib/wca";
import { normalizeProfileWcaId } from "@/lib/person-profile";

export type PersonEventAttempt = {
  index: number;
  value: number;
  formatted: string;
  counted: boolean;
};

export type PersonEventBest = {
  resultType: RankingType;
  value: number;
  formatted: string;
  worldRank: number | null;
  continentRank: number | null;
  countryRank: number | null;
  competitionId: string;
  competitionName: string;
  competitionDate: string;
  roundTypeId: string;
  attempts: PersonEventAttempt[];
};

export type PersonEventDetails = {
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
  event: {
    id: string;
    name: string;
    shortName: string;
  };
  single: PersonEventBest | null;
  average: PersonEventBest | null;
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

type RankRow = {
  best: number;
  world_rank: number;
  continent_rank: number;
  country_rank: number;
};

type BestResultRow = {
  result_id: number;
  value: number;
  competition_id: string;
  competition_name: string;
  competition_date: string;
  round_type_id: string;
};

type AttemptRow = {
  attempt_number: number;
  value: number;
};

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

function rankingTable(resultType: RankingType) {
  return resultType === "average"
    ? "ranking_entries_average"
    : "ranking_entries_single";
}

async function loadRankContext(
  personId: string,
  eventId: string,
  resultType: RankingType,
) {
  const rows = await optionalRows<RankRow>(
    `SELECT best, world_rank, continent_rank, country_rank
     FROM ${rankingTable(resultType)}
     WHERE person_id = ? AND event_id = ?
     LIMIT 1`,
    [personId, eventId],
  );
  return rows[0] ?? null;
}

function averageCountedAttemptNumbers(attempts: AttemptRow[]) {
  const values = attempts.filter((attempt) => attempt.value !== 0);
  const positive = values.filter((attempt) => attempt.value > 0);
  if (positive.length < 4) return new Set<number>();
  const best = positive.reduce((current, attempt) =>
    attempt.value < current.value ? attempt : current,
  );
  const worst = values.reduce((current, attempt) => {
    if (attempt.value < 0 && current.value > 0) return attempt;
    if (attempt.value > 0 && current.value > 0 && attempt.value > current.value)
      return attempt;
    return current;
  });
  return new Set(
    values
      .filter(
        (attempt) =>
          attempt.attempt_number !== best.attempt_number &&
          attempt.attempt_number !== worst.attempt_number,
      )
      .map((attempt) => attempt.attempt_number),
  );
}

function formatAttempts(
  rows: AttemptRow[],
  best: number,
  eventId: string,
  resultType: RankingType,
) {
  const values = rows.filter((attempt) => attempt.value !== 0);
  const counted =
    resultType === "average"
      ? averageCountedAttemptNumbers(values)
      : new Set<number>([
          values.find((attempt) => attempt.value === best)?.attempt_number ?? 0,
        ]);
  return values.map((value, index) => ({
    index: value.attempt_number || index + 1,
    value: Number(value.value),
    formatted: formatWcaResult(eventId, Number(value.value), "single"),
    counted: counted.has(value.attempt_number),
  }));
}

async function loadAttempts(resultId: number) {
  return optionalRows<AttemptRow>(
    `SELECT attempt_number, value
     FROM result_attempts
     WHERE result_id = ?
     ORDER BY attempt_number`,
    [resultId],
  );
}

async function loadBestResult(
  personId: string,
  eventId: string,
  resultType: RankingType,
) {
  const valueColumn = resultType === "average" ? "average" : "best";
  const rows = await query<BestResultRow>(
    `SELECT result.id AS result_id, result.${valueColumn} AS value, result.competition_id,
       COALESCE(competition.name, result.competition_id) AS competition_name,
       STR_TO_DATE(CONCAT(competition.year, '-', LPAD(competition.month, 2, '0'), '-', LPAD(competition.day, 2, '0')), '%Y-%m-%d') AS competition_date,
       result.round_type_id
     FROM results result
     LEFT JOIN competitions competition ON competition.id = result.competition_id
     WHERE result.person_id = ? AND result.event_id = ? AND result.${valueColumn} > 0
     ORDER BY result.${valueColumn}, competition.year, competition.month, competition.day,
       result.competition_id, result.id
     LIMIT 1`,
    [personId, eventId],
  );
  const row = rows.rows[0];
  if (!row) return null;
  const [rank, attemptRows] = await Promise.all([
    loadRankContext(personId, eventId, resultType),
    loadAttempts(Number(row.result_id)),
  ]);
  return {
    resultType,
    value: Number(row.value),
    formatted: formatWcaResult(eventId, Number(row.value), resultType),
    worldRank: rank ? Number(rank.world_rank) : null,
    continentRank: rank ? Number(rank.continent_rank) : null,
    countryRank: rank ? Number(rank.country_rank) : null,
    competitionId: row.competition_id,
    competitionName: row.competition_name,
    competitionDate: row.competition_date,
    roundTypeId: row.round_type_id,
    attempts: formatAttempts(
      attemptRows,
      Number(row.value),
      eventId,
      resultType,
    ),
  } satisfies PersonEventBest;
}

export async function loadPersonEventDetails(
  personId: string,
  eventId: string,
) {
  const normalizedPersonId = normalizeProfileWcaId(personId);
  if (!normalizedPersonId || !isEventId(eventId)) return null;
  const event = WCA_EVENTS.find((entry) => entry.id === eventId);
  if (!event) return null;
  const identity = await query<IdentityRow>(
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
    [normalizedPersonId],
  );
  const person = identity.rows[0];
  if (!person) return null;
  const [single, average] = await Promise.all([
    loadBestResult(normalizedPersonId, eventId, "single"),
    eventId === "333mbf"
      ? Promise.resolve(null)
      : loadBestResult(normalizedPersonId, eventId, "average"),
  ]);
  return {
    person: {
      id: person.wca_id,
      name: person.name,
      countryId: person.country_id,
      countryName: person.country_name,
      countryIso2: person.country_iso2,
      continentId: person.continent_id,
      continentName: person.continent_name,
      avatarUrl: person.avatar_url,
    },
    event: {
      id: event.id,
      name: event.name,
      shortName: event.shortName,
    },
    single,
    average,
  } satisfies PersonEventDetails;
}

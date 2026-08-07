import { query as defaultQuery } from "@/db";
import type {
  FeedTopFiveChange,
  FeedTopFiveRow,
  RankingFeedCandidate,
} from "./types";

const MAX_TRIGGER_ROWS = 50;
const MAX_EVENT_IDS = 12;
const DEFAULT_TRIGGER_DAYS = 7;

type FeedQuery = (
  text: string,
  values?: unknown[],
) => Promise<{ rows: Record<string, unknown>[] }>;

export type RecentCompetitionTrigger = {
  competitionId: string;
  competitionName: string;
  countryId: string;
  cityName?: string;
  endDate: string;
  eventIds: string[];
  hasCountryRecord: boolean;
  countryRecordEventIds: string[];
};

export type RecentResultReference = {
  resultId: number;
  eventId: string;
  competitionId: string;
  personId: string;
  countryId: string;
  continentId: string;
  cityName?: string;
  gender: "m" | "f" | "o" | null;
};

type RecentChangeMeasurement = {
  triggerQueryMs: number;
  candidatePathMs: number;
  triggerCount: number;
  candidateCount: number;
};

export type RecentTriggerOptions = {
  now?: Date;
  triggerDays?: number;
  triggerLimit?: number;
  query?: FeedQuery;
};

export type PrecomputeRecentChangeCandidatesOptions = RecentTriggerOptions & {
  candidates?: readonly RankingFeedCandidate[];
  onMeasure?: (measurement: RecentChangeMeasurement) => void;
};

type TriggerRow = {
  competition_id: string;
  competition_name: string;
  country_id: string;
  city_name: string;
  end_year: number | string;
  end_month: number | string;
  end_day: number | string;
  event_id: string | null;
  has_country_record: number | boolean;
};

type RecentResultRow = {
  result_id: number | string;
  event_id: string;
  person_id: string;
  competition_id: string;
  country_id: string | null;
  continent_id: string | null;
  city_name: string | null;
  gender: string | null;
};

function utcDate(value: Date) {
  if (!Number.isFinite(value.getTime())) {
    throw new Error("The feed requires a valid time.");
  }
  return value.toISOString().slice(0, 10);
}

function daysBefore(date: string, days: number) {
  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() - days + 1);
  return result.toISOString().slice(0, 10);
}

function positiveLimit(value: number | undefined) {
  const limit = value ?? MAX_TRIGGER_ROWS;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_TRIGGER_ROWS) {
    throw new Error(
      `The feed trigger limit must be from 1 to ${MAX_TRIGGER_ROWS}.`,
    );
  }
  return limit;
}

function positiveDays(value: number | undefined) {
  const days = value ?? DEFAULT_TRIGGER_DAYS;
  if (!Number.isInteger(days) || days < 1 || days > 30) {
    throw new Error("The feed trigger window must be from 1 to 30 days.");
  }
  return days;
}

function recentCompetitionTriggersQuery() {
  return `
    SELECT competition.id AS competition_id, competition.name AS competition_name,
      competition.country_id, competition.city_name, competition.end_year,
      competition.end_month, competition.end_day, result.event_id,
      MAX(
        current_single.result_id IS NOT NULL OR
        current_average.result_id IS NOT NULL
      ) AS has_country_record
    FROM competitions competition
    LEFT JOIN results result ON result.competition_id = competition.id
    LEFT JOIN result_rankings_single current_single
      ON current_single.result_id = result.id
      AND current_single.event_id = result.event_id
      AND current_single.country_rank = 1
    LEFT JOIN result_rankings_average current_average
      ON current_average.result_id = result.id
      AND current_average.event_id = result.event_id
      AND current_average.country_rank = 1
    WHERE STR_TO_DATE(CONCAT(competition.end_year, '-',
      LPAD(competition.end_month, 2, '0'), '-', LPAD(competition.end_day, 2, '0')),
      '%Y-%m-%d') BETWEEN ? AND ?
    GROUP BY competition.id, competition.name, competition.country_id,
      competition.city_name, competition.end_year, competition.end_month,
      competition.end_day, result.event_id
    ORDER BY has_country_record DESC, competition.end_year DESC,
      competition.end_month DESC, competition.end_day DESC,
      competition.id, result.event_id
    LIMIT ?
  `;
}

export async function discoverRecentCompetitionTriggers(
  options: RecentTriggerOptions = {},
) {
  const now = options.now ?? new Date();
  const endDate = utcDate(now);
  const startedAt = performance.now();
  const result = await (options.query ?? defaultQuery)(
    recentCompetitionTriggersQuery(),
    [
      daysBefore(endDate, positiveDays(options.triggerDays)),
      endDate,
      positiveLimit(options.triggerLimit),
    ],
  );
  const triggers = new Map<string, RecentCompetitionTrigger>();
  for (const raw of result.rows as unknown as TriggerRow[]) {
    const eventId = raw.event_id?.trim();
    const competitionId = String(raw.competition_id);
    const existing = triggers.get(competitionId);
    if (existing) {
      if (eventId && existing.eventIds.length < MAX_EVENT_IDS) {
        existing.eventIds.push(eventId);
      }
      existing.hasCountryRecord =
        existing.hasCountryRecord || Boolean(raw.has_country_record);
      if (
        eventId &&
        raw.has_country_record &&
        !existing.countryRecordEventIds.includes(eventId)
      ) {
        existing.countryRecordEventIds.push(eventId);
      }
      continue;
    }
    triggers.set(competitionId, {
      competitionId,
      competitionName: String(raw.competition_name ?? competitionId),
      countryId: String(raw.country_id ?? ""),
      cityName: String(raw.city_name ?? ""),
      endDate: [raw.end_year, raw.end_month, raw.end_day]
        .map((value) => String(value).padStart(2, "0"))
        .join("-"),
      eventIds: eventId ? [eventId] : [],
      hasCountryRecord: Boolean(raw.has_country_record),
      countryRecordEventIds: eventId && raw.has_country_record ? [eventId] : [],
    });
  }
  return {
    triggers: [...triggers.values()],
    triggerQueryMs: performance.now() - startedAt,
  };
}

export async function discoverRecentResultReferences(
  options: RecentTriggerOptions = {},
) {
  const now = options.now ?? new Date();
  const endDate = utcDate(now);
  const startedAt = performance.now();
  const result = await (options.query ?? defaultQuery)(
    `SELECT DISTINCT result.id AS result_id, result.event_id,
       result.person_id, result.competition_id, competition.country_id, competition.city_name, country.continent_id,
       person.gender
     FROM results result
     INNER JOIN competitions competition ON competition.id = result.competition_id
     LEFT JOIN countries country ON country.id = competition.country_id
     LEFT JOIN persons person ON person.wca_id = result.person_id AND person.sub_id = 1
     WHERE STR_TO_DATE(CONCAT(competition.end_year, '-',
       LPAD(competition.end_month, 2, '0'), '-', LPAD(competition.end_day, 2, '0')),
       '%Y-%m-%d') BETWEEN ? AND ?`,
    [daysBefore(endDate, positiveDays(options.triggerDays)), endDate],
  );
  const references = (result.rows as unknown as RecentResultRow[]).map(
    (row): RecentResultReference => ({
      resultId: Number(row.result_id),
      eventId: row.event_id,
      competitionId: String(row.competition_id),
      personId: row.person_id,
      countryId: String(row.country_id ?? ""),
      continentId: String(row.continent_id ?? ""),
      cityName: String(row.city_name ?? ""),
      gender:
        row.gender === "m" || row.gender === "f" || row.gender === "o"
          ? row.gender
          : null,
    }),
  );
  return { references, resultQueryMs: performance.now() - startedAt };
}

export function compareFeedTopFive(
  previousTopFive: readonly FeedTopFiveRow[],
  currentTopFive: readonly FeedTopFiveRow[],
): FeedTopFiveChange | null {
  const previous = new Map(previousTopFive.map((row) => [row.entityId, row]));
  const entered = currentTopFive.find((row) => !previous.has(row.entityId));
  const left = previousTopFive.find(
    (row) =>
      !currentTopFive.some((current) => current.entityId === row.entityId),
  );
  const leaderChanged =
    previousTopFive[0]?.entityId !== currentTopFive[0]?.entityId;
  if (leaderChanged && currentTopFive[0])
    return {
      type: "leader",
      previousTopFive: [...previousTopFive],
      currentTopFive: [...currentTopFive],
      focusEntityId: currentTopFive[0].entityId,
      summary: `The leader changed to ${currentTopFive[0].entityId}.`,
    };
  if (entered)
    return {
      type: "enter",
      previousTopFive: [...previousTopFive],
      currentTopFive: [...currentTopFive],
      focusEntityId: entered.entityId,
      summary: `${entered.entityId} entered the top five.`,
    };
  if (left)
    return {
      type: "leave",
      previousTopFive: [...previousTopFive],
      currentTopFive: [...currentTopFive],
      focusEntityId: left.entityId,
      summary: `${left.entityId} left the top five.`,
    };
  const moved = currentTopFive.find(
    (row) => previous.get(row.entityId)?.rank !== row.rank,
  );
  if (moved)
    return {
      type: "move",
      previousTopFive: [...previousTopFive],
      currentTopFive: [...currentTopFive],
      focusEntityId: moved.entityId,
      summary: `${moved.entityId} moved to rank ${moved.rank}.`,
    };
  const changedValue = currentTopFive.find(
    (row) => previous.get(row.entityId)?.value !== row.value,
  );
  if (changedValue)
    return {
      type: "value",
      previousTopFive: [...previousTopFive],
      currentTopFive: [...currentTopFive],
      focusEntityId: changedValue.entityId,
      summary: `${changedValue.entityId} changed its displayed value.`,
    };
  return null;
}

export function precomputeInjectedCandidates(
  candidates: readonly RankingFeedCandidate[],
) {
  return candidates.filter((candidate) => candidate.change !== undefined);
}

export async function precomputeRecentChangeCandidates(
  options: PrecomputeRecentChangeCandidatesOptions = {},
) {
  const discovered = await discoverRecentCompetitionTriggers(options);
  const startedAt = performance.now();
  const candidates = precomputeInjectedCandidates(options.candidates ?? []);
  options.onMeasure?.({
    triggerQueryMs: discovered.triggerQueryMs,
    candidatePathMs: performance.now() - startedAt,
    triggerCount: discovered.triggers.length,
    candidateCount: candidates.length,
  });
  return { triggers: discovered.triggers, candidates };
}

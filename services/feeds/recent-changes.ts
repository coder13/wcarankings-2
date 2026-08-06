import { query as defaultQuery } from "@/db";
import { cityPopularityDescriptor } from "@/services/ranking-popularity/city-rankings";
import { competitionPopularityDescriptor } from "@/services/ranking-popularity/competition-rankings";
import { globalRankingPopularityDescriptor } from "@/services/ranking-popularity/global-rankings";
import { resultRankingPopularityDescriptor } from "@/services/ranking-popularity/result-rankings";
import {
  rankingListDescriptorUrl,
  rankingListKey,
} from "@/lib/ranking-list-descriptor";
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
  cityName: string;
  endDate: string;
  eventIds: string[];
};

export type RecentChangeCandidate = RankingFeedCandidate & {
  trigger: { competitionId: string; competitionName: string; endDate: string };
  topFiveChange: FeedTopFiveChange;
};

type RecentChangeMeasurement = {
  triggerQueryMs: number;
  candidateBuildMs: number;
  triggerCount: number;
  candidateCount: number;
};

export type PrecomputeRecentChangeCandidatesOptions = {
  now?: Date;
  currentYear?: number;
  triggerDays?: number;
  triggerLimit?: number;
  query?: FeedQuery;
  topFiveChanges?: ReadonlyMap<string, FeedTopFiveChange>;
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
};

function utcDate(value: Date) {
  if (!Number.isFinite(value.getTime()))
    throw new Error("The feed requires a valid time.");
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
      competition.end_month, competition.end_day, result.event_id
    FROM competitions competition
    LEFT JOIN results result ON result.competition_id = competition.id
    WHERE STR_TO_DATE(CONCAT(competition.end_year, '-',
      LPAD(competition.end_month, 2, '0'), '-', LPAD(competition.end_day, 2, '0')),
      '%Y-%m-%d') BETWEEN ? AND ?
    GROUP BY competition.id, competition.name, competition.country_id,
      competition.city_name, competition.end_year, competition.end_month,
      competition.end_day, result.event_id
    ORDER BY competition.end_year DESC, competition.end_month DESC,
      competition.end_day DESC, competition.id, result.event_id
    LIMIT ?
  `;
}

async function loadTriggers(
  now: Date,
  days: number,
  limit: number,
  query: FeedQuery,
) {
  const endDate = utcDate(now);
  const startedAt = performance.now();
  const result = await query(recentCompetitionTriggersQuery(), [
    daysBefore(endDate, days),
    endDate,
    limit,
  ]);
  const triggers = new Map<string, RecentCompetitionTrigger>();
  for (const raw of result.rows as unknown as TriggerRow[]) {
    const eventId = raw.event_id?.trim();
    const competitionId = String(raw.competition_id);
    const existing = triggers.get(competitionId);
    if (existing) {
      if (eventId && existing.eventIds.length < MAX_EVENT_IDS)
        existing.eventIds.push(eventId);
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
    });
  }
  return {
    triggers: [...triggers.values()],
    triggerQueryMs: performance.now() - startedAt,
  };
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

function descriptorCandidates(eventId: string, currentYear: number) {
  const params = new URLSearchParams({ eventId, result: "single" });
  const currentYearParams = new URLSearchParams({
    eventId,
    result: "single",
    year: String(currentYear),
  });
  const descriptors = [
    globalRankingPopularityDescriptor(params),
    resultRankingPopularityDescriptor(params),
    globalRankingPopularityDescriptor(currentYearParams),
    resultRankingPopularityDescriptor(currentYearParams),
  ].filter((descriptor) => descriptor !== null);
  const competition = competitionPopularityDescriptor(params);
  const city = cityPopularityDescriptor(params);
  if (competition) descriptors.push(competition);
  if (city) descriptors.push(city);
  return descriptors;
}

export function buildRecentChangeCandidates(
  triggers: readonly RecentCompetitionTrigger[],
  options: {
    currentYear: number;
    topFiveChanges?: ReadonlyMap<string, FeedTopFiveChange>;
  },
) {
  const candidates = new Map<string, RecentChangeCandidate>();
  for (const trigger of triggers) {
    const change = options.topFiveChanges?.get(trigger.competitionId);
    if (!change) continue;
    for (const eventId of trigger.eventIds.slice(0, MAX_EVENT_IDS)) {
      for (const descriptor of descriptorCandidates(
        eventId,
        options.currentYear,
      )) {
        const listKey = rankingListKey(descriptor);
        if (candidates.has(listKey)) continue;
        candidates.set(listKey, {
          cardId: `${trigger.competitionId}:${listKey}`,
          listKey,
          descriptor,
          title: `${trigger.competitionName} changed a ranking`,
          exploreUrl: rankingListDescriptorUrl(descriptor),
          previewRows: [],
          sourceFamily: descriptor.family,
          diversityKey: `${descriptor.family}:${eventId}`,
          anchor: `competition:${trigger.competitionId}`,
          focusEntityId: change.focusEntityId ?? undefined,
          rank: change.currentTopFive[0]?.rank,
          change: {
            type: change.type,
            detectedAt: `${trigger.endDate}T00:00:00.000Z`,
            summary: change.summary,
          },
          trigger: {
            competitionId: trigger.competitionId,
            competitionName: trigger.competitionName,
            endDate: trigger.endDate,
          },
          topFiveChange: change,
        });
      }
    }
  }
  return [...candidates.values()];
}

export async function precomputeRecentChangeCandidates(
  options: PrecomputeRecentChangeCandidatesOptions = {},
) {
  const now = options.now ?? new Date();
  const currentYear = options.currentYear ?? now.getUTCFullYear();
  const { triggers, triggerQueryMs } = await loadTriggers(
    now,
    positiveDays(options.triggerDays),
    positiveLimit(options.triggerLimit),
    options.query ?? defaultQuery,
  );
  const startedAt = performance.now();
  const candidates = buildRecentChangeCandidates(triggers, {
    currentYear,
    topFiveChanges: options.topFiveChanges,
  });
  options.onMeasure?.({
    triggerQueryMs,
    candidateBuildMs: performance.now() - startedAt,
    triggerCount: triggers.length,
    candidateCount: candidates.length,
  });
  return { triggers, candidates };
}

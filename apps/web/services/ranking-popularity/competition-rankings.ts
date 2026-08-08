import {
  normalizeRankingListDescriptor,
  type RankingListDescriptor,
} from "@/lib/ranking-list-descriptor";
import { parseEvent, parseResultType, parseScope } from "@/lib/api/projection";
import {
  collectRankingPopularityDescriptor,
  reportRankingPopularityFailure,
  type RankingPopularityCollectionOptions,
} from "./collection";

const COMPETITION_METRICS = [
  "fastest",
  "podium",
  "competitor-count",
  "latitude",
] as const;

type CompetitionMetric = (typeof COMPETITION_METRICS)[number];

function isRequestedFirstPage(params: URLSearchParams) {
  const start = params.get("start");
  return start === null || Number(start) === 0;
}

function isEligible(params: URLSearchParams) {
  return (
    !params.has("list") &&
    !params.has("wca_ids") &&
    !params.has("locate") &&
    isRequestedFirstPage(params)
  );
}

export function competitionPopularityDescriptor(
  params: URLSearchParams,
): RankingListDescriptor | null {
  if (!isEligible(params)) return null;
  const metric = params.get("ranking") ?? "fastest";
  if (!COMPETITION_METRICS.includes(metric as CompetitionMetric)) return null;
  if (metric === "fastest") {
    const eventId = parseEvent(params)!;
    return normalizeRankingListDescriptor({
      family: "competition",
      metric,
      eventId,
      resultType: parseResultType(params, eventId),
    });
  }
  if (metric === "podium") {
    return normalizeRankingListDescriptor({
      family: "competition",
      metric,
      eventId: parseEvent(params)!,
    });
  }
  if (metric === "latitude") {
    const { scope, regionId } = parseScope(params);
    return normalizeRankingListDescriptor({
      family: "competition",
      metric,
      hemisphere: params.get("hemisphere") ?? "north",
      region: { scope, regionId },
    });
  }
  return normalizeRankingListDescriptor({
    family: "competition",
    metric,
  });
}

export async function collectCompetitionRankingPopularity(
  params: URLSearchParams,
  options: RankingPopularityCollectionOptions = {},
) {
  try {
    const descriptor = competitionPopularityDescriptor(params);
    if (!descriptor) return false;
    return collectRankingPopularityDescriptor(descriptor, options);
  } catch (error) {
    (options.reportFailure ?? reportRankingPopularityFailure)(error);
    return false;
  }
}

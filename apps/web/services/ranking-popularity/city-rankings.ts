import {
  normalizeRankingListDescriptor,
  type RankingListDescriptor,
} from "@/lib/ranking-list-descriptor";
import {
  parseEvent,
  parseGender,
  parseResultType,
  parseScope,
} from "@/lib/api/projection";
import {
  collectRankingPopularityDescriptor,
  reportRankingPopularityFailure,
  type RankingPopularityCollectionOptions,
} from "./collection";

const CITY_COUNT_METRICS = ["competitors", "competitions", "solves"] as const;
type CityCountMetric = (typeof CITY_COUNT_METRICS)[number];

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

export function cityPopularityDescriptor(
  params: URLSearchParams,
): RankingListDescriptor | null {
  if (!isEligible(params)) return null;
  const eventId = parseEvent(params)!;
  const stat = params.get("stat");
  const { scope, regionId } = parseScope(params);
  const genders = parseGender(params);
  if (stat && CITY_COUNT_METRICS.includes(stat as CityCountMetric)) {
    return normalizeRankingListDescriptor({
      family: "city",
      metric: stat,
      eventId,
      region: { scope, regionId },
      genders,
    });
  }
  const resultType = parseResultType(params, eventId);
  return normalizeRankingListDescriptor({
    family: "city",
    metric: "fastest",
    eventId,
    resultType,
    region: { scope, regionId },
    genders,
  });
}

export async function collectCityRankingPopularity(
  params: URLSearchParams,
  options: RankingPopularityCollectionOptions = {},
) {
  try {
    const descriptor = cityPopularityDescriptor(params);
    if (!descriptor) return false;
    return collectRankingPopularityDescriptor(descriptor, options);
  } catch (error) {
    (options.reportFailure ?? reportRankingPopularityFailure)(error);
    return false;
  }
}

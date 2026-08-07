import {
  normalizeRankingListDescriptor,
  type RankingListDescriptor,
} from "@/lib/ranking-list-descriptor";
import { parseResultRankingRequest } from "@/services/rankings/result-request";
import {
  collectRankingPopularityDescriptor,
  reportRankingPopularityFailure,
  type RankingPopularityCollectionOptions,
} from "./collection";

function isRequestedFirstPage(params: URLSearchParams) {
  const start = params.get("start");
  return start === null || Number(start) === 0;
}

export function resultRankingPopularityDescriptor(
  params: URLSearchParams,
): RankingListDescriptor | null {
  if (
    params.has("list") ||
    params.has("wca_ids") ||
    params.has("locate") ||
    !isRequestedFirstPage(params)
  ) {
    return null;
  }
  const input = parseResultRankingRequest(params);
  return normalizeRankingListDescriptor({
    family: "person-result",
    eventId: input.eventId,
    resultType: input.resultType,
    year: input.year,
    region: { scope: input.scope, regionId: input.regionId },
    genders: input.gender,
    population: { kind: "everyone" },
  });
}

export async function collectResultRankingPopularity(
  params: URLSearchParams,
  options: RankingPopularityCollectionOptions = {},
) {
  try {
    const descriptor = resultRankingPopularityDescriptor(params);
    if (!descriptor) return false;
    return collectRankingPopularityDescriptor(descriptor, options);
  } catch (error) {
    (options.reportFailure ?? reportRankingPopularityFailure)(error);
    return false;
  }
}

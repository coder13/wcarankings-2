import {
  normalizeRankingListDescriptor,
  type RankingListDescriptor,
} from "@/lib/ranking-list-descriptor";
import { isPersonMetric, parseRankingInput } from "@/services/rankings/request";
import {
  collectRankingPopularityDescriptor,
  reportRankingPopularityFailure,
  type RankingPopularityCollectionOptions,
} from "./collection";

function isRequestedFirstPage(searchParams: URLSearchParams) {
  const start = searchParams.get("start");
  return start === null || Number(start) === 0;
}

/** Returns a person-event descriptor only for an intentional global first-page view. */
export function globalRankingPopularityDescriptor(
  searchParams: URLSearchParams,
): RankingListDescriptor | null {
  if (
    searchParams.has("list") ||
    searchParams.has("wca_ids") ||
    !isRequestedFirstPage(searchParams)
  ) {
    return null;
  }
  const input = parseRankingInput(searchParams);
  if (input.locate || isPersonMetric(input)) return null;

  return normalizeRankingListDescriptor({
    family: "person-event",
    eventId: input.eventId,
    resultType: input.type,
    year: input.year,
    region: { scope: input.scope, regionId: input.regionId },
    genders: input.gender,
    population: { kind: "everyone" },
  });
}

/** Records a completed global first-page view without changing the ranking response. */
export async function collectGlobalRankingPopularity(
  searchParams: URLSearchParams,
  options: RankingPopularityCollectionOptions = {},
) {
  try {
    const descriptor = globalRankingPopularityDescriptor(searchParams);
    if (!descriptor) return false;
    return collectRankingPopularityDescriptor(descriptor, options);
  } catch (error) {
    (options.reportFailure ?? reportRankingPopularityFailure)(error);
    return false;
  }
}

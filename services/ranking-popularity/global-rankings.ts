import {
  normalizeRankingListDescriptor,
  type RankingListDescriptor,
} from "@/lib/ranking-list-descriptor";
import { isPersonMetric, parseRankingInput } from "@/services/rankings/request";
import { rankingPopularityService, RankingPopularityService } from "./service";

type GlobalPopularityCollector = Pick<
  RankingPopularityService,
  "register" | "recordSuccessfulFirstPageView"
>;

type GlobalRankingPopularityOptions = {
  collector?: GlobalPopularityCollector;
  reportFailure?: (error: unknown) => void;
};

function isRequestedFirstPage(searchParams: URLSearchParams) {
  const start = searchParams.get("start");
  return start === null || Number(start) === 0;
}

function reportGlobalRankingPopularityFailure(error: unknown) {
  console.warn(
    JSON.stringify({
      operation: "ranking-popularity",
      error: error instanceof Error ? error.name : "unknown",
    }),
  );
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
  options: GlobalRankingPopularityOptions = {},
) {
  try {
    const descriptor = globalRankingPopularityDescriptor(searchParams);
    if (!descriptor) return false;
    const collector = options.collector ?? rankingPopularityService;
    const registered = await collector.register(descriptor);
    collector.recordSuccessfulFirstPageView(registered);
    return true;
  } catch (error) {
    (options.reportFailure ?? reportGlobalRankingPopularityFailure)(error);
    return false;
  }
}

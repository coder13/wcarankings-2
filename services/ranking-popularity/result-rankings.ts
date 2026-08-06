import {
  normalizeRankingListDescriptor,
  type RankingListDescriptor,
} from "@/lib/ranking-list-descriptor";
import { parseResultRankingRequest } from "@/services/rankings/result-request";
import { rankingPopularityService, RankingPopularityService } from "./service";

type ResultPopularityCollector = Pick<
  RankingPopularityService,
  "register" | "recordSuccessfulFirstPageView" | "flushIfThresholdReached"
>;

type ResultRankingPopularityOptions = {
  collector?: ResultPopularityCollector;
  reportFailure?: (error: unknown) => void;
};

function isRequestedFirstPage(params: URLSearchParams) {
  const start = params.get("start");
  return start === null || Number(start) === 0;
}

function reportResultRankingPopularityFailure(error: unknown) {
  console.warn(
    JSON.stringify({
      operation: "ranking-popularity",
      error: error instanceof Error ? error.name : "unknown",
    }),
  );
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
  options: ResultRankingPopularityOptions = {},
) {
  try {
    const descriptor = resultRankingPopularityDescriptor(params);
    if (!descriptor) return false;
    const collector = options.collector ?? rankingPopularityService;
    const registered = await collector.register(descriptor);
    if (!collector.recordSuccessfulFirstPageView(registered)) return false;
    void collector
      .flushIfThresholdReached()
      .catch(options.reportFailure ?? reportResultRankingPopularityFailure);
    return true;
  } catch (error) {
    (options.reportFailure ?? reportResultRankingPopularityFailure)(error);
    return false;
  }
}

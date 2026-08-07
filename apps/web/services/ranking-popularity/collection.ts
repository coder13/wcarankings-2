import type { RankingListDescriptor } from "@/lib/ranking-list-descriptor";
import { rankingPopularityService, RankingPopularityService } from "./service";

type RankingPopularityCollector = Pick<
  RankingPopularityService,
  "register" | "recordSuccessfulFirstPageView" | "flushIfThresholdReached"
>;

export type RankingPopularityCollectionOptions = {
  collector?: RankingPopularityCollector;
  reportFailure?: (error: unknown) => void;
};

export function reportRankingPopularityFailure(error: unknown) {
  console.warn(
    JSON.stringify({
      operation: "ranking-popularity",
      error: error instanceof Error ? error.name : "unknown",
    }),
  );
}

export async function collectRankingPopularityDescriptor(
  descriptor: RankingListDescriptor,
  options: RankingPopularityCollectionOptions = {},
) {
  try {
    const collector = options.collector ?? rankingPopularityService;
    const registered = await collector.register(descriptor);
    if (!collector.recordSuccessfulFirstPageView(registered)) return false;
    void collector
      .flushIfThresholdReached()
      .catch(options.reportFailure ?? reportRankingPopularityFailure);
    return true;
  } catch (error) {
    (options.reportFailure ?? reportRankingPopularityFailure)(error);
    return false;
  }
}

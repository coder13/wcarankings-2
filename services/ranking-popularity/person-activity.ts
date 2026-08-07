import {
  normalizeRankingListDescriptor,
  type RankingListDescriptor,
} from "@/lib/ranking-list-descriptor";
import { parseGender, parseScope, parseYear } from "@/lib/api/projection";
import { parsePersonActivityMetric } from "@/services/rankings/person-activity";
import {
  collectRankingPopularityDescriptor,
  reportRankingPopularityFailure,
  type RankingPopularityCollectionOptions,
} from "./collection";

function isRequestedFirstPage(params: URLSearchParams) {
  const start = params.get("start");
  return start === null || Number(start) === 1;
}

function isEligible(params: URLSearchParams) {
  return (
    !params.has("list") &&
    !params.has("wca_ids") &&
    !params.has("locate") &&
    isRequestedFirstPage(params)
  );
}

function descriptorForMetric(
  params: URLSearchParams,
  metric: "competitions" | "countries" | "rounds" | "solves",
): RankingListDescriptor {
  const { scope, regionId } = parseScope(params);
  return normalizeRankingListDescriptor({
    family: "person-activity",
    metric,
    ...(metric === "competitions" ? { year: parseYear(params) } : {}),
    region: { scope, regionId },
    genders: parseGender(params),
  });
}

export function personCompetitionPopularityDescriptor(
  params: URLSearchParams,
): RankingListDescriptor | null {
  if (!isEligible(params)) return null;
  return descriptorForMetric(params, "competitions");
}

export function personActivityPopularityDescriptor(
  params: URLSearchParams,
): RankingListDescriptor | null {
  if (!isEligible(params)) return null;
  return descriptorForMetric(params, parsePersonActivityMetric(params));
}

async function collect(
  descriptor: RankingListDescriptor | null,
  options: RankingPopularityCollectionOptions,
) {
  if (!descriptor) return false;
  return collectRankingPopularityDescriptor(descriptor, options);
}

export async function collectPersonCompetitionPopularity(
  params: URLSearchParams,
  options: RankingPopularityCollectionOptions = {},
) {
  try {
    return await collect(
      personCompetitionPopularityDescriptor(params),
      options,
    );
  } catch (error) {
    (options.reportFailure ?? reportRankingPopularityFailure)(error);
    return false;
  }
}

export async function collectPersonActivityPopularity(
  params: URLSearchParams,
  options: RankingPopularityCollectionOptions = {},
) {
  try {
    return await collect(personActivityPopularityDescriptor(params), options);
  } catch (error) {
    (options.reportFailure ?? reportRankingPopularityFailure)(error);
    return false;
  }
}

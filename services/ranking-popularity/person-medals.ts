import {
  normalizeRankingListDescriptor,
  type RankingListDescriptor,
} from "@/lib/ranking-list-descriptor";
import {
  ApiInputError,
  parseEvent,
  parseGender,
  parseScope,
  parseYear,
} from "@/lib/api/projection";
import {
  isMedalRankingType,
  type MedalRankingType,
} from "@/lib/medal-rankings";
import {
  collectRankingPopularityDescriptor,
  reportRankingPopularityFailure,
  type RankingPopularityCollectionOptions,
} from "./collection";

function isRequestedFirstPage(params: URLSearchParams) {
  const start = params.get("start");
  return start === null || Number(start) === 1;
}

function parseMedalType(params: URLSearchParams): MedalRankingType {
  const value = params.get("medal") ?? params.get("stat") ?? "overall";
  if (!isMedalRankingType(value)) {
    throw new ApiInputError("medal must be overall, gold, silver, or bronze.");
  }
  return value;
}

export function personMedalsPopularityDescriptor(
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
  const { scope, regionId } = parseScope(params);
  return normalizeRankingListDescriptor({
    family: "person-medals",
    medalType: parseMedalType(params),
    eventId: parseEvent(params, { required: false }) ?? "all",
    year: parseYear(params),
    region: { scope, regionId },
    genders: parseGender(params),
  });
}

export async function collectPersonMedalsPopularity(
  params: URLSearchParams,
  options: RankingPopularityCollectionOptions = {},
) {
  try {
    const descriptor = personMedalsPopularityDescriptor(params);
    if (!descriptor) return false;
    return collectRankingPopularityDescriptor(descriptor, options);
  } catch (error) {
    (options.reportFailure ?? reportRankingPopularityFailure)(error);
    return false;
  }
}

import {
  isEventId,
  isRankingType,
  normalizeGenderFilters,
  parseRegionQuery,
  type GenderFilter,
  type RankingType,
} from "@/lib/wca";

export function parseListRankingInput(searchParams: URLSearchParams) {
  const rawEventId = searchParams.get("eventId") ?? searchParams.get("event");
  const eventId = isEventId(rawEventId) ? rawEventId : "333";
  const rawType = searchParams.get("result") ?? searchParams.get("type");
  let type: RankingType = "single";
  if (eventId !== "333mbf" && isRankingType(rawType)) type = rawType;
  const rawStart = Number(searchParams.get("start"));
  const start = Number.isFinite(rawStart) ? Math.max(0, Math.floor(rawStart)) : 0;
  const pageLimit = Math.max(1, Math.min(100, Math.floor(Number(searchParams.get("limit")) || 50)));
  const search = (searchParams.get("search") ?? "").trim().slice(0, 80);
  const locate = (searchParams.get("locate") ?? "").trim().toUpperCase();
  const searchLimit = Math.max(
    1,
    Math.min(500, Math.floor(Number(searchParams.get("searchLimit")) || 50)),
  );
  const limit = search && !locate ? searchLimit : pageLimit;
  const region = parseRegionQuery(searchParams.get("region"));
  const gender = normalizeGenderFilters(
    searchParams
      .getAll("gender")
      .flatMap((value) => value.split(","))
      .filter((value): value is GenderFilter => value === "m" || value === "f" || value === "o"),
  );
  const requestedMembershipVersion = Number(searchParams.get("membershipVersion"));
  const requestedDataVersion = (searchParams.get("rankingsDataVersion") ?? "").slice(0, 64);
  return {
    eventId,
    type,
    start,
    limit,
    search,
    locate,
    region,
    gender,
    membershipVersion:
      Number.isSafeInteger(requestedMembershipVersion) && requestedMembershipVersion > 0
        ? requestedMembershipVersion
        : null,
    rankingsDataVersion: requestedDataVersion || null,
  };
}

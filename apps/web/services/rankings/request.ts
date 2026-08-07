import { RESULTS_PAGE_SIZE } from "@/lib/rankings-config";
import { parseGender, parseYear } from "@/lib/api/projection";
import {
  isRankingEventId,
  isRankingType,
  isValidRegexPattern,
  parseRegionQuery,
  type RankingType,
} from "@/lib/wca";
import type { QueryInput } from "@/services/rankings/types";

const MAX_SEARCH_RESULTS = 500;

export function parseRankingInput(searchParams: URLSearchParams): QueryInput {
  const requestedEvent =
    searchParams.get("eventId") ?? searchParams.get("event");
  const eventId = isRankingEventId(requestedEvent) ? requestedEvent : "333";
  const rawType = searchParams.get("result") ?? searchParams.get("type");
  let type: RankingType = "single";
  if (
    eventId !== "333mbf" &&
    eventId !== "sor-kinch" &&
    isRankingType(rawType)
  ) {
    type = rawType;
  }
  const { scope, regionId } = parseRegionQuery(searchParams.get("region"));
  const kinchOrder =
    searchParams.get("kinch") === "continent" ? "continent" : "regional";
  if (scope !== "world" && !regionId) {
    throw new Error("Choose a region before loading rankings.");
  }
  const paged = searchParams.get("paged") === "1";
  const rawStart = Number(searchParams.get("start"));
  const startRank = paged
    ? Math.floor(
        Math.max(0, Number.isFinite(rawStart) ? rawStart : 0) /
          RESULTS_PAGE_SIZE,
      ) *
        RESULTS_PAGE_SIZE +
      1
    : Math.max(1, rawStart || 1);
  const search = (searchParams.get("search") ?? "").trim().slice(0, 80);
  const regexSearch = searchParams.get("mode") === "vim";
  if (regexSearch && search && !isValidRegexPattern(search)) {
    throw new Error("Invalid regular expression.");
  }
  return {
    eventId,
    type,
    gender: parseGender(searchParams),
    scope,
    regionId,
    year: parseYear(searchParams),
    kinchOrder,
    startRank,
    cursorRank: Number(searchParams.get("cursorRank")) || null,
    cursorId: searchParams.get("cursorId") ?? "",
    limit: paged
      ? RESULTS_PAGE_SIZE
      : Math.min(
          RESULTS_PAGE_SIZE,
          Math.max(20, Number(searchParams.get("limit")) || 80),
        ),
    locate: (searchParams.get("locate") ?? "").trim().toUpperCase(),
    search,
    regexSearch,
    searchLimit: Math.min(
      MAX_SEARCH_RESULTS,
      Math.max(
        1,
        Number(searchParams.get("searchLimit")) || MAX_SEARCH_RESULTS,
      ),
    ),
    paged,
  };
}

export function isPersonMetric(input: QueryInput): boolean {
  return input.eventId === "SOR" || input.eventId === "sor-kinch";
}

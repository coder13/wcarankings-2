import {
  isEventId,
  isRankingEventId,
  isRankingType,
  isValidRegexPattern,
  normalizeGenderFilters,
  parseRegionQuery,
  type GenderFilter,
} from "@/lib/wca";
import {
  isMedalRankingType,
  type MedalRankingType,
} from "@/lib/medal-rankings";
import type { ExplorerSubject } from "../ExplorerSubjectSwitch/ExplorerSubjectSwitch";
import {
  COMPETITION_RANKING_OPTIONS,
  CITY_RANKING_OPTIONS,
  type CityRanking,
  type CompetitionRanking,
} from "./helpers/rankingModes";
import type { RegionSelection } from "./types";

const WCA_ID_PATTERN = /^\d{4}[A-Z0-9]{4}\d{2}$/;
const FIRST_WCA_YEAR = 1982;
const MAX_SEARCH_LENGTH = 80;
const COMPETITION_RANKINGS = new Set<string>(
  COMPETITION_RANKING_OPTIONS.map(({ value }) => value),
);
const CITY_RANKINGS = new Set<string>(
  CITY_RANKING_OPTIONS.map(({ value }) => value),
);
const PERSON_ACTIVITY_METRICS = new Set([
  "competitions",
  "countries",
  "rounds",
  "solves",
]);

export type PersonActivityMetric =
  "competitions" | "countries" | "rounds" | "solves";

export type RankingsUrlState = {
  subject: ExplorerSubject;
  competitionRanking: CompetitionRanking;
  cityRanking: CityRanking;
  personCompetitionRanking: boolean;
  personActivityRanking: boolean;
  personActivityMetric: PersonActivityMetric;
  personMedalRanking: boolean;
  personPrStreakRanking: boolean;
  medalType: MedalRankingType;
  year: number | null;
  eventId: string;
  rankingType: "single" | "average";
  regionSelection: RegionSelection;
  gender: readonly GenderFilter[];
  latitudeHemisphere: "north" | "south";
  search: string;
  regexSearch: boolean;
  wcaId: string;
  focusMe: boolean;
  kinchOrder: "regional" | "continent";
};

export type RankingsFilterState = Pick<
  RankingsUrlState,
  | "subject"
  | "competitionRanking"
  | "cityRanking"
  | "personCompetitionRanking"
  | "personActivityRanking"
  | "personActivityMetric"
  | "personMedalRanking"
  | "personPrStreakRanking"
  | "medalType"
  | "year"
  | "eventId"
  | "rankingType"
  | "regionSelection"
  | "gender"
  | "latitudeHemisphere"
  | "search"
  | "regexSearch"
>;

export type RankingsUrlUpdate = Partial<RankingsUrlState>;

export type RankingsUrlNavigation = {
  history?: "push" | "replace";
  pathname?: string;
};

export function rankingsFilterStateFromUrl(
  urlState: RankingsUrlState,
): RankingsFilterState {
  const {
    subject,
    competitionRanking,
    cityRanking,
    personCompetitionRanking,
    personActivityRanking,
    personActivityMetric,
    personMedalRanking,
    personPrStreakRanking,
    medalType,
    year,
    eventId,
    rankingType,
    regionSelection,
    gender,
    latitudeHemisphere,
    search,
    regexSearch,
  } = urlState;
  return {
    subject,
    competitionRanking,
    cityRanking,
    personCompetitionRanking,
    personActivityRanking,
    personActivityMetric,
    personMedalRanking,
    personPrStreakRanking,
    medalType,
    year,
    eventId,
    rankingType,
    regionSelection,
    gender,
    latitudeHemisphere,
    search,
    regexSearch,
  };
}

function subjectFromPathname(pathname: string): ExplorerSubject {
  if (pathname.startsWith("/results")) return "results";
  if (pathname.startsWith("/competitions")) return "competitions";
  if (pathname.startsWith("/cities")) return "cities";
  return "people";
}

function competitionRankingFromPathname(pathname: string) {
  const value = pathname.match(/^\/competitions\/([^/?#]+)/)?.[1];
  return value && COMPETITION_RANKINGS.has(value)
    ? (value as CompetitionRanking)
    : "best-result";
}

function cityRankingFromPathname(pathname: string) {
  const value = pathname.match(/^\/cities\/([^/?#]+)/)?.[1];
  return value && CITY_RANKINGS.has(value)
    ? (value as CityRanking)
    : "fastest-single";
}

function personCompetitionRankingFromPathname(_pathname: string) {
  return false;
}

function personActivityMetricFromPathname(
  pathname: string,
): PersonActivityMetric | null {
  const value = pathname.match(
    /^\/persons\/(competitions|countries|rounds|solves)$/,
  )?.[1];
  return value && PERSON_ACTIVITY_METRICS.has(value)
    ? (value as PersonActivityMetric)
    : null;
}

function personActivityMetricFromParams(
  pathname: string,
  params: URLSearchParams,
): PersonActivityMetric {
  const requested = params.get("metric");
  return (
    personActivityMetricFromPathname(pathname) ??
    (requested && PERSON_ACTIVITY_METRICS.has(requested)
      ? (requested as PersonActivityMetric)
      : null) ??
    "competitions"
  );
}

function personActivityRankingFromPathname(pathname: string) {
  return personActivityMetricFromPathname(pathname) !== null;
}

export function personActivityRankingPath(metric: PersonActivityMetric) {
  return `/persons/${metric}`;
}

function personMedalRankingFromPathname(pathname: string) {
  return pathname === "/persons/medals";
}

function personPrStreakRankingFromPathname(pathname: string) {
  return pathname === "/persons/pr-streak";
}

function validEventForSubject(
  subject: ExplorerSubject,
  eventId: string,
  personMedalRanking: boolean,
) {
  if (subject === "people" && personMedalRanking) {
    return eventId === "all" || isEventId(eventId) ? eventId : "all";
  }
  if (subject === "people") return isRankingEventId(eventId) ? eventId : "333";
  return isEventId(eventId) ? eventId : "333";
}

function rankingTypeForSubject(
  subject: ExplorerSubject,
  competitionRanking: CompetitionRanking,
  cityRanking: CityRanking,
  eventId: string,
  requested: "single" | "average",
) {
  if (eventId === "333mbf" || eventId === "sor-kinch") return "single";
  if (subject === "cities") {
    if (cityRanking === "fastest-single") return "single";
    if (cityRanking === "fastest-average") return "average";
  }
  if (subject !== "competitions" || competitionRanking !== "podiums") {
    return requested;
  }
  return ["333bf", "444bf", "555bf"].includes(eventId) ? "single" : "average";
}

function yearFromUrl(pathname: string, params: URLSearchParams) {
  const value = Number(
    pathname.match(/^\/persons\/year\/(\d{4})$/)?.[1] ?? params.get("year"),
  );
  return Number.isInteger(value) &&
    value >= FIRST_WCA_YEAR &&
    value <= new Date().getFullYear()
    ? value
    : null;
}

function normalizeState(
  pathname: string,
  state: RankingsUrlState,
): RankingsUrlState {
  const subject = subjectFromPathname(pathname);
  const competitionRanking = competitionRankingFromPathname(pathname);
  const cityRanking = cityRankingFromPathname(pathname);
  const personCompetitionRanking =
    personCompetitionRankingFromPathname(pathname);
  const personActivityRanking = personActivityRankingFromPathname(pathname);
  const personMedalRanking = personMedalRankingFromPathname(pathname);
  const personPrStreakRanking = personPrStreakRankingFromPathname(pathname);
  const eventId = validEventForSubject(
    subject,
    state.eventId,
    personMedalRanking,
  );
  const podiumEventId =
    subject === "competitions" &&
    competitionRanking === "podiums" &&
    eventId === "333mbf"
      ? "333"
      : eventId;
  const search = state.search.trim().slice(0, MAX_SEARCH_LENGTH);
  const wcaId = state.wcaId.trim().toUpperCase();

  return {
    ...state,
    subject,
    competitionRanking,
    cityRanking,
    personCompetitionRanking,
    personActivityRanking,
    personActivityMetric: personActivityRanking
      ? state.personActivityMetric
      : "competitions",
    personMedalRanking,
    personPrStreakRanking,
    medalType: isMedalRankingType(state.medalType)
      ? state.medalType
      : "overall",
    year: subject === "people" ? state.year : null,
    eventId: podiumEventId,
    rankingType: rankingTypeForSubject(
      subject,
      competitionRanking,
      cityRanking,
      podiumEventId,
      state.rankingType,
    ),
    gender:
      subject === "people" || subject === "results"
        ? normalizeGenderFilters(state.gender)
        : [],
    latitudeHemisphere:
      subject === "competitions" && competitionRanking === "latitude"
        ? state.latitudeHemisphere
        : "north",
    search,
    regexSearch:
      state.regexSearch && Boolean(search) && isValidRegexPattern(search),
    wcaId: WCA_ID_PATTERN.test(wcaId) ? wcaId : "",
    focusMe: !WCA_ID_PATTERN.test(wcaId) && state.focusMe,
    kinchOrder:
      podiumEventId === "sor-kinch" &&
      state.regionSelection.scope === "country" &&
      state.kinchOrder === "continent"
        ? "continent"
        : "regional",
  };
}

export function parseRankingsUrl(
  pathname: string,
  params: URLSearchParams,
): RankingsUrlState {
  const subject = subjectFromPathname(pathname);
  const competitionRanking = competitionRankingFromPathname(pathname);
  const cityRanking = cityRankingFromPathname(pathname);
  const personCompetitionRanking =
    personCompetitionRankingFromPathname(pathname);
  const personActivityRanking = personActivityRankingFromPathname(pathname);
  const personMedalRanking = personMedalRankingFromPathname(pathname);
  const personPrStreakRanking = personPrStreakRankingFromPathname(pathname);
  const rawRankingType = params.get("result");
  const search = (params.get("search") ?? "")
    .trim()
    .slice(0, MAX_SEARCH_LENGTH);

  return normalizeState(pathname, {
    subject,
    competitionRanking,
    cityRanking,
    personCompetitionRanking,
    personActivityRanking,
    personActivityMetric: personActivityMetricFromParams(pathname, params),
    personMedalRanking,
    personPrStreakRanking,
    medalType: isMedalRankingType(params.get("medal") ?? "")
      ? (params.get("medal") as MedalRankingType)
      : "overall",
    year: yearFromUrl(pathname, params),
    eventId: validEventForSubject(
      subject,
      params.get("eventId") ?? (personMedalRanking ? "all" : "333"),
      personMedalRanking,
    ),
    rankingType: isRankingType(rawRankingType) ? rawRankingType : "single",
    regionSelection: parseRegionQuery(params.get("region")),
    gender: normalizeGenderFilters(
      (params.get("gender")?.split(",") ?? []).filter(
        (value): value is GenderFilter =>
          value === "m" || value === "f" || value === "o",
      ),
    ),
    latitudeHemisphere:
      params.get("hemisphere") === "south" ? "south" : "north",
    search,
    regexSearch: params.get("mode") === "vim",
    wcaId: params.get("wcaId") ?? "",
    focusMe: params.get("focus") === "me",
    kinchOrder: params.get("kinch") === "continent" ? "continent" : "regional",
  });
}

export function serializeRankingsUrl(
  pathname: string,
  rawState: RankingsUrlState,
) {
  const state = normalizeState(pathname, rawState);
  const params = new URLSearchParams();
  const hidesEvent =
    state.personCompetitionRanking ||
    state.personPrStreakRanking ||
    state.personActivityRanking ||
    (state.subject === "competitions" &&
      (state.competitionRanking === "latitude" ||
        state.competitionRanking === "competitor-count"));
  if (
    !hidesEvent &&
    state.eventId !== (state.personMedalRanking ? "all" : "333")
  )
    params.set("eventId", state.eventId);
  if (
    !hidesEvent &&
    state.eventId !== "sor-kinch" &&
    !(
      state.subject === "competitions" && state.competitionRanking === "podiums"
    ) &&
    state.rankingType !== "single"
  ) {
    params.set("result", state.rankingType);
  }
  if (state.regionSelection.scope !== "world") {
    params.set("region", state.regionSelection.regionId);
  }
  if (state.gender.length) params.set("gender", state.gender.join(","));
  if (state.personMedalRanking && state.medalType !== "overall") {
    params.set("medal", state.medalType);
  }
  if (
    state.subject === "people" &&
    state.year &&
    !pathname.startsWith("/persons/year/")
  ) {
    params.set("year", String(state.year));
  }
  if (state.latitudeHemisphere === "south") params.set("hemisphere", "south");
  if (state.search) params.set("search", state.search);
  if (state.regexSearch) params.set("mode", "vim");
  if (state.wcaId) params.set("wcaId", state.wcaId);
  else if (state.focusMe) params.set("focus", "me");
  if (state.kinchOrder === "continent") params.set("kinch", "continent");
  return params;
}

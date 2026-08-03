"use client";

import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { trackGoogleAnalyticsEvent } from "@/lib/helpers/analytics/google-analytics";
import { normalizeGenderFilters, type GenderFilter } from "@/lib/wca";
import type {
  ExplorerSubject,
  NavigationSubject,
} from "../ExplorerSubjectSwitch/ExplorerSubjectSwitch";
import { subjectPath } from "./helpers/navigation";
import type { CityRanking, CompetitionRanking } from "./helpers/rankingModes";
import type { RankingsFilterState } from "./rankingsUrl";
import type {
  RankingsUrlNavigation,
  RankingsUrlUpdate,
} from "./useRankingsUrlState";
import type { RegionOption, RegionSelection } from "./types";

type PatchFilters = (
  patch: Partial<RankingsFilterState>,
  navigation?: RankingsUrlNavigation,
  urlPatch?: RankingsUrlUpdate,
) => void;

export function competitionRankingPath(ranking: CompetitionRanking) {
  return `/competitions/${ranking}`;
}

export function cityRankingPath(ranking: CityRanking) {
  return `/cities/${ranking}`;
}

function podiumRankingType(eventId: string): "single" | "average" {
  return ["333bf", "444bf", "555bf"].includes(eventId)
    ? "single"
    : "average";
}

function rankingTypeForEvent(
  eventId: string,
  current: "single" | "average",
  podiums: boolean,
) {
  if (podiums) return podiumRankingType(eventId);
  if (eventId === "333mbf" || eventId === "sor-kinch") return "single";
  return current;
}

export function useRankingFilterActions({
  state,
  patchFilters,
}: {
  state: {
    subject: ExplorerSubject;
    competitionRanking: CompetitionRanking;
    cityRanking: CityRanking;
    personCompetitionRanking: boolean;
    year: number | null;
    eventId: string;
    rankingType: "single" | "average";
    regionSelection: RegionSelection;
    gender: readonly GenderFilter[];
  };
  patchFilters: PatchFilters;
}) {
  const router = useRouter();
  const {
    subject,
    competitionRanking,
    cityRanking,
    personCompetitionRanking,
    year,
    eventId,
    rankingType,
    gender,
  } = state;

  const changeRankingType = useCallback((next: "single" | "average") => {
    if (next === rankingType || eventId === "333mbf" || eventId === "sor-kinch") {
      return;
    }
    patchFilters({ rankingType: next });
    trackGoogleAnalyticsEvent("ranking_result_type_changed", {
      result_type: next,
    });
  }, [eventId, patchFilters, rankingType]);

  const changeEvent = useCallback((nextEventId: string) => {
    const nextRankingType = rankingTypeForEvent(
      nextEventId,
      rankingType,
      subject === "competitions" && competitionRanking === "podiums",
    );
    patchFilters({ eventId: nextEventId, rankingType: nextRankingType });
    trackGoogleAnalyticsEvent("ranking_event_changed", {
      event_id: nextEventId,
    });
  }, [competitionRanking, patchFilters, rankingType, subject]);

  const changeRegion = useCallback((option: RegionOption) => {
    patchFilters({
      regionSelection: { scope: option.scope, regionId: option.regionId },
    });
    trackGoogleAnalyticsEvent("ranking_scope_changed", {
      scope_type: option.scope,
    });
  }, [patchFilters]);

  const changeGender = useCallback((nextGender: GenderFilter[]) => {
    const normalized = normalizeGenderFilters(nextGender);
    if (normalized.join(",") === gender.join(",")) return;
    patchFilters({ gender: normalized });
    trackGoogleAnalyticsEvent("ranking_gender_changed", {
      gender: normalized.length ? normalized.join(",") : "any",
    });
  }, [gender, patchFilters]);

  const changeSubject = useCallback((nextSubject: NavigationSubject) => {
    if (nextSubject === "lists") {
      router.push("/lists");
      return;
    }
    if (nextSubject === subject) return;
    let nextPath = subjectPath(nextSubject);
    if (nextSubject === "people") {
      if (personCompetitionRanking) nextPath = "/persons/competitions";
      else if (year) nextPath = `/persons/year/${year}`;
    }
    patchFilters(
      { subject: nextSubject },
      { history: "push", pathname: nextPath },
      { search: "", wcaId: "", focusMe: false },
    );
  }, [patchFilters, personCompetitionRanking, router, subject, year]);

  const leaveList = useCallback((nextSubject: NavigationSubject) => {
    router.push(nextSubject === "lists" ? "/lists" : subjectPath(nextSubject));
  }, [router]);

  const changeYear = useCallback((nextYear: number | null) => {
    if (nextYear === year) return;
    patchFilters(
      { year: nextYear, personCompetitionRanking: false },
      {
        history: "push",
        pathname: nextYear ? `/persons/year/${nextYear}` : "/",
      },
      { search: "", wcaId: "", focusMe: false },
    );
  }, [patchFilters, year]);

  const changePersonCompetitionRanking = useCallback((enabled: boolean) => {
    if (enabled === personCompetitionRanking) return;
    patchFilters(
      { personCompetitionRanking: enabled, year: null },
      { history: "push", pathname: enabled ? "/persons/competitions" : "/" },
      { search: "", wcaId: "", focusMe: false },
    );
  }, [patchFilters, personCompetitionRanking]);

  const changeCompetitionRanking = useCallback((next: CompetitionRanking) => {
    if (next === competitionRanking) return;
    patchFilters(
      { competitionRanking: next },
      { history: "push", pathname: competitionRankingPath(next) },
    );
  }, [competitionRanking, patchFilters]);

  const changeCityRanking = useCallback((next: CityRanking) => {
    if (next === cityRanking) return;
    patchFilters(
      {
        cityRanking: next,
        rankingType: next === "fastest-average" ? "average" : "single",
      },
      { history: "push", pathname: cityRankingPath(next) },
    );
  }, [cityRanking, patchFilters]);

  const changeHemisphere = useCallback((latitudeHemisphere: "north" | "south") => {
    patchFilters({ latitudeHemisphere });
  }, [patchFilters]);

  return useMemo(() => ({
    changeRankingType,
    changeEvent,
    changeRegion,
    changeGender,
    changeSubject,
    leaveList,
    changeYear,
    changePersonCompetitionRanking,
    changeCompetitionRanking,
    changeCityRanking,
    changeHemisphere,
  }), [
    changeCityRanking,
    changeCompetitionRanking,
    changeEvent,
    changeGender,
    changeHemisphere,
    changePersonCompetitionRanking,
    changeRankingType,
    changeRegion,
    changeSubject,
    changeYear,
    leaveList,
  ]);
}

export type RankingFilterActions = ReturnType<typeof useRankingFilterActions>;

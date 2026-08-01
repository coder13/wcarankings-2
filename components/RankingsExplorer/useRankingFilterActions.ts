"use client";

import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { trackGoogleAnalyticsEvent } from "@/lib/google-analytics";
import {
  normalizeGenderFilters,
  type GenderFilter,
} from "@/lib/wca";
import {
  animateScrollTo,
  getCurrentViewportSubRank,
  getScrollAnimationDuration,
} from "./scrollEngine";
import { RANKING_ROW_HEIGHT } from "./rankingLayout";
import { rankingPageStart } from "./rankingsQueries";
import { subjectPath } from "./helpers/navigation";
import type { CompetitionRanking } from "./helpers/rankingModes";
import type {
  ExplorerSubject,
  NavigationSubject,
} from "../ExplorerSubjectSwitch/ExplorerSubjectSwitch";
import type { RankingsFilterState } from "./rankingsUrl";
import type { useRankingViewport } from "./useRankingViewport";
import type { useRankingWindow } from "./useRankingWindow";
import type { RankingsUrlNavigation, RankingsUrlUpdate } from "./useRankingsUrlState";
import type { RegionOption, RegionSelection } from "./types";
import type { useRankingNavigationSession } from "./useRankingNavigationSession";

type PatchFilters = (
  patch: Partial<RankingsFilterState>,
  navigation?: RankingsUrlNavigation,
  urlPatch?: RankingsUrlUpdate,
) => void;

type FilterViewport = Pick<
  ReturnType<typeof useRankingViewport>,
  "containerRef" | "entriesRef" | "startRankRef" | "scrollStateRef"
>;

export function competitionRankingPath(ranking: CompetitionRanking) {
  return `/competitions/${ranking}`;
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
  patchWindow,
  viewport,
  session,
  preserveSearchOnNextRequest,
}: {
  state: {
    subject: ExplorerSubject;
    competitionRanking: CompetitionRanking;
    year: number | null;
    eventId: string;
    rankingType: "single" | "average";
    regionSelection: RegionSelection;
    gender: readonly GenderFilter[];
  };
  patchFilters: PatchFilters;
  patchWindow: ReturnType<typeof useRankingWindow>["actions"]["patch"];
  viewport: FilterViewport;
  session: ReturnType<typeof useRankingNavigationSession>;
  preserveSearchOnNextRequest: () => void;
}) {
  const router = useRouter();
  const {
    subject,
    competitionRanking,
    year,
    eventId,
    rankingType,
    gender,
  } = state;
  const {
    containerRef,
    entriesRef,
    startRankRef,
    scrollStateRef,
  } = viewport;
  const {
    pendingFirstPageFallbackRef,
    pendingNavigationAppendRef,
    pendingRankRef,
    pendingScrollDirectionRef,
    pendingScrollToTopRef,
    preserveListDuringLoadRef,
  } = session.refs;

  const preserveFromCurrentPosition = useCallback(() => {
    const viewportSubRank = getCurrentViewportSubRank(
      containerRef.current,
      entriesRef.current,
      startRankRef.current,
    );
    pendingRankRef.current = viewportSubRank;
    pendingScrollToTopRef.current = false;
    pendingScrollDirectionRef.current = null;
    pendingFirstPageFallbackRef.current = true;
    preserveSearchOnNextRequest();
    preserveListDuringLoadRef.current = true;
    patchWindow({
      preserveListDuringLoad: true,
      startRank: rankingPageStart(viewportSubRank) + 1,
    });
  }, [
    containerRef,
    entriesRef,
    patchWindow,
    pendingFirstPageFallbackRef,
    pendingRankRef,
    pendingScrollDirectionRef,
    pendingScrollToTopRef,
    preserveListDuringLoadRef,
    preserveSearchOnNextRequest,
    startRankRef,
  ]);

  const resetToTop = useCallback((preserveList: boolean) => {
    pendingRankRef.current = 1;
    pendingScrollToTopRef.current = true;
    pendingScrollDirectionRef.current = null;
    pendingNavigationAppendRef.current = false;
    preserveListDuringLoadRef.current = preserveList;
    patchWindow({
      preserveListDuringLoad: preserveList,
      startRank: 1,
    });
  }, [
    patchWindow,
    pendingNavigationAppendRef,
    pendingRankRef,
    pendingScrollDirectionRef,
    pendingScrollToTopRef,
    preserveListDuringLoadRef,
  ]);

  const changeRankingType = useCallback((next: "single" | "average") => {
    if (next === rankingType || eventId === "333mbf" || eventId === "sor-kinch")
      return;
    preserveFromCurrentPosition();
    patchFilters({ rankingType: next });
    trackGoogleAnalyticsEvent("ranking_result_type_changed", {
      result_type: next,
    });
  }, [eventId, patchFilters, preserveFromCurrentPosition, rankingType]);

  const changeEvent = useCallback((nextEventId: string) => {
    resetToTop(true);
    pendingFirstPageFallbackRef.current = false;
    preserveSearchOnNextRequest();
    animateScrollTo(
      scrollStateRef.current,
      0,
      "smooth",
      getScrollAnimationDuration(
        Math.max(1, Math.round(window.scrollY / RANKING_ROW_HEIGHT)),
      ),
    );
    const nextRankingType = rankingTypeForEvent(
      nextEventId,
      rankingType,
      subject === "competitions" && competitionRanking === "podiums",
    );
    patchFilters({ eventId: nextEventId, rankingType: nextRankingType });
    trackGoogleAnalyticsEvent("ranking_event_changed", {
      event_id: nextEventId,
    });
  }, [
    competitionRanking,
    patchFilters,
    pendingFirstPageFallbackRef,
    preserveSearchOnNextRequest,
    rankingType,
    resetToTop,
    scrollStateRef,
    subject,
  ]);

  const changeRegion = useCallback((option: RegionOption) => {
    preserveFromCurrentPosition();
    pendingNavigationAppendRef.current = false;
    patchFilters({
      regionSelection: { scope: option.scope, regionId: option.regionId },
    });
    trackGoogleAnalyticsEvent("ranking_scope_changed", {
      scope_type: option.scope,
    });
  }, [patchFilters, pendingNavigationAppendRef, preserveFromCurrentPosition]);

  const changeGender = useCallback((nextGender: GenderFilter[]) => {
    const normalized = normalizeGenderFilters(nextGender);
    if (normalized.join(",") === gender.join(",")) return;
    resetToTop(false);
    patchFilters({ gender: normalized });
    trackGoogleAnalyticsEvent("ranking_gender_changed", {
      gender: normalized.length ? normalized.join(",") : "any",
    });
  }, [gender, patchFilters, resetToTop]);

  const changeSubject = useCallback((nextSubject: NavigationSubject) => {
    if (nextSubject === "lists") {
      router.push("/lists");
      return;
    }
    if (nextSubject === subject) return;
    resetToTop(true);
    const nextPath = nextSubject === "people" && year
      ? `/persons/year/${year}`
      : subjectPath(nextSubject);
    patchFilters(
      { subject: nextSubject },
      { history: "push", pathname: nextPath },
      { search: "", wcaId: "", focusMe: false },
    );
  }, [patchFilters, resetToTop, router, subject, year]);

  const leaveList = useCallback((nextSubject: NavigationSubject) => {
    router.push(nextSubject === "lists" ? "/lists" : subjectPath(nextSubject));
  }, [router]);

  const changeYear = useCallback((nextYear: number | null) => {
    if (nextYear === year) return;
    resetToTop(true);
    patchFilters(
      { year: nextYear },
      {
        history: "push",
        pathname: nextYear ? `/persons/year/${nextYear}` : "/",
      },
      { search: "", wcaId: "", focusMe: false },
    );
  }, [patchFilters, resetToTop, year]);

  const changeCompetitionRanking = useCallback((next: CompetitionRanking) => {
    if (next === competitionRanking) return;
    resetToTop(true);
    patchFilters(
      { competitionRanking: next },
      { history: "push", pathname: competitionRankingPath(next) },
    );
  }, [competitionRanking, patchFilters, resetToTop]);

  const changeHemisphere = useCallback((hemisphere: "north" | "south") => {
    patchFilters({ latitudeHemisphere: hemisphere });
    patchWindow({ startRank: 1 });
  }, [patchFilters, patchWindow]);

  return useMemo(() => ({
    changeRankingType,
    changeEvent,
    changeRegion,
    changeGender,
    changeSubject,
    leaveList,
    changeYear,
    changeCompetitionRanking,
    changeHemisphere,
  }), [
    changeCompetitionRanking,
    changeEvent,
    changeGender,
    changeHemisphere,
    changeRankingType,
    changeRegion,
    changeSubject,
    changeYear,
    leaveList,
  ]);
}

export type RankingFilterActions = ReturnType<typeof useRankingFilterActions>;

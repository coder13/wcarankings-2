"use client";

import { useCallback, useEffect, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  notifyAnalyticsNavigation,
  trackGoogleAnalyticsEvent,
} from "@/lib/helpers/analytics/google-analytics";
import { normalizeGenderFilters, type GenderFilter } from "@/lib/wca";
import type { MedalRankingType } from "@/lib/medal-rankings";
import { rankingStatSource } from "@/lib/ranking-stat-sources";
import type { NavigationSubject } from "../ExplorerSubjectSwitch/ExplorerSubjectSwitch";
import { subjectPath } from "./helpers/navigation";
import type { CityRanking, CompetitionRanking } from "./helpers/rankingModes";
import {
  parseRankingsUrl,
  rankingsFilterStateFromUrl,
  serializeRankingsUrl,
  personActivityRankingPath,
  type RankingsFilterState,
  type RankingsUrlNavigation,
  type RankingsUrlUpdate,
} from "./rankingsUrl";
import type { PersonActivityMetric } from "./rankingsUrl";
import type { RegionOption } from "./types";

const PR_STREAK_PATH = rankingStatSource("person-pr-streak").paths.page;

export type PatchRankingsFilters = (
  patch: Partial<RankingsFilterState>,
  navigation?: RankingsUrlNavigation,
  urlPatch?: RankingsUrlUpdate,
) => void;

export function competitionRankingPath(ranking: CompetitionRanking) {
  return `/competitions/${ranking}`;
}

function cityRankingPath(ranking: CityRanking) {
  return `/cities/${ranking}`;
}

function podiumRankingType(eventId: string): "single" | "average" {
  return ["333bf", "444bf", "555bf"].includes(eventId) ? "single" : "average";
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

export function useRankingsState() {
  const pathname = usePathname();
  const router = useRouter();
  const searchString = useSearchParams().toString();
  const urlState = useMemo(
    () => parseRankingsUrl(pathname, new URLSearchParams(searchString)),
    [pathname, searchString],
  );
  const filters = useMemo(
    () => rankingsFilterStateFromUrl(urlState),
    [urlState],
  );

  const writeUrl = useCallback(
    (update: RankingsUrlUpdate, navigation: RankingsUrlNavigation = {}) => {
      const nextPathname = navigation.pathname ?? window.location.pathname;
      const query = serializeRankingsUrl(nextPathname, {
        ...urlState,
        ...update,
      }).toString();
      const href = query ? `${nextPathname}?${query}` : nextPathname;
      window.history[
        navigation.history === "push" ? "pushState" : "replaceState"
      ](window.history.state, "", href);
      notifyAnalyticsNavigation();
    },
    [urlState],
  );

  const patchFilters = useCallback<PatchRankingsFilters>(
    (patch, navigation, urlPatch) => {
      writeUrl({ ...filters, ...patch, ...urlPatch }, navigation);
    },
    [filters, writeUrl],
  );

  useEffect(() => {
    const canonical = serializeRankingsUrl(pathname, urlState).toString();
    if (canonical === searchString) return;
    const href = canonical ? `${pathname}?${canonical}` : pathname;
    window.history.replaceState(window.history.state, "", href);
    notifyAnalyticsNavigation();
  }, [pathname, searchString, urlState]);

  const actions = useMemo(
    () => ({
      changeRankingType(next: "single" | "average") {
        if (
          next === filters.rankingType ||
          filters.eventId === "333mbf" ||
          filters.eventId === "sor-kinch"
        )
          return;
        patchFilters({ rankingType: next });
        trackGoogleAnalyticsEvent("ranking_result_type_changed", {
          result_type: next,
        });
      },
      changeEvent(nextEventId: string) {
        const nextRankingType = rankingTypeForEvent(
          nextEventId,
          filters.rankingType,
          filters.subject === "competitions" &&
            filters.competitionRanking === "podiums",
        );
        patchFilters({
          eventId: nextEventId,
          rankingType: nextRankingType,
        });
        trackGoogleAnalyticsEvent("ranking_event_changed", {
          event_id: nextEventId,
        });
      },
      changeRegion(option: RegionOption) {
        patchFilters({
          regionSelection: { scope: option.scope, regionId: option.regionId },
        });
        trackGoogleAnalyticsEvent("ranking_scope_changed", {
          scope_type: option.scope,
        });
      },
      changeGender(nextGender: GenderFilter[]) {
        const normalized = normalizeGenderFilters(nextGender);
        if (normalized.join(",") === filters.gender.join(",")) return;
        patchFilters({ gender: normalized });
        trackGoogleAnalyticsEvent("ranking_gender_changed", {
          gender: normalized.length ? normalized.join(",") : "any",
        });
      },
      changeSubject(nextSubject: NavigationSubject) {
        if (nextSubject === "lists") {
          router.push("/lists");
          return;
        }
        if (nextSubject === filters.subject) return;
        let nextPath = subjectPath(nextSubject);
        if (nextSubject === "people") {
          if (filters.personCompetitionRanking)
            nextPath = "/persons/competitions";
          else if (filters.personActivityRanking)
            nextPath = "/persons/activity";
          else if (filters.personMedalRanking) nextPath = "/persons/medals";
          else if (filters.personPrStreakRanking) nextPath = PR_STREAK_PATH;
          else if (filters.year) nextPath = `/persons/year/${filters.year}`;
        }
        patchFilters(
          { subject: nextSubject },
          { history: "push", pathname: nextPath },
          { search: "", wcaId: "", focusMe: false },
        );
      },
      leaveList(nextSubject: NavigationSubject) {
        router.push(
          nextSubject === "lists" ? "/lists" : subjectPath(nextSubject),
        );
      },
      changeYear(nextYear: number | null) {
        if (nextYear === filters.year) return;
        if (filters.personCompetitionRanking || filters.personPrStreakRanking) {
          patchFilters(
            { year: nextYear },
            {
              history: "push",
              pathname: filters.personPrStreakRanking
                ? PR_STREAK_PATH
                : "/persons/competitions",
            },
            { search: "", wcaId: "", focusMe: false },
          );
          return;
        }
        if (filters.personActivityRanking) {
          patchFilters(
            { year: nextYear },
            {
              history: "push",
              pathname: personActivityRankingPath(
                filters.personActivityMetric,
              ),
            },
            { search: "", wcaId: "", focusMe: false },
          );
          return;
        }
        patchFilters(
          {
            year: nextYear,
            personCompetitionRanking: false,
            personActivityRanking: false,
            personMedalRanking: false,
            personPrStreakRanking: false,
          },
          {
            history: "push",
            pathname: nextYear ? `/persons/year/${nextYear}` : "/",
          },
          { search: "", wcaId: "", focusMe: false },
        );
      },
      changePersonCompetitionRanking(enabled: boolean) {
        if (enabled === filters.personCompetitionRanking) return;
        patchFilters(
          {
            personCompetitionRanking: enabled,
            personActivityRanking: false,
            personMedalRanking: false,
            personPrStreakRanking: false,
            year: null,
          },
          {
            history: "push",
            pathname: enabled ? "/persons/competitions" : "/",
          },
          { search: "", wcaId: "", focusMe: false },
        );
      },
      changePersonActivityRanking(
        enabled: boolean,
        metric: PersonActivityMetric = filters.personActivityMetric,
      ) {
        if (
          enabled === filters.personActivityRanking &&
          (!enabled || metric === filters.personActivityMetric)
        )
          return;
        patchFilters(
          {
            personCompetitionRanking: false,
            personActivityRanking: enabled,
            personMedalRanking: false,
            personActivityMetric: metric,
            year: null,
          },
          {
            history: "push",
            pathname: enabled ? personActivityRankingPath(metric) : "/",
          },
          { search: "", wcaId: "", focusMe: false },
        );
      },
      changePersonActivityMetric(metric: PersonActivityMetric) {
        if (metric === filters.personActivityMetric) return;
        patchFilters({ personActivityMetric: metric });
      },
      changePersonMedalRanking(enabled: boolean) {
        if (enabled === filters.personMedalRanking) return;
        patchFilters(
          {
            personCompetitionRanking: false,
            personActivityRanking: false,
            personMedalRanking: enabled,
            personPrStreakRanking: false,
            year: null,
            eventId: enabled ? "all" : "333",
          },
          {
            history: "push",
            pathname: enabled ? "/persons/medals" : "/",
          },
          { search: "", wcaId: "", focusMe: false },
        );
      },
      changePersonPrStreakRanking(enabled: boolean) {
        if (enabled === filters.personPrStreakRanking) return;
        patchFilters(
          {
            personCompetitionRanking: false,
            personMedalRanking: false,
            personPrStreakRanking: enabled,
            year: null,
            eventId: "333",
          },
          {
            history: "push",
            pathname: enabled ? PR_STREAK_PATH : "/",
          },
          { search: "", wcaId: "", focusMe: false },
        );
      },
      changeMedalType(medalType: MedalRankingType) {
        if (medalType === filters.medalType) return;
        patchFilters({ medalType });
      },
      changeCompetitionRanking(next: CompetitionRanking) {
        if (next === filters.competitionRanking) return;
        patchFilters(
          { competitionRanking: next },
          { history: "push", pathname: competitionRankingPath(next) },
        );
      },
      changeCityRanking(next: CityRanking) {
        if (next === filters.cityRanking) return;
        patchFilters(
          {
            cityRanking: next,
            rankingType: next === "fastest-average" ? "average" : "single",
          },
          { history: "push", pathname: cityRankingPath(next) },
        );
      },
      changeHemisphere(latitudeHemisphere: "north" | "south") {
        patchFilters({ latitudeHemisphere });
      },
    }),
    [filters, patchFilters, router],
  );

  return useMemo(
    () => ({
      filters,
      actions,
      patchFilters,
      url: { state: urlState, write: writeUrl },
    }),
    [actions, filters, patchFilters, urlState, writeUrl],
  );
}

export type RankingsState = ReturnType<typeof useRankingsState>;
export type RankingFilterActions = RankingsState["actions"];

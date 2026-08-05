"use client";

import {
  useMemo,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import { useTranslation } from "react-i18next";
import { useProjectionFeatureSwitch } from "@/components/ProjectionFeatureSwitchProvider";
import { i18n } from "@/lib/i18n";
import { WCA_EVENTS } from "@/lib/wca";
import {
  ALL_MEDAL_EVENTS_OPTION,
  MEDAL_RANKING_OPTIONS,
} from "@/lib/medal-rankings";
import { ALL_EVENT_RANKING_OPTIONS } from "../EventPicker/allEventRankingOptions";
import type { EventPickerOption } from "../EventPicker/EventPicker";
import {
  ListAddPeopleRail,
  ListMembershipControls,
  ListOwnerControls,
} from "../ListOwnerControls/ListOwnerControls";
import { ListCloneExportControls } from "../ListOwnerControls/ListCloneExportControls";
import { DynamicListControls } from "../ListOwnerControls/DynamicListControls";
import { RankingsControlsRail } from "../RankingsRail/RankingsRail";
import { RANKING_ROW_HEIGHT } from "./rankingLayout";
import { useTopRailScrollProgress } from "./useRailScrollProgress";
import { useRankingsExplorer } from "./RankingsExplorerContext";
import type { RankingsRegions, RegionOption } from "./types";

const MOBILE_CONTROLS_QUERY = "(max-width: 600px)";
const PODIUM_EVENT_OPTIONS = WCA_EVENTS.filter(
  (event) => event.id !== "333mbf",
);
const currentYear = new Date().getFullYear();
const FALLBACK_PERSON_RANKING_YEARS = [
  ...Array.from(
    { length: currentYear - 2003 + 1 },
    (_, index) => currentYear - index,
  ),
  1982,
];

function subscribeMobileControls(listener: () => void) {
  const media = window.matchMedia(MOBILE_CONTROLS_QUERY);
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}

function getMobileControlsSnapshot() {
  return window.matchMedia(MOBILE_CONTROLS_QUERY).matches;
}

function buildRegionOptions(regions: RankingsRegions) {
  const continents: RegionOption[] = regions.continents.map((region) => ({
    key: `continent:${region.id}`,
    scope: "continent",
    regionId: region.id,
    label: region.name.replace(/^_/, ""),
  }));
  const countries: RegionOption[] = regions.countries.map((region) => ({
    key: `country:${region.id}`,
    scope: "country",
    regionId: region.id,
    label: region.name,
    iso2: region.iso2,
  }));
  return [
    { key: "world", scope: "world", regionId: "", label: "World" },
    ...continents,
    ...countries,
  ] satisfies RegionOption[];
}

export function RankingsTopRail() {
  const { t } = useTranslation(undefined, { i18n });
  const featureSwitch = useProjectionFeatureSwitch();
  const {
    config: { source, list, regions: initialRegions, options },
    filters,
    filterActions: actions,
    rankings,
    search,
    listMembers,
    commands,
  } = useRankingsExplorer();
  const [addPeopleOpen, setAddPeopleOpen] = useState(false);
  const isMobileControls = useSyncExternalStore(
    subscribeMobileControls,
    getMobileControlsSnapshot,
    () => false,
  );
  const topProgress = useTopRailScrollProgress(RANKING_ROW_HEIGHT * 2);
  const regions = useMemo(
    () => buildRegionOptions(initialRegions),
    [initialRegions],
  );
  const currentEvent =
    (filters.personMedalRanking && filters.eventId === "all"
      ? ALL_MEDAL_EVENTS_OPTION
      : undefined) ??
    ALL_EVENT_RANKING_OPTIONS.find((option) => option.id === filters.eventId) ??
    WCA_EVENTS.find((event) => event.id === filters.eventId)!;
  let eventOptions: readonly EventPickerOption[] = WCA_EVENTS;
  let eventLeadingOptions: readonly EventPickerOption[] = [];
  if (filters.competitionRanking === "podiums") {
    eventOptions = PODIUM_EVENT_OPTIONS;
  } else if (filters.personMedalRanking) {
    eventLeadingOptions = [ALL_MEDAL_EVENTS_OPTION];
  }
  let personRankingPeriod = "";
  if (filters.personCompetitionRanking) personRankingPeriod = "competitions";
  else if (filters.personMedalRanking) personRankingPeriod = filters.medalType;
  else if (filters.year) personRankingPeriod = String(filters.year);
  let personRankingYears = rankings.availableYears;
  if (personRankingYears.length === 0 && rankings.loading) {
    personRankingYears = FALLBACK_PERSON_RANKING_YEARS;
  }
  const personRankingPeriodOptions = filters.personMedalRanking
    ? MEDAL_RANKING_OPTIONS
    : [
        ...(featureSwitch.personCompetitionRankings
          ? [
              {
                value: "competitions",
                label: t("rankingsRail.period.competitionCount"),
              },
            ]
          : []),
        ...(featureSwitch.personMedalRankings
          ? [{ value: "medals", label: "Medal rankings" }]
          : []),
        { value: "", label: t("rankingsRail.period.allTime") },
        ...personRankingYears.map((year) => ({
          value: String(year),
          label: String(year),
        })),
      ];
  const showPersonRankingPeriod =
    !source &&
    options.showSubjectSwitch &&
    filters.subject === "people" &&
    personRankingPeriodOptions.length > 1;
  const hidesResultType =
    filters.personCompetitionRanking ||
    filters.personMedalRanking ||
    (filters.subject === "competitions" &&
      ["podiums", "latitude", "competitor-count"].includes(
        filters.competitionRanking,
      ));
  const cityUsesResultType =
    filters.subject === "cities" &&
    ["fastest-single", "fastest-average"].includes(filters.cityRanking);
  const hidesEventPicker =
    filters.personCompetitionRanking ||
    (filters.subject === "competitions" &&
      ["latitude", "competitor-count"].includes(filters.competitionRanking));
  return (
    <div
      className="stickyRankingsRail"
      style={{ "--rail-scroll-progress": topProgress } as CSSProperties}
    >
      {list?.owner && (
        <ListOwnerControls
          listId={list.owner.listId}
          initialVisibility={list.owner.visibility}
          initialJoinPolicy={list.owner.joinPolicy}
          onManageMembers={listMembers.selection.start}
        />
      )}
      {list?.actions && !list.actions.isOwner && (
        <ListCloneExportControls listId={list.actions.listId} />
      )}
      {list?.dynamic && (
        <DynamicListControls personIds={list.dynamic.personIds} />
      )}
      {list?.membership && (
        <ListMembershipControls
          listId={list.membership.listId}
          joinPolicy={list.membership.joinPolicy}
          initialState={list.membership.state}
        />
      )}
      {addPeopleOpen && list?.owner ? (
        <ListAddPeopleRail
          listId={list.owner.listId}
          onCancel={() => setAddPeopleOpen(false)}
          onAdded={() => void rankings.reload()}
        />
      ) : (
        <RankingsControlsRail
          controls={{
            event: currentEvent,
            eventOptions,
            eventLeadingOptions,
            additionalEventOptions:
              !filters.personMedalRanking &&
              options.showAllEventRankingOptions &&
              featureSwitch.sumOfRanks
                ? ALL_EVENT_RANKING_OPTIONS
                : undefined,
            onEventChange: actions.changeEvent,
            onEventPickerTrigger: commands.registerEventPickerTrigger,
            rankingType: filters.rankingType,
            onRankingTypeChange: actions.changeRankingType,
            period: showPersonRankingPeriod
              ? {
                  options: personRankingPeriodOptions,
                  value: personRankingPeriod,
                  onChange: (value) => {
                    if (value === "competitions")
                      actions.changePersonCompetitionRanking(true);
                    else if (value === "medals")
                      actions.changePersonMedalRanking(true);
                    else if (filters.personMedalRanking)
                      actions.changeMedalType(
                        value as typeof filters.medalType,
                      );
                    else actions.changeYear(value ? Number(value) : null);
                  },
                  ariaLabel: filters.personMedalRanking
                    ? "Medal statistic"
                    : undefined,
                }
              : undefined,
            gender: filters.gender,
            onGenderChange: actions.changeGender,
            regions,
            regionSelection: filters.regionSelection,
            onRegionChange: actions.changeRegion,
            compactResultType:
              topProgress >= 1 || (Boolean(source) && isMobileControls),
            showResultType:
              filters.eventId !== "SOR" &&
              filters.eventId !== "sor-kinch" &&
              !filters.personMedalRanking &&
              !hidesResultType &&
              (filters.subject !== "cities" || cityUsesResultType),
            showEventPicker: !hidesEventPicker,
            showGender:
              filters.subject === "people" || filters.subject === "results",
            hemisphere:
              filters.subject === "competitions" &&
              filters.competitionRanking === "latitude"
                ? filters.latitudeHemisphere
                : undefined,
            onHemisphereChange: actions.changeHemisphere,
            listAddAction: list?.owner
              ? () => setAddPeopleOpen(true)
              : undefined,
            regionDisabled: options.regionSelectionDisabled,
          }}
          search={{
            searchInputRef: commands.registerSearchInput,
            findOpen: search.state.open,
            findQuery: search.state.query,
            findError: search.state.error,
            findLoading: search.state.loading,
            findPending: search.state.pending,
            findMatches: search.state.matches,
            findIndex: search.state.index,
            onSearchOpen: search.actions.activate,
            onSearchClose: search.actions.close,
            onSearchQueryChange: search.actions.changeQuery,
            onSearchCycle: search.actions.cycle,
          }}
        />
      )}
    </div>
  );
}

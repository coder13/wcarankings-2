"use client";

import { forwardRef, useCallback, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { MotionConfig, motion, useIsPresent, useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";
import { TextDropdown, type TextDropdownOption } from "../Dropdown/TextDropdown";
import { EventPicker, type EventPickerOption } from "../EventPicker/EventPicker";
import { RegionPicker } from "../RegionPicker/RegionPicker";
import ArrowDownIcon from "../Icon/arrow-down.svg?react";
import ArrowUpIcon from "../Icon/arrow-up.svg?react";
import CloseIcon from "../Icon/close.svg?react";
import CompassIcon from "../Icon/compass.svg?react";
import SearchIcon from "../Icon/search.svg?react";
import { formatRankingNumber, type RankingEntry, type RegionOption, type RegionSelection } from "../RankingsExplorer/types";
import type { GenderFilter } from "@/lib/wca";
import { i18n } from "@/lib/i18n";
import { GenderPicker } from "../GenderPicker/GenderPicker";
import { useWcaProfile } from "../Auth/useWcaProfile";

const railLayoutTransition = { type: "spring", stiffness: 520, damping: 42, mass: 0.55 } as const;

export const RankingsRail = forwardRef<HTMLDivElement, { children: ReactNode; className?: string; direction: "up" | "down"; searchNavigation?: boolean; compactResultType?: boolean; animateLayout?: boolean }>(
  ({ children, className = "", direction, searchNavigation, compactResultType, animateLayout = false }, ref) => {
    const isPresent = useIsPresent();
    const reduceMotion = useReducedMotion();
    const shouldAnimateLayout = animateLayout || className.includes("Jump--listAdd");

    return (
      <MotionConfig reducedMotion="user">
        <motion.div
          layout={shouldAnimateLayout}
          layoutId={shouldAnimateLayout ? `rankings-rail-${direction}` : undefined}
          initial={false}
          animate={{
            opacity: isPresent ? 1 : 0,
          }}
          transition={{
            layout: railLayoutTransition,
            opacity: { duration: reduceMotion ? 0 : 0.14, ease: "easeOut" },
          }}
          className="RankingsRailTransition"
        >
          <div
            ref={ref}
            className={`Jump RankingsRail ${className}`}
            data-direction={direction}
            data-search-navigation={searchNavigation || undefined}
            data-compact-result-type={compactResultType || undefined}
          >
            {children}
          </div>
        </motion.div>
      </MotionConfig>
    );
  }
);

RankingsRail.displayName = "RankingsRail";

export type RankingsRailSearch = {
  searchInputRef?: (input: HTMLInputElement | null) => void;
  findOpen: boolean;
  findQuery: string;
  findError: string;
  findLoading: boolean;
  findPending: boolean;
  findMatches: RankingEntry[];
  findIndex: number;
  onSearchOpen: () => void;
  onSearchClose: () => void;
  onSearchQueryChange: (query: string) => void;
  onSearchCycle: (direction: -1 | 1) => void;
};

function RailSearch({ model }: { model: RankingsRailSearch }) {
  const { t } = useTranslation(undefined, { i18n });
  const {
    searchInputRef,
    findOpen,
    findQuery,
    findError,
    findLoading,
    findPending,
    findMatches,
    findIndex,
    onSearchOpen,
    onSearchClose,
    onSearchQueryChange,
    onSearchCycle,
  } = model;
  const inputRef = useRef<HTMLInputElement>(null);
  const [dismissedQuery, setDismissedQuery] = useState<string | null>(null);
  const dismissed = dismissedQuery === findQuery;
  const displayedQuery = dismissed ? "" : findQuery;
  const hasSearchText = displayedQuery.length > 0;
  const searchOpen = findOpen && !dismissed;

  const setInputElement = useCallback((input: HTMLInputElement | null) => {
    inputRef.current = input;
    searchInputRef?.(input);
  }, [searchInputRef]);

  let status = findError;
  if (!status && displayedQuery.trim()) {
    status = findMatches.length
      ? t("rankingsRail.search.status", { current: findIndex + 1, total: findMatches.length })
      : t("rankingsRail.search.noMatches");
  }
  const openSearch = () => {
    setDismissedQuery(null);
    onSearchOpen();
    inputRef.current?.focus();
    window.setTimeout(() => inputRef.current?.focus(), 25);
  };
  const dismissSearch = () => {
    setDismissedQuery(findQuery);
    inputRef.current?.blur();
    onSearchClose();
  };

  return (
    <div
      className="findBar findBar--rail"
      data-open={searchOpen}
      data-has-text={hasSearchText}
      role="search"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        dismissSearch();
      }}
    >
      <button className="findIcon" type="button" tabIndex={hasSearchText ? 0 : -1} onMouseDown={(event) => event.preventDefault()} onClick={openSearch} aria-label={t("rankingsRail.search.search")} title={t("rankingsRail.search.searchWithShortcut")}><SearchIcon /></button>
      <input ref={setInputElement} className="findInput" type="text" tabIndex={0} value={displayedQuery} onFocus={onSearchOpen} onChange={(event) => {
        setDismissedQuery(null);
        onSearchQueryChange(event.target.value);
      }} onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Tab" && !hasSearchText) {
          if (event.shiftKey) {
            onSearchClose();
            return;
          }
          event.preventDefault();
          onSearchClose();
          window.requestAnimationFrame(() => {
            document.querySelector<HTMLElement>(".listItem")?.focus();
          });
          return;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          onSearchCycle(event.shiftKey ? -1 : 1);
        }
      }} aria-label={t("rankingsRail.search.find")} />
      <span className={`findStatus${findError ? " isError" : ""}`} aria-live="polite">{findLoading || findPending ? <span className="searchSpinner" aria-label={t("rankingsRail.search.searching")} /> : status}</span>
      <button className="findClose" type="button" tabIndex={searchOpen || hasSearchText ? 0 : -1} onMouseDown={(event) => event.preventDefault()} onClick={dismissSearch} aria-label={t("rankingsRail.search.close")}><CloseIcon /></button>
    </div>
  );
}

export type RankingsControlsModel<T extends EventPickerOption> = {
  event: T;
  eventOptions?: readonly T[];
  additionalEventOptions?: readonly T[];
  onEventChange: (eventId: T["id"]) => void;
  rankingType: "single" | "average";
  onRankingTypeChange: (rankingType: "single" | "average") => void;
  period?: {
    options: readonly TextDropdownOption<string>[];
    value: string;
    onChange: (value: string) => void;
  };
  gender: readonly GenderFilter[];
  onGenderChange: (gender: GenderFilter[]) => void;
  regions: RegionOption[];
  regionSelection: RegionSelection;
  onRegionChange: (region: RegionOption) => void;
  onEventPickerTrigger?: (trigger: HTMLButtonElement | null) => void;
  compactResultType?: boolean;
  showResultType?: boolean;
  showEventPicker?: boolean;
  showGender?: boolean;
  hemisphere?: "north" | "south";
  onHemisphereChange?: (hemisphere: "north" | "south") => void;
  listAddAction?: () => void;
  regionDisabled?: boolean;
};

export function RankingsControlsRail<T extends EventPickerOption>({
  controls,
  search,
}: {
  controls: RankingsControlsModel<T>;
  search?: RankingsRailSearch;
}) {
  const { t } = useTranslation(undefined, { i18n });
  const {
    event,
    eventOptions,
    additionalEventOptions,
    onEventChange,
    rankingType,
    onRankingTypeChange,
    period,
    gender,
    onGenderChange,
    regions,
    regionSelection,
    onRegionChange,
    onEventPickerTrigger,
    compactResultType = false,
    showResultType = true,
    showEventPicker = true,
    showGender = true,
    hemisphere,
    onHemisphereChange,
    listAddAction,
    regionDisabled = false,
  } = controls;
  const nextType = rankingType === "single" ? "average" : "single";
  let primaryControl = null;
  if (showEventPicker) {
    primaryControl = (
      <EventPicker
        event={event}
        options={eventOptions}
        additionalOptions={additionalEventOptions}
        onChange={onEventChange}
        onTriggerReady={onEventPickerTrigger}
      />
    );
  } else if (hemisphere) {
    const nextHemisphere = hemisphere === "north" ? "south" : "north";
    primaryControl = (
      <button
        className="Jump-latitudeToggle"
        type="button"
        data-hemisphere={hemisphere}
        aria-label={t("rankingsRail.controls.latitudeSwitch", { hemisphere, nextHemisphere })}
        title={t("rankingsRail.controls.latitudeFirst", { hemisphere })}
        onClick={() => onHemisphereChange?.(nextHemisphere)}
      >
        <CompassIcon />
        <span>{t(`rankingsRail.controls.${hemisphere}`)}</span>
      </button>
    );
  }
  return (
    <RankingsRail className={`Jump--rankings${showResultType ? "" : " Jump--withoutResultType"}${hemisphere ? " Jump--withHemisphere" : ""}${listAddAction ? " Jump--withListAdd" : ""}`} direction="up" compactResultType={compactResultType}>
      <div className="Jump-railSettings">
        {primaryControl}
        {showResultType && <div className="Jump-resultTypeControl">
          <button className="Jump-resultTypeToggle" type="button" disabled={event.id === "333mbf"} aria-label={t("rankingsRail.controls.switchToRankingType", { rankingType: nextType })} onClick={() => onRankingTypeChange(nextType)}>{t(`rankingsRail.controls.${rankingType}`)}</button>
        </div>}
        {showGender && <GenderPicker className="Jump-genderPicker" value={gender} onChange={onGenderChange} />}
        <RegionPicker className="Jump-regionPicker" options={regions} selected={regionSelection} onChange={onRegionChange} disabled={regionDisabled} />
        {period && (
          <TextDropdown
            options={period.options}
            value={period.value}
            onChange={period.onChange}
            ariaLabel={t("rankingsRail.controls.personRankingPeriod")}
            className="personYearDropdown Jump-periodPicker"
          />
        )}
        {listAddAction && <button className="Jump-listAddButton" type="button" onClick={listAddAction}>{t("rankingsRail.controls.addToList")}</button>}
      </div>
      {search && <RailSearch model={search} />}
    </RankingsRail>
  );
}

export type RankingsPagerNavigation = {
  busy?: boolean;
  currentPosition: number;
  total: number;
  onJumpUp: () => void;
  onJumpDown: () => void;
  onJumpToTop?: () => void;
  onJumpToEnd?: () => void;
  onFocusMe?: (wcaId: string) => void;
};

export type RankingsPagerSearch = {
  active: boolean;
  onPrevious: () => void;
  onNext: () => void;
};

export function RankingsPagerRail({
  navigation,
  search,
}: {
  navigation: RankingsPagerNavigation;
  search: RankingsPagerSearch;
}) {
  const { t } = useTranslation(undefined, { i18n });
  const {
    busy = false,
    currentPosition,
    total,
    onJumpUp,
    onJumpDown,
    onJumpToTop,
    onJumpToEnd,
    onFocusMe,
  } = navigation;
  const {
    active: searchActive,
    onPrevious: onSearchPrevious,
    onNext: onSearchNext,
  } = search;
  const wcaId = useWcaProfile(Boolean(onFocusMe)).data?.profile?.wcaId ?? null;
  const currentLabels = {
    up: currentPosition <= 5000
      ? t("rankingsRail.pager.jumpToTop")
      : t("rankingsRail.pager.jumpUp", { distance: formatRankingNumber(5000) }),
    down:
      Number.isFinite(total) && currentPosition >= total - 5000
        ? t("rankingsRail.pager.jumpToEnd")
        : t("rankingsRail.pager.jumpDown", { distance: formatRankingNumber(5000) }),
  };
  const [pendingLabels, setPendingLabels] = useState<typeof currentLabels | null>(null);
  const labels = busy
    ? pendingLabels ?? currentLabels
    : currentLabels;
  const jumpUp = () => {
    if (busy) {
      onJumpToTop?.();
      return;
    }
    setPendingLabels(currentLabels);
    onJumpUp();
  };
  const jumpDown = () => {
    if (busy) {
      onJumpToEnd?.();
      return;
    }
    setPendingLabels(currentLabels);
    onJumpDown();
  };
  return <RankingsRail className="Jump--pager" direction="down" searchNavigation={searchActive}>
    <div className="Jump-pagerActions" aria-hidden={searchActive}>
      <button className="Jump-pagerButton" onClick={jumpUp} type="button" disabled={searchActive}><span>{labels.up}</span><ArrowUpIcon /></button>
      {wcaId && onFocusMe && <button className="Jump-pagerButton Jump-pagerButton--me" onClick={() => onFocusMe(wcaId)} type="button" disabled={searchActive || busy} aria-label={t("rankingsRail.pager.jumpToMyRanking")}><span>{t("rankingsRail.pager.myRank")}</span></button>}
      <button className="Jump-pagerButton" onClick={jumpDown} type="button" disabled={searchActive}><ArrowDownIcon /><span>{labels.down}</span></button>
    </div>
    <div className="Jump-searchNavigation" aria-hidden={!searchActive}><div className="Jump-searchNavigationContent">
      <button className="Jump-searchNavigationButton" onClick={onSearchPrevious} type="button" disabled={!searchActive}><ArrowUpIcon /><span>{t("rankingsRail.pager.previousPerson")}</span></button>
      <button className="Jump-searchNavigationButton" onClick={onSearchNext} type="button" disabled={!searchActive}><span>{t("rankingsRail.pager.nextPerson")}</span><ArrowDownIcon /></button>
    </div></div>
  </RankingsRail>;
}

export function ListBrowseControlsRail({ query, onQueryChange }: {
  query: string;
  onQueryChange: (query: string) => void;
}) {
  const { t } = useTranslation(undefined, { i18n });
  return (
    <RankingsRail className="Jump--listBrowse" direction="up">
      <div className="findBar findBar--rail" data-open="true" role="search">
        <span className="listBrowseSearchIcon" aria-hidden="true"><SearchIcon /></span>
        <input className="findInput" value={query} onChange={(event) => onQueryChange(event.target.value)} aria-label={t("rankingsRail.search.publicListsLabel")} placeholder={t("rankingsRail.search.publicLists")} autoFocus />
      </div>
    </RankingsRail>
  );
}

export function ListBrowsePagerRail({ onJumpUp, onJumpDown }: {
  onJumpUp: () => void;
  onJumpDown: () => void;
}) {
  const { t } = useTranslation(undefined, { i18n });
  return (
    <RankingsRail className="Jump--pager" direction="down">
      <div className="Jump-pagerActions">
        <button className="Jump-pagerButton" onClick={onJumpUp} type="button"><span>{t("rankingsRail.pager.jumpToTop")}</span><ArrowUpIcon /></button>
        <button className="Jump-pagerButton" onClick={onJumpDown} type="button"><ArrowDownIcon /><span>{t("rankingsRail.pager.jumpToEnd")}</span></button>
      </div>
    </RankingsRail>
  );
}

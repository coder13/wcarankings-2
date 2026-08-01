import Link from "next/link";
import { formatWcaResult, flagEmoji, RECORD_BADGE_LABELS } from "@/lib/wca";
import { useEffect, useRef, type CSSProperties } from "react";
import { formatRankingNumber, type RankingEntry } from "../RankingsExplorer/types";
import type { PersonEventDetails } from "@/lib/person-event-details";
import { RankingDetailsPanel } from "./RankingDetailsPanel";

type RankingRowDisplay = {
  eventId: string;
  rankingType: "single" | "average";
  animationIndex: number;
  searchMatched?: boolean;
  highlighted?: boolean;
  rankIsDuplicate?: boolean;
  hideIdentityId?: boolean;
};

type RankingRowInteraction = {
  rowIndex?: number;
  onNavigate?: (rowIndex: number, direction: -1 | 1) => void;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelected?: (personId: string) => void;
  onMemberContextMenu?: (entry: RankingEntry, position: { x: number; y: number }) => void;
};

type RankingRowDetails = {
  expanded?: boolean;
  closing?: boolean;
  skipAccordionAnimation?: boolean;
  eventDetails?: PersonEventDetails | null;
  detailsError?: string;
  onPrefetchDetails?: (entry: RankingEntry) => void;
  onCancelPrefetchDetails?: (entry: RankingEntry) => void;
  onToggle?: () => void;
};

export function RankingRow({
  entry,
  display,
  interaction = {},
  details = {},
}: {
  entry: RankingEntry;
  display: RankingRowDisplay;
  interaction?: RankingRowInteraction;
  details?: RankingRowDetails;
}) {
  const {
    eventId,
    rankingType,
    animationIndex,
    searchMatched = false,
    highlighted = false,
    rankIsDuplicate = false,
    hideIdentityId = false,
  } = display;
  const {
    rowIndex,
    onNavigate,
    selectionMode = false,
    selected = false,
    onToggleSelected,
    onMemberContextMenu,
  } = interaction;
  const {
    expanded = false,
    closing = false,
    skipAccordionAnimation = false,
    eventDetails,
    onPrefetchDetails,
    onCancelPrefetchDetails,
    detailsError = "",
    onToggle,
  } = details;
  const longPressTimerRef = useRef<number | null>(null);
  const longPressHandledRef = useRef(false);
  const clearLongPress = () => {
    if (longPressTimerRef.current === null) return;
    window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  };
  useEffect(() => () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
    }
  }, []);
  const style = {
    "--t-animation-delay": `${animationIndex * 10}ms`,
    minHeight: "65.45px",
  } as CSSProperties;
  const rank = entry.rank;
  const name = entry.personName;
  const id = entry.personId;
  const countryName = entry.countryName || "Country unavailable";
  const recordBadge = entry.recordBadges[0];
  const formattedResult = entry.formattedValue ??
    formatWcaResult(eventId, entry.best, rankingType);
  const inferredProfileHref = /^\d{4}[A-Z]{4}\d{2}$/.test(id) ? `/person/${id}` : "";
  const accordionVisible = expanded || closing;
  const identityContent = (
    <>
      <span
        className="countryFlag"
        role="img"
        aria-label={countryName}
        title={countryName}
      >
        {flagEmoji(entry.countryIso2)}
      </span>
      <span className="personName">
        <span className="name">{name}</span>
        {entry.identitySubtitle && (
          <span className="wcaId">{entry.identitySubtitle}</span>
        )}
        {!hideIdentityId && <span className="wcaId">{id}</span>}
      </span>
    </>
  );

  return (
    <li
      className="listItem"
      data-person-id={entry.personId}
      data-row-index={rowIndex}
      style={style}
      tabIndex={0}
      aria-label={`Rank ${formatRankingNumber(rank)}: ${name}, ${formattedResult}`}
      onKeyDown={(keyboardEvent) => {
        if (keyboardEvent.altKey || keyboardEvent.ctrlKey || keyboardEvent.metaKey)
          return;
        if (onToggle && (keyboardEvent.key === "Enter" || keyboardEvent.key === " ")) {
          keyboardEvent.preventDefault();
          onToggle();
          return;
        }
        let direction: -1 | 1 | null = null;
        if (keyboardEvent.key === "ArrowUp") direction = -1;
        if (keyboardEvent.key === "ArrowDown") direction = 1;
        if (direction === null || rowIndex === undefined || !onNavigate) return;
        keyboardEvent.preventDefault();
        onNavigate(rowIndex, direction);
      }}
    >
      <div
          className={`row${animationIndex % 2 === 1 ? " row--alternate" : ""}${
          searchMatched ? " row--searchResult" : ""
        }${
          highlighted ? " row--searchMatch" : ""
        }${
          onMemberContextMenu ? " row--contextMenu" : ""
        }${accordionVisible ? " row--expanded" : ""}`}
      >
        <div
          className="rowHeader"
          onPointerEnter={(event) => {
            if (event.pointerType === "mouse" || event.pointerType === "pen") {
              onPrefetchDetails?.(entry);
            }
          }}
          onPointerLeave={() => onCancelPrefetchDetails?.(entry)}
          onClick={() => {
            if (longPressHandledRef.current) {
              longPressHandledRef.current = false;
              return;
            }
            if (selectionMode) {
              onToggleSelected?.(entry.personId);
              return;
            }
            onToggle?.();
          }}
          onContextMenu={(event) => {
            if (!onMemberContextMenu) return;
            event.preventDefault();
            onMemberContextMenu(entry, { x: event.clientX, y: event.clientY });
          }}
          onPointerDown={(event) => {
            if (!onMemberContextMenu || event.pointerType !== "touch") return;
            const { left, top, width, height } = event.currentTarget.getBoundingClientRect();
            longPressHandledRef.current = false;
            longPressTimerRef.current = window.setTimeout(() => {
              longPressHandledRef.current = true;
              onMemberContextMenu(entry, { x: left + width / 2, y: top + height / 2 });
            }, 500);
          }}
          onPointerUp={clearLongPress}
          onPointerCancel={clearLongPress}
          onPointerMove={clearLongPress}
        >
          {selectionMode && <button className="memberSelectionToggle" type="button" aria-label={`Select ${name}`} aria-pressed={selected} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onToggleSelected?.(entry.personId); }}>{selected ? "✓" : ""}</button>}
          <span className={`rank${rankIsDuplicate ? " rank--duplicate" : ""}`}>
            {formatRankingNumber(rank)}
          </span>
          {(entry.profileHref || inferredProfileHref) && !onToggle ? (
            <Link className="identity identity--link" href={entry.profileHref || inferredProfileHref}>
              {identityContent}
            </Link>
          ) : (
            <span className="identity">{identityContent}</span>
          )}
          <span className="result">
            <span className="resultValue">
              <span
                className="recordBadges"
                aria-hidden={!recordBadge}
                aria-label={recordBadge ? "Records" : undefined}
              >
                {recordBadge && (
                  <span
                    className={`recordBadge recordBadge--${recordBadge}`}
                    role="img"
                    aria-label={RECORD_BADGE_LABELS[recordBadge]}
                    title={RECORD_BADGE_LABELS[recordBadge]}
                  >
                    {recordBadge}
                  </span>
                )}
              </span>
              <span className="best">
                {formattedResult}
              </span>
            </span>
            {(entry.resultSubtitle ?? entry.competitionName) && (
              <span className="competitionName" title={entry.resultSubtitle ?? entry.competitionName}>
                {entry.resultSubtitle ?? entry.competitionName}
              </span>
            )}
          </span>
        </div>
        <RankingDetailsPanel
          state={{
            visible: accordionVisible,
            closing,
            skipAnimation: skipAccordionAnimation,
            error: detailsError,
          }}
          data={{
            eventId,
            details: eventDetails,
            profileHref: entry.profileHref || inferredProfileHref,
          }}
        />
      </div>
    </li>
  );
}

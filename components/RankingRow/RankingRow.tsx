import { formatWcaResult, flagEmoji, RECORD_BADGE_LABELS } from "@/lib/wca";
import { useEffect, useRef } from "react";
import { formatRankingNumber, type RankingEntry } from "../RankingsExplorer/types";

export function RankingRow({
  entry,
  eventId,
  rankingType,
  animationIndex,
  searchMatched = false,
  highlighted = false,
  rankIsDuplicate = false,
  hideIdentityId = false,
  rowIndex,
  onNavigate,
  selectionMode = false,
  selected = false,
  onToggleSelected,
  onMemberContextMenu,
}: {
  entry: RankingEntry;
  eventId: string;
  rankingType: "single" | "average";
  animationIndex: number;
  searchMatched?: boolean;
  highlighted?: boolean;
  rankIsDuplicate?: boolean;
  hideIdentityId?: boolean;
  rowIndex?: number;
  onNavigate?: (rowIndex: number, direction: -1 | 1) => void;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelected?: (personId: string) => void;
  onMemberContextMenu?: (entry: RankingEntry, position: { x: number; y: number }) => void;
}) {
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
  } as React.CSSProperties;
  const rank = entry.rank;
  const name = entry.personName;
  const id = entry.personId;
  const countryName = entry.countryName || "Country unavailable";
  const countryFlag = flagEmoji(entry.countryIso2);
  const recordBadge = entry.recordBadges[0];
  const formattedResult = entry.formattedValue ??
    formatWcaResult(eventId, entry.best, rankingType);

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
        }`}
        onClick={() => {
          if (longPressHandledRef.current) {
            longPressHandledRef.current = false;
            return;
          }
          if (selectionMode) onToggleSelected?.(entry.personId);
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
        <span className="identity">
          <span
            className="countryFlag"
            role="img"
            aria-label={countryName}
            title={countryName}
          >
            {countryFlag}
          </span>
          <span className="personName">
            <span className="name">{name}</span>
            {entry.identitySubtitle && (
              <span className="wcaId">{entry.identitySubtitle}</span>
            )}
            {!hideIdentityId && <span className="wcaId">{id}</span>}
          </span>
        </span>
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
          {entry.competitionName && (
            <span className="competitionName" title={entry.competitionName}>
              {entry.competitionName}
            </span>
          )}
        </span>
      </div>
    </li>
  );
}

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { formatWcaResult, flagEmoji, RECORD_BADGE_LABELS } from "@/lib/wca";
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { formatRankingNumber, type RankingEntry } from "../RankingsExplorer/types";
import type { PersonEventBest, PersonEventDetails } from "@/lib/person-event-details";

const ACCORDION_TRANSITION_SECONDS = 0.2;

function rankSummary(
  details: PersonEventDetails,
  best: PersonEventBest,
  order: "global-first" | "national-first",
) {
  const ranks = {
    world: best.worldRank
      ? { scope: "world", label: `#${formatRankingNumber(best.worldRank)}`, ariaLabel: `World #${formatRankingNumber(best.worldRank)}` }
      : null,
    continent: best.continentRank
      ? { scope: "continent", label: `#${formatRankingNumber(best.continentRank)}`, ariaLabel: `${details.person.continentName || details.person.continentId || "Continent"} #${formatRankingNumber(best.continentRank)}` }
      : null,
    national: best.countryRank && details.person.countryName
      ? { scope: "national", label: `#${formatRankingNumber(best.countryRank)}`, ariaLabel: `${details.person.countryName} #${formatRankingNumber(best.countryRank)}` }
      : null,
  } satisfies Record<"world" | "continent" | "national", { scope: "world" | "continent" | "national"; label: string; ariaLabel: string } | null>;
  const orderedScopes = order === "global-first"
    ? ["world", "continent", "national"] as const
    : ["national", "continent", "world"] as const;
  return orderedScopes
    .map((scope) => ranks[scope])
    .filter((rank): rank is { scope: "world" | "continent" | "national"; label: string; ariaLabel: string } => Boolean(rank));
}

function averageAttemptLine(best: PersonEventBest) {
  return best.attempts
    .map((attempt) => attempt.counted ? attempt.formatted : `(${attempt.formatted})`)
    .join(", ");
}

function ResultDetail({
  label,
  best,
  details,
  only = false,
}: {
  label: "Single" | "Average";
  best: PersonEventBest | null;
  details: PersonEventDetails;
  only?: boolean;
}) {
  const resultClassName = `rowAccordionResult rowAccordionResult--${label.toLowerCase()}${only ? " rowAccordionResult--only" : ""}`;
  if (!best) {
    return (
      <section className={resultClassName}>
        <h3>{label}</h3>
        <p className="rowAccordionEmpty">No {label.toLowerCase()} result for {details.event.shortName}.</p>
      </section>
    );
  }
  const ranks = rankSummary(
    details,
    best,
    label === "Single" ? "national-first" : "global-first",
  );
  return (
    <section className={resultClassName}>
      <h3>{label}</h3>
      <strong className="rowAccordionResultValue">{best.formatted}</strong>
      {ranks.length > 0 && (
        <p className="rankScopes" aria-label="Ranking scopes">
          {ranks.map((rank, index) => (
            <span key={rank.scope} className={`rankScope rankScope--${rank.scope}`} aria-label={rank.ariaLabel} title={rank.ariaLabel}>
              {index > 0 && <span className="rankScopeSeparator">·</span>}
              {rank.label}
            </span>
          ))}
        </p>
      )}
      <p>{best.competitionName}</p>
      {label === "Average" && (
        best.attempts.length
          ? <p className="rowAccordionSolves" aria-label={`${label} solves`}>{averageAttemptLine(best)}</p>
          : <p className="rowAccordionEmpty">Solve details unavailable</p>
      )}
    </section>
  );
}

function AccordionSkeleton({ singleResultOnly = false }: { singleResultOnly?: boolean }) {
  return (
    <div className="rowAccordionSkeleton" aria-label="Loading competitor details" role="status">
      <div className={`rowAccordionResults${singleResultOnly ? " rowAccordionResults--singleOnly" : ""}`}>
        <section className={`rowAccordionResult rowAccordionResult--single${singleResultOnly ? " rowAccordionResult--only" : ""}`}>
          <span className="rowAccordionSkeletonLine rowAccordionSkeletonLine--label" />
          <span className="rowAccordionSkeletonLine rowAccordionSkeletonLine--value" />
          <span className="rowAccordionSkeletonLine rowAccordionSkeletonLine--competition" />
          <span className="rowAccordionSkeletonLine rowAccordionSkeletonLine--rank" />
        </section>
        {!singleResultOnly && (
          <section className="rowAccordionResult rowAccordionResult--average">
            <span className="rowAccordionSkeletonLine rowAccordionSkeletonLine--label" />
            <span className="rowAccordionSkeletonLine rowAccordionSkeletonLine--value" />
            <span className="rowAccordionSkeletonLine rowAccordionSkeletonLine--competition" />
            <span className="rowAccordionSkeletonLine rowAccordionSkeletonLine--rank" />
            <span className="rowAccordionSkeletonLine rowAccordionSkeletonLine--solves" />
          </section>
        )}
      </div>
      <footer className="rowAccordionFooter">
        <span className="rowAccordionSkeletonLine rowAccordionSkeletonLine--footer" />
      </footer>
    </div>
  );
}

function AccordionFrame({
  closing,
  initial,
  ready,
  children,
}: {
  closing: boolean;
  initial: boolean;
  ready: boolean;
  children: ReactNode;
}) {
  return (
    <motion.div
      className={`rowAccordion${ready ? " rowAccordion--ready" : ""}`}
      initial={initial ? false : closing ? false : { height: 0, marginBottom: 0, opacity: 0 }}
      animate={closing
        ? { height: 0, marginBottom: 0, opacity: 0 }
        : { height: "auto", marginBottom: "0.4rem", opacity: 1 }}
      exit={{ height: 0, marginBottom: 0, opacity: 0 }}
      transition={{
        height: { duration: ACCORDION_TRANSITION_SECONDS, ease: [0.2, 0.7, 0.2, 1] },
        marginBottom: { duration: ACCORDION_TRANSITION_SECONDS, ease: [0.2, 0.7, 0.2, 1] },
        opacity: { duration: ACCORDION_TRANSITION_SECONDS * 0.5, ease: "easeOut" },
      }}
    >
      <div className="rowAccordionInner">
        {children}
      </div>
    </motion.div>
  );
}

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
  expanded = false,
  closing = false,
  skipAccordionAnimation = false,
  eventDetails,
  onPrefetchDetails,
  onCancelPrefetchDetails,
  detailsError = "",
  onToggle,
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
  expanded?: boolean;
  closing?: boolean;
  skipAccordionAnimation?: boolean;
  eventDetails?: PersonEventDetails | null;
  detailsError?: string;
  onPrefetchDetails?: (entry: RankingEntry) => void;
  onCancelPrefetchDetails?: (entry: RankingEntry) => void;
  onToggle?: () => void;
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
  } as CSSProperties;
  const rank = entry.rank;
  const name = entry.personName;
  const id = entry.personId;
  const countryName = entry.countryName || "Country unavailable";
  const countryFlag = flagEmoji(entry.countryIso2);
  const recordBadge = entry.recordBadges[0];
  const formattedResult = entry.formattedValue ??
    formatWcaResult(eventId, entry.best, rankingType);
  const inferredProfileHref = /^\d{4}[A-Z]{4}\d{2}$/.test(id) ? `/person/${id}` : "";
  const accordionVisible = expanded || closing;
  const detailsPending = accordionVisible && !eventDetails && !detailsError;
  const singleResultOnly = eventId === "333mbf";
  const identityContent = (
    <>
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
      aria-expanded={onToggle ? expanded : undefined}
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
        <AnimatePresence initial={false} mode="sync">
          {accordionVisible && (
            <AccordionFrame
              key={`accordion-${id}`}
              closing={closing}
              initial={skipAccordionAnimation}
              ready={!detailsPending}
            >
              <div className="rowAccordionContent">
                {detailsError && !eventDetails && <div className="rowAccordionState">{detailsError}</div>}
                {eventDetails && (
                  <>
                    <div className={`rowAccordionResults${singleResultOnly ? " rowAccordionResults--singleOnly" : ""}`}>
                      <ResultDetail label="Single" best={eventDetails.single} details={eventDetails} only={singleResultOnly} />
                      {!singleResultOnly && <ResultDetail label="Average" best={eventDetails.average} details={eventDetails} />}
                    </div>
                    <footer className="rowAccordionFooter" onClick={(event) => event.stopPropagation()}>
                      <Link href={entry.profileHref || inferredProfileHref}>Full competitor profile</Link>
                    </footer>
                  </>
                )}
              </div>
              <div
                className={`rowAccordionLoading${detailsPending ? "" : " rowAccordionLoading--hidden"}`}
                aria-hidden={!detailsPending}
              >
                <AccordionSkeleton singleResultOnly={singleResultOnly} />
              </div>
            </AccordionFrame>
          )}
        </AnimatePresence>
      </div>
    </li>
  );
}

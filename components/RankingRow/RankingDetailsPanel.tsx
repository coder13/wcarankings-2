import Link from "next/link";
import type { PersonEventBest, PersonEventDetails } from "@/lib/person-event-details";
import { rankingScope } from "../RankingsExplorer/types";

type RankingDetailsState = {
  visible: boolean;
  closing: boolean;
  height: number;
  progress: number;
  error: string;
};

type RankingDetailsData = {
  eventId: string;
  details?: PersonEventDetails | null;
  profileHref: string;
};

function rankSummary(
  details: PersonEventDetails,
  best: PersonEventBest,
  order: "global-first" | "national-first",
) {
  const ranks = {
    world: best.worldRank
      ? rankingScope("world", "World", best.worldRank)
      : null,
    continent: best.continentRank
      ? rankingScope(
          "continent",
          details.person.continentName ||
            details.person.continentId ||
            "Continent",
          best.continentRank,
        )
      : null,
    national: best.countryRank && details.person.countryName
      ? rankingScope("national", details.person.countryName, best.countryRank)
      : null,
  } satisfies Record<"world" | "continent" | "national", { scope: "world" | "continent" | "national"; label: string; ariaLabel: string } | null>;
  return (order === "global-first"
    ? ["world", "continent", "national"] as const
    : ["national", "continent", "world"] as const)
    .map((scope) => ranks[scope])
    .filter((rank): rank is NonNullable<typeof rank> => Boolean(rank));
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
        <p className="rowAccordionEmpty">
          No {label.toLowerCase()} result for {details.event.shortName}.
        </p>
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
            <span
              key={rank.scope}
              className={`rankScope rankScope--${rank.scope}`}
              aria-label={rank.ariaLabel}
              title={rank.ariaLabel}
            >
              {index > 0 && <span className="rankScopeSeparator">·</span>}
              {rank.label}
            </span>
          ))}
        </p>
      )}
      <p>{best.competitionName}</p>
      {label === "Average" && (
        best.attempts.length
          ? (
              <p className="rowAccordionSolves" aria-label={`${label} solves`}>
                {best.attempts
                  .map((attempt) => attempt.counted
                    ? attempt.formatted
                    : `(${attempt.formatted})`)
                  .join(", ")}
              </p>
            )
          : <p className="rowAccordionEmpty">Solve details unavailable</p>
      )}
    </section>
  );
}

function AccordionSkeleton({ singleResultOnly }: { singleResultOnly: boolean }) {
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

export function RankingDetailsPanel({
  state,
  data,
}: {
  state: RankingDetailsState;
  data: RankingDetailsData;
}) {
  const { visible, closing, height, progress, error } = state;
  const { eventId, details, profileHref } = data;
  const singleResultOnly = eventId === "333mbf";
  const pending = visible && !details && !error;

  if (!visible) return null;

  return (
    <div
      className={`rowAccordion${!pending ? " rowAccordion--ready" : ""}`}
      data-closing={closing}
      style={{ height: `${height}px`, opacity: progress }}
    >
      <div className="rowAccordionInner">
        <div className="rowAccordionContent">
          {error && !details && <div className="rowAccordionState">{error}</div>}
          {details && (
            <>
              <div className={`rowAccordionResults${singleResultOnly ? " rowAccordionResults--singleOnly" : ""}`}>
                <ResultDetail
                  label="Single"
                  best={details.single}
                  details={details}
                  only={singleResultOnly}
                />
                {!singleResultOnly && (
                  <ResultDetail
                    label="Average"
                    best={details.average}
                    details={details}
                  />
                )}
              </div>
              <footer
                className="rowAccordionFooter"
                onClick={(event) => event.stopPropagation()}
              >
                <Link href={profileHref}>Full competitor profile</Link>
              </footer>
            </>
          )}
        </div>
        <div
          className={`rowAccordionLoading${pending ? "" : " rowAccordionLoading--hidden"}`}
          aria-hidden={!pending}
        >
          <AccordionSkeleton singleResultOnly={singleResultOnly} />
        </div>
      </div>
    </div>
  );
}

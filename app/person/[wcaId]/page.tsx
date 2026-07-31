import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  loadPersonProfile,
  metricHref,
  normalizeProfileWcaId,
  rankingHref,
  type PersonProfileMetricScore,
  type PersonProfileResult,
} from "@/lib/person-profile";
import { formatExportDate, formatRankingNumber } from "@/components/RankingsExplorer/types";
import { flagEmoji, formatWcaResult, type RankingType, type RegionScope } from "@/lib/wca";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ wcaId: string }>;
};

function scopeLabel(scope: RegionScope, regionId: string, profile: Awaited<ReturnType<typeof loadPersonProfile>> extends infer T ? NonNullable<T> : never) {
  if (scope === "world") return "World";
  if (scope === "continent") return profile.person.continentName || regionId;
  return profile.person.countryName || regionId;
}

function rankLine(result: PersonProfileResult, profile: NonNullable<Awaited<ReturnType<typeof loadPersonProfile>>>) {
  return [
    { scope: "world", label: `#${formatRankingNumber(result.worldRank)}`, ariaLabel: `World #${formatRankingNumber(result.worldRank)}` },
    { scope: "continent", label: `#${formatRankingNumber(result.continentRank)}`, ariaLabel: `${profile.person.continentName || profile.person.continentId} #${formatRankingNumber(result.continentRank)}` },
    { scope: "national", label: `#${formatRankingNumber(result.countryRank)}`, ariaLabel: `${profile.person.countryName || profile.person.countryId} #${formatRankingNumber(result.countryRank)}` },
  ];
}

function bestResults(profile: NonNullable<Awaited<ReturnType<typeof loadPersonProfile>>>, type: RankingType) {
  return profile.eventRows
    .map((row) => ({ event: row, result: row[type] }))
    .filter((row): row is { event: typeof profile.eventRows[number]; result: PersonProfileResult } => row.result !== null)
    .sort((left, right) => left.result.worldRank - right.result.worldRank)
    .slice(0, 4);
}

function metricScore(profile: NonNullable<Awaited<ReturnType<typeof loadPersonProfile>>>, type: RankingType, scope: RegionScope) {
  const regionId = scope === "world" ? "" : scope === "continent" ? profile.person.continentId : profile.person.countryId;
  return profile.metricScores.find((score) =>
    score.resultType === type &&
    score.scope === scope &&
    score.regionId === regionId
  ) ?? null;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]).join("").toUpperCase() || "?";
}

function ScoreRows({
  profile,
  type,
  metric,
}: {
  profile: NonNullable<Awaited<ReturnType<typeof loadPersonProfile>>>;
  type: RankingType;
  metric: "sum" | "kinch";
}) {
  const scores = (["world", "continent", "country"] as const)
    .map((scope) => metricScore(profile, type, scope))
    .filter((score): score is PersonProfileMetricScore => Boolean(score));
  if (!scores.length) return <p className="profileEmpty">No {type} score yet.</p>;
  return (
    <ul className="profileScoreRows">
      {scores.map((score) => {
        const isKinch = metric === "kinch";
        const scoreValue = isKinch
          ? formatWcaResult("sor-kinch", score.kinchScore / 17)
          : formatWcaResult("SOR", score.score);
        const rank = isKinch ? score.kinchRank : score.rank;
        return (
          <li key={`${score.resultType}:${score.scope}:${score.regionId}`}>
            <Link
              href={metricHref({
                metric: isKinch ? "sor-kinch" : "SOR",
                resultType: type,
                scope: score.scope,
                regionId: score.regionId,
                wcaId: profile.person.id,
              })}
            >
              <span>{scopeLabel(score.scope, score.regionId, profile)}</span>
              <strong>{scoreValue}</strong>
              <span>#{formatRankingNumber(rank)}</span>
              <span>{score.coverage}/{score.requiredCoverage} events</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { wcaId } = await params;
  const normalized = normalizeProfileWcaId(wcaId);
  if (!normalized) return { title: "Competitor profile" };
  const profile = await loadPersonProfile(normalized);
  if (!profile) return { title: `${normalized} | WCA Rankings` };
  return {
    title: `${profile.person.name} | WCA Rankings`,
    description: `WCA rankings profile for ${profile.person.name} (${profile.person.id}).`,
  };
}

export default async function PersonProfilePage({ params }: PageProps) {
  const { wcaId } = await params;
  const profile = await loadPersonProfile(wcaId);
  if (!profile) notFound();
  const singleCoverage = profile.eventRows.filter((row) => row.single).length;
  const averageCoverage = profile.eventRows.filter((row) => row.average).length;

  return (
    <main className="app profilePage">
      <header className="profileHero">
        <div className="profileIdentity">
          <span className="profileAvatar" aria-hidden="true">
            {profile.person.avatarUrl ? (
              <img src={profile.person.avatarUrl} alt="" decoding="async" referrerPolicy="no-referrer" />
            ) : initials(profile.person.name)}
          </span>
          <div>
          <Link href="/" className="profileBackLink">WCA Rankings</Link>
          <h1>{profile.person.name}</h1>
          <p>
            <span
              className="profileFlag"
              role="img"
              aria-label={profile.person.countryName || "Country unavailable"}
            >
              {flagEmoji(profile.person.countryIso2)}
            </span>
            <span>{profile.person.id}</span>
            {profile.person.countryName && <span>{profile.person.countryName}</span>}
          </p>
          </div>
        </div>
        <a
          className="profileExternalLink"
          href={`https://www.worldcubeassociation.org/persons/${profile.person.id}`}
          target="_blank"
          rel="noreferrer"
        >
          WCA profile
        </a>
      </header>

      <section className="profileFreshness" aria-label="Export freshness">
        <span>Snapshot</span>
        <strong>{profile.exportDate ? formatExportDate(profile.exportDate) : "Export date unavailable"}</strong>
      </section>

      <section className="profileSummaryGrid" aria-label="Profile summary">
        <section className="profilePanel">
          <h2>Best Single Rankings</h2>
          {bestResults(profile, "single").length ? (
            <ul className="profileBestList">
              {bestResults(profile, "single").map(({ event, result }) => (
                <li key={event.eventId}>
                  <Link href={rankingHref({ eventId: event.eventId, resultType: "single", wcaId: profile.person.id })}>
                    <span>{event.eventShortName}</span>
                    <strong>{result.formatted}</strong>
                    <span>World #{formatRankingNumber(result.worldRank)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className="profileEmpty">No single results yet.</p>}
        </section>
        <section className="profilePanel">
          <h2>Best Average Rankings</h2>
          {bestResults(profile, "average").length ? (
            <ul className="profileBestList">
              {bestResults(profile, "average").map(({ event, result }) => (
                <li key={event.eventId}>
                  <Link href={rankingHref({ eventId: event.eventId, resultType: "average", wcaId: profile.person.id })}>
                    <span>{event.eventShortName}</span>
                    <strong>{result.formatted}</strong>
                    <span>World #{formatRankingNumber(result.worldRank)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className="profileEmpty">No average results yet.</p>}
        </section>
        <section className="profilePanel">
          <h2>Kinch</h2>
          <h3>Single</h3>
          <ScoreRows profile={profile} type="single" metric="kinch" />
        </section>
        <section className="profilePanel">
          <h2>Sum of Ranks</h2>
          <h3>Single</h3>
          <ScoreRows profile={profile} type="single" metric="sum" />
          <h3>Average</h3>
          <ScoreRows profile={profile} type="average" metric="sum" />
        </section>
        <section className="profilePanel profilePanel--wide">
          <h2>Event Coverage</h2>
          <div className="coverageMeters">
            <div>
              <span>Single</span>
              <strong>{singleCoverage}/17</strong>
            </div>
            <div>
              <span>Average</span>
              <strong>{averageCoverage}/16</strong>
            </div>
          </div>
        </section>
      </section>

      <section className="profileMatrixSection">
        <h2>Event Matrix</h2>
        <div className="profileMatrixScroller">
          <table className="profileMatrix">
            <thead>
              <tr>
                <th>Event</th>
                <th>Single</th>
                <th>Average</th>
                <th>Kinch</th>
              </tr>
            </thead>
            <tbody>
              {profile.eventRows.map((row) => (
                <tr key={row.eventId}>
                  <th scope="row">
                    <span>{row.eventShortName}</span>
                    <small>{row.eventName}</small>
                  </th>
                  <td>{row.single ? (
                    <Link href={rankingHref({ eventId: row.eventId, resultType: "single", wcaId: profile.person.id })}>
                      <strong>{row.single.formatted}</strong>
                      <span className="rankScopes">
                        {rankLine(row.single, profile).map((rank) => <span key={rank.scope} className={`rankScope rankScope--${rank.scope}`} aria-label={rank.ariaLabel} title={rank.ariaLabel}>{rank.label}</span>)}
                      </span>
                      {row.single.competitionName && <small>{row.single.competitionName}</small>}
                    </Link>
                  ) : <span className="profileMissing">No single</span>}</td>
                  <td>{row.average ? (
                    <Link href={rankingHref({ eventId: row.eventId, resultType: "average", wcaId: profile.person.id })}>
                      <strong>{row.average.formatted}</strong>
                      <span className="rankScopes">
                        {rankLine(row.average, profile).map((rank) => <span key={rank.scope} className={`rankScope rankScope--${rank.scope}`} aria-label={rank.ariaLabel} title={rank.ariaLabel}>{rank.label}</span>)}
                      </span>
                      {row.average.competitionName && <small>{row.average.competitionName}</small>}
                    </Link>
                  ) : <span className="profileMissing">{row.eventId === "333mbf" ? "No average ranking" : "No average"}</span>}</td>
                  <td>
                    {row.singleMetric?.kinchValue !== null && row.singleMetric?.kinchValue !== undefined
                      ? <span className="profileMetricValue">{formatWcaResult("sor-kinch", row.singleMetric.kinchValue)}</span>
                      : <span className="profileMissing">No Kinch</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

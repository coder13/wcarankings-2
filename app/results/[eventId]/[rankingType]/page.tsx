import Link from "next/link";
import { notFound } from "next/navigation";
import { flagEmoji, formatWcaResult, isEventId, isRankingType, parseRegionQuery, RECORD_BADGE_LABELS } from "@/lib/wca";
import { loadResultLeaderboard, roundName } from "@/lib/result-rankings";

export const dynamic = "force-dynamic";

function param(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function ResultLeaderboard({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string; rankingType: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { eventId, rankingType } = await params;
  if (!isEventId(eventId) || !isRankingType(rankingType) || (eventId === "333mbf" && rankingType === "average")) notFound();
  const query = await searchParams;
  const { scope, regionId } = parseRegionQuery(param(query.region));
  const page = Math.max(0, Number.parseInt(param(query.page), 10) || 0);
  const data = await loadResultLeaderboard({ eventId, type: rankingType, scope, regionId, page });
  const resultLabel = rankingType === "single" ? "Singles" : "Averages";
  const pageUrl = (nextPage: number) => {
    const next = new URLSearchParams();
    if (regionId) next.set("region", regionId);
    if (nextPage) next.set("page", String(nextPage));
    const suffix = next.toString();
    return `/results/${eventId}/${rankingType}${suffix ? `?${suffix}` : ""}`;
  };

  return (
    <main className="app">
      <header className="header">
        <div className="headerTopRow">
          <h1><Link href="/">WCA Rankings</Link></h1>
          <Link href={`/?eventId=${eventId}${rankingType === "average" ? "&result=average" : ""}`}>Personal bests</Link>
        </div>
        <p>All-time {eventId} {resultLabel}. Each row is an official round result, so competitors can appear more than once.</p>
      </header>
      <ol className="listContainer">
        {data.entries.map((entry) => {
          const badge = entry.recordBadges[0];
          return <li key={entry.resultId} className="row">
            <span className="rank">{entry.rank}</span>
            <span className="identity">
              <span className="countryFlag" title={entry.countryName}>{flagEmoji(entry.countryIso2)}</span>
              <a href={`https://www.worldcubeassociation.org/persons/${entry.personId}`}>{entry.personName}<span className="wcaId">{entry.personId}</span></a>
            </span>
            <span className="result">
              <span className="best">{badge && <abbr title={RECORD_BADGE_LABELS[badge]}>{badge} </abbr>}{formatWcaResult(eventId, entry.value, rankingType)}</span>
              <a className="competitionName" href={`https://www.worldcubeassociation.org/competitions/${entry.competitionId}`}>
                {entry.competitionName} · {entry.competitionDate ?? "Date unavailable"} · {roundName(entry.roundTypeId)}
              </a>
            </span>
          </li>;
        })}
      </ol>
      <nav aria-label="Result pages">
        {page > 0 && <Link href={pageUrl(page - 1)}>Previous</Link>}
        <span> Showing {data.entries.length ? page * data.pageSize + 1 : 0}–{page * data.pageSize + data.entries.length} of {data.total.toLocaleString()} </span>
        {page * data.pageSize + data.entries.length < data.total && <Link href={pageUrl(page + 1)}>Next</Link>}
      </nav>
    </main>
  );
}

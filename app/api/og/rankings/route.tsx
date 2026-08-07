import { ImageResponse } from "next/og";
import {
  flagEmoji,
  formatWcaResult,
  isEventId,
  isRankingEventId,
  isRankingType,
} from "@/lib/wca";
import type { RankingDocumentTitleInput } from "@/lib/ranking-document-title";
import { isMedalRankingType } from "@/lib/medal-rankings";
import {
  loadTopRankingEntries,
  type RankingPageEntry,
} from "@/services/rankings/page-metadata";

export const dynamic = "force-dynamic";

const subjects = new Set<RankingDocumentTitleInput["subject"]>([
  "people",
  "results",
  "competitions",
  "cities",
]);

const competitionRankings = new Set<
  RankingDocumentTitleInput["competitionRanking"]
>(["best-result", "podiums", "competitor-count", "latitude"]);

const cityRankings = new Set<RankingDocumentTitleInput["cityRanking"]>([
  "fastest-single",
  "fastest-average",
  "competitors",
  "competitions",
  "solves",
]);

function booleanParam(params: URLSearchParams, key: string) {
  return params.get(key) === "true";
}

function metadataInput(params: URLSearchParams): RankingDocumentTitleInput {
  const subjectValue = params.get("subject");
  const subject = subjects.has(subjectValue as RankingDocumentTitleInput["subject"])
    ? (subjectValue as RankingDocumentTitleInput["subject"])
    : "people";
  const personMedalRanking = booleanParam(params, "personMedalRanking");
  const requestedEvent = params.get("eventId") ?? "";
  let eventId = "333";
  if (personMedalRanking) {
    eventId = isEventId(requestedEvent) ? requestedEvent : "all";
  } else if (isRankingEventId(requestedEvent)) {
    eventId = requestedEvent;
  }
  const requestedResult = params.get("result") ?? "single";
  const rankingType = isRankingType(requestedResult)
    ? requestedResult
    : "single";
  const requestedCompetitionRanking = params.get("competitionRanking") ?? "best-result";
  const competitionRanking = competitionRankings.has(
    requestedCompetitionRanking as RankingDocumentTitleInput["competitionRanking"],
  )
    ? (requestedCompetitionRanking as RankingDocumentTitleInput["competitionRanking"])
    : "best-result";
  const requestedCityRanking = params.get("cityRanking") ?? "fastest-single";
  const cityRanking = cityRankings.has(
    requestedCityRanking as RankingDocumentTitleInput["cityRanking"],
  )
    ? (requestedCityRanking as RankingDocumentTitleInput["cityRanking"])
    : "fastest-single";
  const requestedYear = Number(params.get("year"));
  const medal = params.get("medal") ?? "overall";

  return {
    subject,
    eventId,
    rankingType,
    competitionRanking,
    cityRanking,
    year: Number.isInteger(requestedYear) ? requestedYear : null,
    personCompetitionRanking: booleanParam(
      params,
      "personCompetitionRanking",
    ),
    personMedalRanking,
    personPrStreakRanking: booleanParam(params, "personPrStreakRanking"),
    medalType: isMedalRankingType(medal) ? medal : "overall",
  };
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const input = metadataInput(params);
  const topResults = await loadTopRankingEntries(params, input);
  const rowStyle = {
    alignItems: "center",
    background: "#1b1f23",
    display: "flex",
    fontSize: 24,
    height: 116,
    padding: "0 48px",
    width: "100%",
  } as const;

  const row = (entry: RankingPageEntry, index: number) => {
    const result =
      entry.formattedValue ??
      formatWcaResult(
        input.eventId,
        entry.best,
        input.rankingType === "average" ? "average" : "single",
      );
    const country = entry.countryName || "Country unavailable";
    const badge = entry.recordBadges?.[0];
    const competition = entry.competitionName || "";
    return (
      <div
        key={`${index}-${entry.personId}`}
        style={{
          ...rowStyle,
          background: index % 2 ? "#20272c" : "#1b1f23",
        }}
      >
        <div
          style={{
            color: "#aab8c1",
            display: "flex",
            fontVariantNumeric: "tabular-nums",
            width: 84,
          }}
        >
          {entry.rank}
        </div>
        <div
          style={{
            alignItems: "center",
            display: "flex",
            flex: 1,
            gap: 16,
            minWidth: 0,
          }}
        >
          <div
            style={{ display: "flex", fontSize: 34 }}
            aria-label={country}
          >
            {flagEmoji(entry.countryIso2 ?? "")}
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              minWidth: 0,
            }}
          >
            <div style={{ display: "flex", fontSize: 28 }}>
              {entry.personName}
            </div>
            <div style={{ color: "#aab8c1", display: "flex", fontSize: 20 }}>
              {entry.identitySubtitle || entry.personId}
            </div>
            {entry.identitySubtitle && entry.personId ? (
              <div style={{ color: "#aab8c1", display: "flex", fontSize: 18 }}>
                {entry.personId}
              </div>
            ) : null}
          </div>
        </div>
        <div
          style={{
            alignItems: "flex-end",
            display: "flex",
            flexDirection: "column",
            marginLeft: 24,
            minWidth: 260,
          }}
        >
          <div style={{ alignItems: "center", display: "flex", gap: 10 }}>
            {badge ? (
              <div
                style={{
                  background: badge === "WR" ? "#fb7185" : "#60a5fa",
                  borderRadius: 6,
                  color: "#fff",
                  display: "flex",
                  fontSize: 18,
                  padding: "3px 8px",
                }}
              >
                {badge}
              </div>
            ) : null}
            <div style={{ display: "flex", fontSize: 28 }}>{result}</div>
          </div>
          {competition ? (
            <div style={{ color: "#aab8c1", display: "flex", fontSize: 18 }}>
              {competition}
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  const imageResponse = new ImageResponse(
    <div
      style={{
        background: "#121417",
        color: "#f5f8fa",
        display: "flex",
        flexDirection: "column",
        fontFamily: "Arial",
        height: "100%",
        width: "100%",
      }}
    >
      {topResults.length > 0
        ? topResults.map(row)
        : [
            <div key="empty" style={{ ...rowStyle, color: "#aab8c1" }}>
              Ranking data is not available.
            </div>,
          ]}
    </div>,
    { height: 348, width: 1200 },
  );
  return new Response(await imageResponse.arrayBuffer(), {
    headers: imageResponse.headers,
  });
}

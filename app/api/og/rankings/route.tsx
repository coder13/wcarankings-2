import { ImageResponse } from "next/og";
import {
  formatRankingDocumentTitle,
  type RankingDocumentTitleInput,
} from "@/lib/ranking-document-title";
import { isEventId, isRankingEventId, isRankingType } from "@/lib/wca";
import { isMedalRankingType } from "@/lib/medal-rankings";
import { loadTopRankingResultLabels } from "@/services/rankings/page-metadata";

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
    medalType: isMedalRankingType(medal) ? medal : "overall",
  };
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const input = metadataInput(params);
  const topResults = await loadTopRankingResultLabels(params, input);
  const title = formatRankingDocumentTitle(input).replace(
    / \| WCA Rankings$/,
    "",
  );

  const imageResponse = new ImageResponse(
    <div
      style={{
        background: "#121417",
        color: "#fffcff",
        display: "flex",
        flexDirection: "column",
        fontFamily: "Arial",
        height: "100%",
        justifyContent: "space-between",
        padding: "64px 72px",
        width: "100%",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ color: "#aab4c3", display: "flex", fontSize: 28 }}>
          WCA Rankings
        </div>
        <div style={{ display: "flex", fontSize: 52, fontWeight: 700 }}>
          {title}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {topResults.length > 0 ? (
          topResults.map((result, index) => (
            <div
              key={`${index}-${result}`}
              style={{
                alignItems: "center",
                display: "flex",
                fontSize: 32,
                gap: 24,
              }}
            >
              <div style={{ color: "#77d6c6", display: "flex", width: 56 }}>
                {index + 1}
              </div>
              <div style={{ display: "flex" }}>{result}</div>
            </div>
          ))
        ) : (
          <div style={{ color: "#aab4c3", display: "flex", fontSize: 30 }}>
            Ranking data is not available.
          </div>
        )}
      </div>
    </div>,
    { height: 630, width: 1200 },
  );
  return new Response(await imageResponse.arrayBuffer(), {
    headers: imageResponse.headers,
  });
}

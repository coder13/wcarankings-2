import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RankingsExplorer } from "@/components/RankingsExplorer/RankingsExplorer";
import {
  formatRankingDocumentDescription,
  formatRankingDocumentTitle,
  type RankingDocumentTitleInput,
} from "@/lib/ranking-document-title";
import { isMedalRankingType } from "@/lib/medal-rankings";
import { isEventId, isRankingEventId, isRankingType } from "@/lib/wca";
import { getProjectionFeatureSwitch } from "@/lib/projection-feature-switch";
import { getCurrentRankingsMetadata } from "@/services/rankings/metadata";
import { loadTopRankingResultLabels } from "@/services/rankings/page-metadata";
import { getRegions } from "@/services/regions/service";

const LIVE_COMMIT_SHA =
  process.env.APP_COMMIT_SHA ?? process.env.GITHUB_SHA ?? "development";

export type RankingsSearchParams = Record<
  string,
  string | string[] | undefined
>;

type RankingsMetadataOptions = Omit<
  RankingDocumentTitleInput,
  "eventId" | "rankingType" | "medalType"
>;

function searchParam(searchParams: RankingsSearchParams, key: string) {
  const value = searchParams[key];
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export async function getRankingsPageMetadata({
  searchParams,
  ...options
}: {
  searchParams?: Promise<RankingsSearchParams>;
} & RankingsMetadataOptions): Promise<Metadata> {
  const params = searchParams ? await searchParams : {};
  const requestedEvent = searchParam(params, "eventId");
  const requestedResult = searchParam(params, "result");
  const requestedMedal = searchParam(params, "medal");
  const requestedActivityMetric = searchParam(params, "metric");
  let eventId = "333";
  if (options.personMedalRanking) {
    eventId = isEventId(requestedEvent) ? requestedEvent : "all";
  } else if (isRankingEventId(requestedEvent)) eventId = requestedEvent;
  const rankingType = isRankingType(requestedResult)
    ? requestedResult
    : "single";
  const medalType = isMedalRankingType(requestedMedal)
    ? requestedMedal
    : "overall";
  const personActivityMetric =
    options.personActivityMetric ??
    (["competitions", "countries", "rounds", "solves"].includes(
      requestedActivityMetric,
    )
      ? (requestedActivityMetric as
          | "competitions"
          | "countries"
          | "rounds"
          | "solves")
      : "competitions");

  const metadataInput = {
    ...options,
    eventId,
    rankingType,
    medalType,
  } satisfies RankingDocumentTitleInput;
  const topResults = await loadTopRankingResultLabels(
    new URLSearchParams(
      Object.entries(params).flatMap(([key, value]) =>
        Array.isArray(value) ? value.map((item) => [key, item]) : [[key, value ?? ""]],
      ),
    ),
    metadataInput,
  );
  const title = formatRankingDocumentTitle(metadataInput);
  const description = formatRankingDocumentDescription(
    metadataInput,
    topResults,
  );
  const imageParams = new URLSearchParams(
    Object.entries(params).flatMap(([key, value]) =>
      Array.isArray(value)
        ? value.map((item) => [key, item])
        : [[key, value ?? ""]],
    ),
  );
  imageParams.set("subject", metadataInput.subject);
  imageParams.set("result", metadataInput.rankingType);
  imageParams.set("competitionRanking", metadataInput.competitionRanking);
  imageParams.set("cityRanking", metadataInput.cityRanking);
  imageParams.set(
    "personCompetitionRanking",
    String(metadataInput.personCompetitionRanking === true),
  );
  imageParams.set(
    "personMedalRanking",
    String(metadataInput.personMedalRanking === true),
  );
  imageParams.set(
    "personPrStreakRanking",
    String(metadataInput.personPrStreakRanking === true),
  );
  imageParams.set("medal", metadataInput.medalType);
  if (metadataInput.year) imageParams.set("year", String(metadataInput.year));
  if (metadataInput.eventId === "all") imageParams.delete("eventId");
  else imageParams.set("eventId", metadataInput.eventId);
  const imageUrl = `/api/og/rankings?${imageParams.toString()}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: imageUrl, width: 1200, height: 348 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
    },
  };
}

export async function RankingsPage({
  searchParams,
  requiresYearlyRankings = false,
  requiresResultRankings = false,
  requiresCompetitionRankings = false,
  requiresPersonCompetitionRankings = false,
  requiresPersonActivityRankings = false,
  requiresPersonMedalRankings = false,
  requiresPersonPrStreakRankings = false,
  requiresCityRankings = false,
}: {
  searchParams?: Promise<RankingsSearchParams>;
  requiresYearlyRankings?: boolean;
  requiresResultRankings?: boolean;
  requiresCompetitionRankings?: boolean;
  requiresPersonCompetitionRankings?: boolean;
  requiresPersonActivityRankings?: boolean;
  requiresPersonMedalRankings?: boolean;
  requiresPersonPrStreakRankings?: boolean;
  requiresCityRankings?: boolean;
} = {}) {
  const featureSwitch = await getProjectionFeatureSwitch();
  const requestedEvent = searchParam(
    searchParams ? await searchParams : {},
    "eventId",
  );
  if (
    !featureSwitch.core ||
    (requiresYearlyRankings && !featureSwitch.yearlyPersonRankings) ||
    (requiresResultRankings && !featureSwitch.resultRankings) ||
    (requiresCompetitionRankings && !featureSwitch.competitionRankings) ||
    (requiresPersonCompetitionRankings &&
      !featureSwitch.personCompetitionRankings) ||
    (requiresPersonActivityRankings && !featureSwitch.personActivityRankings) ||
    (requiresPersonMedalRankings && !featureSwitch.personMedalRankings) ||
    (requiresPersonPrStreakRankings && !featureSwitch.personPrStreakRankings) ||
    (requiresCityRankings && !featureSwitch.cityEventStats) ||
    (["SOR", "sor-kinch"].includes(requestedEvent) && !featureSwitch.sumOfRanks)
  ) {
    notFound();
  }

  const [continents, countries, rankingsMetadata] = await Promise.all([
    getRegions("continent"),
    getRegions("country"),
    getCurrentRankingsMetadata(),
  ]);

  return (
    <RankingsExplorer
      initial={{
        regions: { continents, countries },
        release: {
          commitSha: LIVE_COMMIT_SHA,
          lastResultIngestAt: rankingsMetadata.fetchedAt,
        },
      }}
      options={{ showSubjectSwitch: true, showAllEventRankingOptions: true }}
    />
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RankingsExplorer } from "@/components/RankingsExplorer/RankingsExplorer";
import {
  formatRankingDocumentTitle,
  type RankingDocumentTitleInput,
} from "@/lib/ranking-document-title";
import { isMedalRankingType } from "@/lib/medal-rankings";
import { isEventId, isRankingEventId, isRankingType } from "@/lib/wca";
import { getProjectionFeatureSwitch } from "@/lib/projection-feature-switch";
import { getCurrentRankingsMetadata } from "@/services/rankings/metadata";
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

  return {
    title: formatRankingDocumentTitle({
      ...options,
      eventId,
      rankingType,
      medalType,
    }),
  };
}

export async function RankingsPage({
  searchParams,
  requiresYearlyRankings = false,
  requiresResultRankings = false,
  requiresCompetitionRankings = false,
  requiresPersonCompetitionRankings = false,
  requiresPersonMedalRankings = false,
  requiresCityRankings = false,
}: {
  searchParams?: Promise<RankingsSearchParams>;
  requiresYearlyRankings?: boolean;
  requiresResultRankings?: boolean;
  requiresCompetitionRankings?: boolean;
  requiresPersonCompetitionRankings?: boolean;
  requiresPersonMedalRankings?: boolean;
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
    (requiresPersonMedalRankings && !featureSwitch.personMedalRankings) ||
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

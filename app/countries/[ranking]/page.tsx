import { notFound } from "next/navigation";
import {
  getRankingsPageMetadata,
  RankingsPage,
  type RankingsSearchParams,
} from "@/app/RankingsPage";
import {
  COUNTRY_RANKING_OPTIONS,
  type CountryRanking,
} from "@/components/RankingsExplorer/helpers/rankingModes";

const COUNTRY_RANKINGS = new Set<string>(
  COUNTRY_RANKING_OPTIONS.map(({ value }) => value),
);

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ ranking: string }>;
  searchParams: Promise<RankingsSearchParams>;
}) {
  const { ranking } = await params;
  return getRankingsPageMetadata({
    searchParams,
    subject: "countries",
    competitionRanking: "best-result",
    cityRanking: "fastest-single",
    countryRanking: COUNTRY_RANKINGS.has(ranking)
      ? (ranking as CountryRanking)
      : "fastest-single",
    year: null,
    personCompetitionRanking: false,
  });
}

export default async function CountryRankingPage({
  params,
  searchParams,
}: {
  params: Promise<{ ranking: string }>;
  searchParams: Promise<RankingsSearchParams>;
}) {
  const { ranking } = await params;
  if (!COUNTRY_RANKINGS.has(ranking)) notFound();
  return <RankingsPage searchParams={searchParams} requiresCountryRankings />;
}

import { notFound } from "next/navigation";
import {
  getRankingsPageMetadata,
  RankingsPage,
  type RankingsSearchParams,
} from "@/app/RankingsPage";

const CITY_RANKINGS = new Set([
  "fastest-single",
  "fastest-average",
  "competitors",
  "competitions",
  "solves",
]);

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
    subject: "cities",
    competitionRanking: "best-result",
    cityRanking: CITY_RANKINGS.has(ranking)
      ? (ranking as
          | "fastest-single"
          | "fastest-average"
          | "competitors"
          | "competitions"
          | "solves")
      : "fastest-single",
    year: null,
    personCompetitionRanking: false,
  });
}

export default async function CityRankingPage({
  params,
  searchParams,
}: {
  params: Promise<{ ranking: string }>;
  searchParams: Promise<RankingsSearchParams>;
}) {
  const { ranking } = await params;
  if (!CITY_RANKINGS.has(ranking)) notFound();
  return <RankingsPage searchParams={searchParams} requiresCityRankings />;
}

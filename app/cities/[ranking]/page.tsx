import { notFound } from "next/navigation";
import { RankingsPage, type RankingsSearchParams } from "@/app/RankingsPage";

const CITY_RANKINGS = new Set([
  "fastest-single",
  "fastest-average",
  "competitors",
  "competitions",
  "solves",
]);

export const dynamic = "force-dynamic";

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

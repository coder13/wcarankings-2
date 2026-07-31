import { notFound } from "next/navigation";
import { RankingsPage, type SearchParams } from "@/app/RankingsPage";

const CITY_RANKINGS = new Set([
  "competitions",
  "competitors",
  "solves",
  "fastest-single",
  "fastest-average",
]);

export const dynamic = "force-dynamic";

export default async function CityRankingPage({
  params,
  searchParams,
}: {
  params: Promise<{ ranking: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { ranking } = await params;
  if (!CITY_RANKINGS.has(ranking)) notFound();
  return RankingsPage({
    searchParams,
    pathname: `/cities/${ranking}`,
    initialSubject: "cities",
    initialCityRanking: ranking as "competitions" | "competitors" | "solves" | "fastest-single" | "fastest-average",
  });
}

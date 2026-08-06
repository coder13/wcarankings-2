import { notFound } from "next/navigation";
import {
  getRankingsPageMetadata,
  RankingsPage,
  type RankingsSearchParams,
} from "@/app/RankingsPage";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ year: string }>;
  searchParams: Promise<RankingsSearchParams>;
}) {
  const { year } = await params;
  return getRankingsPageMetadata({
    searchParams,
    subject: "people",
    competitionRanking: "best-result",
    cityRanking: "fastest-single",
    year: Number(year),
    personCompetitionRanking: false,
  });
}

export default async function YearlyPersonsPage({
  params,
  searchParams,
}: {
  params: Promise<{ year: string }>;
  searchParams: Promise<RankingsSearchParams>;
}) {
  const { year } = await params;
  if (!/^\d{4}$/.test(year)) notFound();
  return <RankingsPage searchParams={searchParams} requiresYearlyRankings />;
}
